#!/usr/bin/env python3
"""Shared stdlib-only transaction journal. No key material or unlocked live accounts.

An external Clef-compatible signer owns signing policy. Signed public transactions
are fsync'd before submission, so a lost RPC response cannot create a second nonce.
"""
import fcntl
import hashlib
import ipaddress
import json
import os
from pathlib import Path
import subprocess
import time
import urllib.request
import urllib.parse


class Halt(RuntimeError):
    pass


class RPCUnavailable(Halt):
    """Transient transport failure; a supervisor may retry the durable journal."""


class Pending(Halt):
    pass


class Reverted(Halt):
    pass


def log(event, **fields):
    print(json.dumps({"time": int(time.time()), "event": event, **fields}), flush=True)


def number(value):
    return int(value, 16) if isinstance(value, str) and value.startswith("0x") else int(value)


def local_fork(config, rpc):
    """Only an explicit loopback Anvil fork may submit with a mainnet chain ID."""
    if not config.get("localFork"):
        return False
    host = urllib.parse.urlparse(config["rpcUrl"]).hostname
    try:
        loopback = host == "localhost" or ipaddress.ip_address(host or "").is_loopback
    except ValueError:
        loopback = False
    if not loopback:
        raise Halt("localFork requires a loopback RPC URL")
    if config.get("signerRpc") != config["rpcUrl"]:
        raise Halt("localFork requires signerRpc to be the same local Anvil URL")
    if "anvil" not in rpc.call("web3_clientVersion", []).lower():
        raise Halt("localFork requires an Anvil client")
    info = rpc.call("anvil_nodeInfo", [])
    if not isinstance(info, dict):
        raise Halt("localFork requires Anvil node information")
    return True


def cast(*args):
    p = subprocess.run(["cast", *map(str, args)], capture_output=True, text=True, timeout=40)
    if p.returncode:
        # Do not echo arbitrary subprocess output (signers/RPCs may contain credentials).
        raise Halt("cast command failed: " + str(args[0]))
    text = p.stdout.strip()
    if "--json" in args:
        data = json.loads(text)
        if isinstance(data, dict) and "schema_version" in data:
            if not data.get("success"):
                raise Halt("cast decoding failed")
            data = data["data"]
        return data
    return text


def calldata(signature, *args):
    def arg(x):
        if isinstance(x, bool):
            return str(x).lower()
        if isinstance(x, (list, tuple)):
            return "[" + ",".join(map(arg, x)) + "]"
        return str(x)
    return cast("calldata", signature, *map(arg, args))


class Rpc:
    def __init__(self, url):
        self.url = url

    def call(self, method, params):
        request = urllib.request.Request(
            self.url, json.dumps({"jsonrpc": "2.0", "id": 1, "method": method, "params": params}).encode(),
            {"Content-Type": "application/json"})
        try:
            with urllib.request.urlopen(request, timeout=20) as response:
                result = json.load(response)
        except Exception as exc:
            raise RPCUnavailable("RPC unavailable: " + method) from exc
        if "error" in result:
            error = result["error"]
            # Preserve revert bytes, never reflect a provider URL or auth message.
            data = error.get("data")
            if not isinstance(data, str) or not data.startswith("0x"):
                data = None
            raise Halt(f"RPC rejected {method}: code={error.get('code')} data={data}")
        return result["result"]


class Engine:
    def __init__(self, config, state_path, live=False, rpc=None):
        self.config = config
        self.sender = config["sender"]
        self.live = live
        self.rpc = rpc or Rpc(config["rpcUrl"])
        self.path = Path(state_path).resolve()
        repo = Path(__file__).resolve().parents[1]
        if self.path.is_relative_to(repo):
            raise Halt("Store operational state outside the repository")
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.lock = open(str(self.path) + ".lock", "a+")
        try:
            fcntl.flock(self.lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            self.lock.close()
            raise Halt("Another worker holds this state lock") from None
        try:
            chain = number(self.rpc.call("eth_chainId", []))
            if chain != int(config["chainId"]):
                raise Halt("RPC chain does not match configuration")
            is_fork = local_fork(config, self.rpc)
            if live and chain not in (31337, 11155111) and not is_fork:
                raise Halt("Live submission is restricted to local test chain or Sepolia")
            if live and (not config.get("signerRpc") or not config.get("dedicatedSender")):
                raise Halt("Live mode needs external signerRpc and exclusive dedicatedSender acknowledgement")
            if live and config.get("signerMethod", "account_signTransaction") != "account_signTransaction" and chain != 31337 and not is_fork:
                raise Halt("Live Sepolia requires a Clef-compatible external signer")
            if live and chain == 11155111 and not is_fork:
                code = self.rpc.call("eth_getCode", [self.sender, "latest"])
                if code not in ("0x", "0x0"):
                    raise Halt("Live Sepolia requires a dedicated EOA without code or EIP-7702 delegation")
            # A single sender cannot safely operate separate journals concurrently.
            # Keep the lock inode (do not unlink it on exit). O_NOFOLLOW prevents
            # an attacker replacing the fixed /tmp pathname with a symlink.
            sender_key = hashlib.sha256(f"{chain}:{self.sender.lower()}".encode()).hexdigest()
            fd = os.open(f"/tmp/sorphera-sender-{os.getuid()}-{sender_key}.lock",
                         os.O_CREAT | os.O_RDWR | os.O_NOFOLLOW, 0o600)
            self.sender_lock = os.fdopen(fd, "a+")
            try:
                fcntl.flock(self.sender_lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except BlockingIOError:
                raise Halt("Another worker holds this sender lock") from None
            self.state = json.loads(self.path.read_text()) if self.path.exists() else {
                "version": 1, "chainId": chain, "sender": self.sender.lower(),
                "transactions": {}, "checkpoints": {}, "spentCeiling": 0}
            if self.state["chainId"] != chain or self.state["sender"] != self.sender.lower():
                raise Halt("Journal chain/sender mismatch")
            self.save()
        except Exception:
            if hasattr(self, "sender_lock"):
                self.sender_lock.close()
            self.lock.close()
            raise

    def __enter__(self):
        return self

    def __exit__(self, *_):
        self.sender_lock.close()
        self.lock.close()

    def save(self):
        temp = str(self.path) + ".tmp"
        with open(temp, "w") as out:
            os.chmod(temp, 0o600)
            json.dump(self.state, out, indent=2)
            out.write("\n")
            out.flush()
            os.fsync(out.fileno())
        os.replace(temp, self.path)
        fd = os.open(self.path.parent, os.O_DIRECTORY)
        try:
            os.fsync(fd)
        finally:
            os.close(fd)

    def read(self, to, signature, *args):
        result = self.rpc.call("eth_call", [{"to": to, "data": calldata(signature, *args)}, "latest"])
        return cast("abi-decode", "--json", signature, result)

    def checkpoint(self, name, block):
        self.state["checkpoints"][name] = {"number": number(block["number"]), "hash": block["hash"]}
        self.save()

    def reconcile(self):
        """Fail closed on reorganized receipts; never silently replay accepted requests."""
        for checkpoint in self.state["checkpoints"].values():
            canonical = self.rpc.call("eth_getBlockByNumber", [hex(checkpoint["number"]), False])
            if not canonical or canonical["hash"] != checkpoint["hash"]:
                raise Halt("REORG: checkpoint orphaned; stop and reconcile canonical state with operator")
        for item in self.state["transactions"].values():
            receipt = item.get("receipt")
            if receipt:
                canonical = self.rpc.call("eth_getBlockByNumber", [receipt["blockNumber"], False])
                if not canonical or canonical["hash"] != receipt["blockHash"]:
                    raise Halt("REORG: journal receipt orphaned; stop and reconcile canonical state with operator")
        for item in self.state["transactions"].values():
            if not item.get("receipt"):
                self._receipt(item)

    def recover_checkpoints(self):
        """Rescan event-only reorgs; never erase or replay journaled transactions."""
        for item in self.state["transactions"].values():
            receipt = item.get("receipt")
            if not receipt:
                raise Halt("Checkpoint recovery requires every journaled transaction to be confirmed")
            canonical = self.rpc.call("eth_getBlockByNumber", [receipt["blockNumber"], False])
            if not canonical or canonical["hash"] != receipt["blockHash"]:
                raise Halt("REORG: own transaction orphaned; checkpoint-only recovery is unsafe")
        self.state["checkpoints"] = {}
        if "keeper" in self.state:
            last = self.state["keeper"].get("last", {})
            self.state["keeper"] = {"rounds": {}, "urgent": {}, "cursors": {}, "last": last}
        self.save()
        log("checkpoints_reset", action="rescan from configured deploymentBlock; transaction journal retained")

    def _receipt(self, item):
        receipt = self.rpc.call("eth_getTransactionReceipt", [item["hash"]])
        if receipt:
            block = self.rpc.call("eth_getBlockByNumber", [receipt["blockNumber"], False])
            if not block or block["hash"] != receipt["blockHash"]:
                raise Pending("Receipt not canonical yet")
            head = number(self.rpc.call("eth_blockNumber", []))
            if head - number(receipt["blockNumber"]) + 1 < int(self.config["confirmations"]):
                raise Pending("Waiting for transaction confirmations")
            item["receipt"] = receipt
            item["status"] = "confirmed" if number(receipt["status"]) == 1 else "reverted"
            self.save()
            log(item["status"], id=item["id"], txHash=item["hash"], block=number(receipt["blockNumber"]))
            if item["status"] == "reverted":
                raise Reverted("Transaction reverted; reconcile application state before explicitly retrying")
            return receipt
        nonce = number(item["tx"]["nonce"])
        latest = number(self.rpc.call("eth_getTransactionCount", [self.sender, "latest"]))
        if latest > nonce:
            raise Halt("REPLACED: nonce consumed by unknown transaction; verify/adopt its hash before proceeding")
        # Identical bytes are safe to rebroadcast after a lost submission response. Never bump/re-sign.
        tx = self.rpc.call("eth_getTransactionByHash", [item["hash"]])
        if not tx and self.live:
            if not item.get("raw"):
                raise Halt("Adopted replacement disappeared; obtain its signed bytes or reconcile with operator")
            got = self.rpc.call("eth_sendRawTransaction", [item["raw"]])
            if got.lower() != item["hash"].lower():
                raise Halt("RPC returned unexpected transaction hash")
        raise Pending("Transaction pending; retain nonce and signed bytes")

    def adopt(self, action_id, tx_hash):
        """Adopt an operator fee replacement only if sender/nonce/call/value are identical."""
        item = self.state["transactions"][action_id]
        tx = self.rpc.call("eth_getTransactionByHash", [tx_hash])
        if not tx:
            raise Halt("Replacement transaction not found")
        original = item["tx"]
        for field in ("from", "to"):
            if (tx.get(field) or "").lower() != (original.get(field) or "").lower():
                raise Halt("Replacement changed transaction identity")
        for field in ("nonce", "value"):
            if number(tx[field]) != number(original[field]):
                raise Halt("Replacement changed nonce/value")
        if tx.get("input", "0x").lower() != original["data"].lower():
            raise Halt("Replacement changed calldata")
        gas = number(tx["gas"])
        fee = number(tx.get("maxFeePerGas") or tx["gasPrice"])
        cost = gas * fee + number(tx["value"])
        previous_cost = item.get("costCeiling", number(original["gas"]) * number(original["gasPrice"]) + number(original["value"]))
        extra_cost = max(0, cost - previous_cost)
        if (gas > int(self.config["maxGas"]) or fee > int(self.config["maxFeePerGas"])
                or cost > int(self.config["maxTxCost"])
                or self.state["spentCeiling"] + extra_cost > int(self.config["maxTotalCost"])):
            raise Halt("Replacement exceeds configured gas/spend ceiling")
        # A manually signed replacement is never rebroadcast without its bytes.
        receipt = self.rpc.call("eth_getTransactionReceipt", [tx_hash])
        if not receipt:
            raise Pending("Adopt only after replacement is mined")
        old_hash = item["hash"]
        item["hash"] = tx_hash
        item["replaces"] = old_hash
        item["raw"] = None
        item["costCeiling"] = max(cost, previous_cost)
        self.state["spentCeiling"] += extra_cost
        item.pop("receipt", None)
        self.save()
        return self._receipt(item)

    def retry_reverted(self, action_id):
        self.reconcile()
        item = self.state["transactions"][action_id]
        if item.get("status") != "reverted":
            raise Halt("Only a confirmed revert can be archived for retry")
        self.state.setdefault("failedAttempts", []).append(item)
        del self.state["transactions"][action_id]
        self.save()

    def transact(self, action):
        self.reconcile()
        key = action["id"]
        normalized = {"to": action.get("to"), "data": action["data"], "value": int(action.get("value", 0))}
        fingerprint = hashlib.sha256(json.dumps(normalized, sort_keys=True).encode()).hexdigest()
        existing = self.state["transactions"].get(key)
        if existing:
            if existing["fingerprint"] != fingerprint:
                raise Halt("Action changed after journaling; inspect state")
            if existing.get("receipt"):
                if existing["status"] == "reverted":
                    raise Reverted("Previously reverted action needs explicit recovery")
                return existing["receipt"]
            return self._receipt(existing)
        tx = {"from": self.sender, "data": action["data"], "value": hex(normalized["value"])}
        if action.get("to"):
            tx["to"] = action["to"]
        self.rpc.call("eth_call", [tx, "latest"])
        estimate = number(self.rpc.call("eth_estimateGas", [tx]))
        gas = (estimate * 125 + 99) // 100
        price = number(self.rpc.call("eth_gasPrice", []))
        fee = (price * 120 + 99) // 100
        cost = gas * fee + normalized["value"]
        cfg = self.config
        if gas > int(cfg["maxGas"]) or fee > int(cfg["maxFeePerGas"]) or cost > int(cfg["maxTxCost"]):
            raise Halt("Gas/transaction spend ceiling exceeded")
        if self.state["spentCeiling"] + cost > int(cfg["maxTotalCost"]):
            raise Halt("Journal cumulative spend ceiling exceeded")
        balance = number(self.rpc.call("eth_getBalance", [self.sender, "latest"]))
        if balance < cost + int(cfg["minimumBalance"]):
            raise Halt("FUNDING ALERT: sender balance below transaction plus reserve")
        log("transaction_plan", id=key, label=action.get("label", key), to=action.get("to"),
            gas=gas, maximumCost=cost, live=self.live)
        if not self.live:
            return None
        latest = number(self.rpc.call("eth_getTransactionCount", [self.sender, "latest"]))
        pending = number(self.rpc.call("eth_getTransactionCount", [self.sender, "pending"]))
        if latest != pending:
            raise Halt("Sender has an unknown pending nonce; use a dedicated sender")
        tx.update(nonce=hex(latest), gas=hex(gas), gasPrice=hex(fee), chainId=hex(cfg["chainId"]))
        signer = Rpc(cfg["signerRpc"])
        signed = signer.call(cfg.get("signerMethod", "account_signTransaction"), [tx])
        raw = signed.get("raw") if isinstance(signed, dict) else signed
        decoded = cast("decode-transaction", "--json", raw)
        if isinstance(decoded, str):
            decoded = json.loads(decoded)
        for field in ("nonce", "gas", "gasPrice", "value", "chainId"):
            if number(decoded[field]) != number(tx[field]):
                raise Halt("External signer changed transaction field: " + field)
        if decoded["signer"].lower() != self.sender.lower() or (decoded.get("to") or "").lower() != (tx.get("to") or "").lower() or decoded["input"].lower() != tx["data"].lower():
            raise Halt("External signer changed sender/target/calldata")
        item = {"id": key, "fingerprint": fingerprint, "tx": tx, "raw": raw,
                "hash": decoded["hash"], "status": "signed", "created": int(time.time()), "costCeiling": cost}
        self.state["transactions"][key] = item
        self.state["spentCeiling"] += cost
        self.save()  # Durable intent before the first possible broadcast.
        got = self.rpc.call("eth_sendRawTransaction", [raw])
        if got.lower() != item["hash"].lower():
            raise Halt("RPC returned unexpected transaction hash")
        return self._receipt(item)
