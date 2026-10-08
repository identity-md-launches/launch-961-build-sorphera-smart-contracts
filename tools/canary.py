#!/usr/bin/env python3
"""Resumable, company-authorized Sepolia VRF canary. Python stdlib + Foundry only."""
import argparse
import functools
import itertools
import json
import subprocess
from pathlib import Path

COORDINATOR = "0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B"
KEY = "0x787d74caea10b2b357790d5b5247c2f63d1d91572a9846f780606e4d953677ae"
ROUND = "getRound(uint8,uint256)((uint8,uint256,uint256,uint256,uint256,uint256,uint256,address,uint256,uint256,uint256,uint256,uint256,uint8[3],uint8,uint32,uint256,uint256,uint256,uint256,uint256,uint256))"
FULFILLED = "RandomWordsFulfilled(uint256,uint256,uint256,uint96,bool,bool,bool)"
REQUESTED = "RandomWordsRequested(bytes32,uint256,uint256,uint256,uint16,uint32,uint32,bytes,address)"
CREATED = "SubscriptionCreated(uint256,address)"


class Waiting(Exception):
    """A safe, restartable pause, including accepted requests awaiting the oracle."""


def command(*args):
    return subprocess.check_output(list(args), text=True).strip()


def calldata(signature, *args):
    return command("cast", "calldata", signature, *map(str, args))


@functools.lru_cache(maxsize=8)
def topic(signature):
    return command("cast", "keccak", signature)


def scalar(values):
    return values[0] if isinstance(values, list) else values


def picks():
    return [(a, b, c, bonus) for a, b, c in itertools.combinations(range(1, 21), 3)
            for bonus in range(1, 6)]


def batch(start, total, size=100):
    combinations = picks()
    return combinations[start:min(start + size, total)] if total == 5700 else [
        combinations[i % 5700] for i in range(start, min(start + size, total))]


def encoded_picks(items):
    return "[" + ",".join(f"([{a},{b},{c}],{bonus})" for a, b, c, bonus in items) + "]"


def validate(config):
    if config.get("localFork"):
        raise ValueError("live-sepolia cannot use localFork simulation or label it live evidence")
    if config.get("chainId") != 11155111:
        raise ValueError("canary requires Sepolia chainId 11155111")
    if config.get("coordinator", COORDINATOR).lower() != COORDINATOR.lower():
        raise ValueError("published Sepolia coordinator required")
    if config.get("keyHash", KEY).lower() != KEY.lower():
        raise ValueError("published Sepolia key required")
    price = int(config.get("ticketPriceWei", 1000))
    if price < 10 or price % 10 or price > 10**12:
        raise ValueError("canary ticket price must be a multiple of 10 wei, at most 1e12 wei")
    if int(config.get("subscriptionMinimum") or 0) <= 0:
        raise ValueError("company must supply a nonzero subscriptionMinimum reserve")
    if config.get("subscription") is not None and int(config["subscription"]) <= 0:
        raise ValueError("subscription must be a real supplied ID or null to create one")
    if not 150000 <= int(config.get("callbackGas", 0)) <= 2500000:
        raise ValueError("callbackGas must satisfy production bounds")
    if not 3 <= int(config.get("requestConfirmations", 0)) <= 200:
        raise ValueError("requestConfirmations must satisfy production bounds")
    if not 7200 <= int(config.get("cutoffDelaySeconds", 21600)) <= 604800:
        raise ValueError("allow at least two hours and at most one week for coverage purchases")


def offline_plan(config):
    price = int(config.get("ticketPriceWei", 1000))
    return {"mode": "dry-run", "broadcast": False, "liveEvidence": "NOT RUN",
            "chainId": 11155111, "coordinator": COORDINATOR,
            "dependencies": "controlled mock FWA; production Sorphera and real VRF coordinator",
            "ticketPriceWei": price, "tickets": {"ETH": 5700, "NFT": 11400},
            "ticketBatches": 171, "ticketValueWei": price * 17100,
            "stages": ["deploy controlled mocks/controller and production router/factory/lottery",
                       "bind; create/use company subscription; register and check funding",
                       "freeze small test price; validate; open two rounds",
                       "atomic enable/buy/disable batches; synthetic FWA acquisition/settlement",
                       "wait cutoff; request two draws; wait actual coordinator fulfillments",
                       "finalize; independent NFT tie request; wait fulfillment; finalize tie",
                       "claim ETH and NFT; collect canonical coordinator billing/callback receipts"],
            "required": ["company test-wallet authorization", "dedicated company sender and secure signer",
                         "Sepolia RPC and test ETH for bounded gas/funding",
                         "company subscription owner access or create permission and billing reserve"]}


class Canary:
    def __init__(self, engine, config, max_actions=5):
        self.e, self.cfg, self.limit, self.count = engine, config, max_actions, 0
        self.s = engine.state.setdefault("canary", {"addresses": {}, "completed": {}, "evidence": {}})
        self.a = self.s["addresses"]
        evidence_kind = "live-sepolia" if engine.live and not config.get("localFork") else "simulation"
        if self.s.get("evidenceKind", evidence_kind) != evidence_kind:
            raise ValueError("cannot reuse a simulation journal for live canary evidence")
        self.s["evidenceKind"] = evidence_kind

    def read(self, address, signature, *args):
        return self.e.read(address, signature, *args)

    def one(self, address, signature, *args):
        return scalar(self.read(address, signature, *args))

    def tx(self, label, address, signature=None, *args, value=0, data=None):
        # Revisit completed journal entries to let the shared engine detect receipt reorgs.
        old = label in self.s["completed"]
        if not old and self.count >= self.limit:
            raise Waiting("action limit reached; repeat the same command to continue")
        receipt = self.e.transact({"id": "canary:" + label, "label": label, "to": address,
                                   "data": data or calldata(signature, *args), "value": value})
        if receipt is None:
            raise Waiting("dry-run: next action planned; no transaction submitted")
        if not old:
            self.count += 1
        self.s["completed"][label] = receipt["transactionHash"]
        self.e.save()
        return receipt

    def admin(self, label, target, signature, *args):
        return self.tx(label, self.a["controller"], "execute(address,bytes)", target,
                       calldata(signature, *args))

    def deploy(self, name, artifact, constructor, *args):
        bytecode = command("forge", "inspect", artifact, "bytecode")
        encoded = command("cast", "abi-encode", constructor, *map(str, args))
        receipt = self.tx("deploy:" + name, None, data=bytecode + encoded[2:])
        address = receipt.get("contractAddress")
        if not address or int(address, 16) == 0:
            raise ValueError("confirmed deployment has no contract address")
        if self.e.rpc.call("eth_getCode", [address, "latest"]) in ("0x", "0x0"):
            raise ValueError("deployment code missing")
        if name in self.a and self.a[name].lower() != address.lower():
            raise ValueError("deployment receipt changed; operator must reconcile dependencies")
        self.a[name] = address
        self.s.setdefault("startBlock", int(receipt["blockNumber"], 16))
        self.e.save()

    def setup(self):
        self.deploy("dependencies", "script/CanaryDependencies.sol:CanaryDependencies", "constructor(address)", self.e.sender)
        for name in ("controller", "nft", "token", "rewards", "helper", "pool"):
            self.a[name] = self.one(self.a["dependencies"], name + "()(address)")
        self.deploy("router", "src/SorpheraRouter.sol:SorpheraRouter", "constructor(address)", self.a["controller"])
        self.deploy("factory", "src/SorpheraVaultFactory.sol:SorpheraVaultFactory", "constructor(address,address)", self.a["router"], self.a["controller"])
        self.deploy("lottery", "src/Sorphera.sol:Sorphera", "constructor(address,address,address)", self.a["controller"], self.a["factory"], COORDINATOR)
        self.admin("bind-factory", self.a["factory"], "setLottery(address)", self.a["lottery"])
        self.admin("bind-router", self.a["router"], "configure(address,address)", self.a["pool"], self.a["helper"])
        sub = self.s.get("subscription", self.cfg.get("subscription"))
        if sub is None:
            receipt = self.tx("create-subscription", COORDINATOR, "createSubscription()")
            matches = [log for log in receipt["logs"] if log["address"].lower() == COORDINATOR.lower()
                       and log["topics"][0].lower() == topic(CREATED).lower()]
            if len(matches) != 1:
                raise ValueError("missing unique coordinator SubscriptionCreated event")
            sub = int(matches[0]["topics"][1], 16)
        self.s["subscription"] = int(sub)
        self.e.save()
        subscription = self.read(COORDINATOR, "getSubscription(uint256)(uint96,uint96,uint64,address,address[])", sub)
        if subscription[3].lower() != self.e.sender.lower():
            raise ValueError("company sender must own the canary subscription")
        if self.a["lottery"].lower() not in [a.lower() for a in subscription[4]]:
            self.tx("register-consumer", COORDINATOR, "addConsumer(uint256,address)", sub, self.a["lottery"])
        topup = int(self.cfg.get("nativeTopUpWei", 0))
        if topup:
            if not self.cfg.get("nativePayment", True):
                raise ValueError("nativeTopUpWei is only supported for native billing")
            self.tx("initial-native-funding", COORDINATOR, "fundSubscriptionWithNative(uint256)", sub, value=topup)
        if "validate" not in self.s["completed"]:
            self.funding()
        if "cutoff" not in self.s:
            block = self.e.rpc.call("eth_getBlockByNumber", ["latest", False])
            self.s["cutoff"] = int(block["timestamp"], 16) + int(self.cfg.get("cutoffDelaySeconds", 21600))
            self.e.save()
        price, cutoff = int(self.cfg.get("ticketPriceWei", 1000)), self.s["cutoff"]
        for game in (0, 1):
            self.admin(f"rules:{game}", self.a["lottery"], "configureRules(uint8,(uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint256))",
                       game, f"({price},{cutoff},60,3600,1000,1000,1,0)")
        native = str(self.cfg.get("nativePayment", True)).lower()
        config = f"({sub},{KEY},{self.cfg['requestConfirmations']},{self.cfg['callbackGas']},{native})"
        self.admin("randomness", self.a["lottery"], "configureRandomness((uint256,bytes32,uint16,uint32,bool))", config)
        reserve = int(self.cfg["subscriptionMinimum"])
        self.admin("reserve", self.a["lottery"], "configureVRFReserve(uint96,uint96)",
                   0 if self.cfg.get("nativePayment", True) else reserve,
                   reserve if self.cfg.get("nativePayment", True) else 0)
        self.admin("validate", self.a["lottery"], "validateLaunch()")

    def funding(self):
        s = self.read(COORDINATOR, "getSubscription(uint256)(uint96,uint96,uint64,address,address[])", self.s["subscription"])
        balance = int(s[1 if self.cfg.get("nativePayment", True) else 0])
        if balance < int(self.cfg["subscriptionMinimum"]):
            raise Waiting("FUNDING ALERT: company must top up its existing subscription; no accepted request is replaced")

    def round(self, game):
        return self.one(self.a["lottery"], ROUND, game, 1)

    def entries(self, game):
        r = self.round(game)
        if int(r[0]) == 0:
            self.tx(f"open:{game}", self.a["lottery"], "openRound(uint8)", game)
            r = self.round(game)
        sold, total = int(r[8]), 5700 if game == 0 else 11400
        if sold > total or sold % 100:
            raise ValueError("unexpected test ticket inventory; do not guess a recovery cursor")
        while sold < total:
            items = batch(sold, total)
            self.tx(f"buy:{game}:{sold}", self.a["controller"], "buyBatch(address,uint8,uint256,(uint8[3],uint8)[])",
                    self.a["lottery"], game, 1, encoded_picks(items), value=len(items) * int(r[2]))
            updated = self.round(game)
            if int(updated[8]) != sold + len(items):
                raise ValueError("confirmed ticket count differs from planned coverage")
            sold = int(updated[8])
        vault = r[7]
        self.a[f"vault{game}"] = vault
        self.e.save()
        count = int(self.one(vault, "requestCount()(uint256)"))
        if count == 0:
            self.tx(f"acquire:{game}", vault, "acquire(uint256,uint256)", 1, int(r[4]))
        request = int(self.one(vault, "requestAt(uint256)(uint256)", 0))
        acquisition = self.one(self.a["pool"], "acquisitions(uint256)((address,uint256,uint256,uint256,uint8))", request)
        if int(acquisition[4]) == 1:
            self.tx(f"mock-allocate:{game}", self.a["pool"], "allocate(uint256)", request)
        if int(self.one(vault, "requestState(uint256)(uint8)", request)) != 2:
            self.tx(f"settle:{game}", vault, "settle(uint256)", request)

    def advance(self, game):
        lottery = self.a["lottery"]
        r = self.round(game)
        status = int(r[0])
        if status in (1, 2):
            now = int(self.e.rpc.call("eth_getBlockByNumber", ["latest", False])["timestamp"], 16)
            if now < int(r[5]):
                return False
            self.funding()
            self.tx(f"draw:{game}", lottery, "requestDraw(uint8,uint256)", game, 1)
        r = self.round(game)
        if int(r[0]) == 4:
            self.tx(f"finalize:{game}", lottery, "finalize(uint8,uint256)", game, 1)
        r = self.round(game)
        if int(r[0]) == 8:
            self.funding()
            self.tx("tie-request", lottery, "requestTieBreak(uint8,uint256)", 1, 1)
        r = self.round(game)
        if int(r[0]) == 10:
            self.tx("tie-finalize", lottery, "finalizeTieBreak(uint8,uint256)", 1, 1)
        r = self.round(game)
        if int(r[0]) in (6, 7):
            raise ValueError("guaranteed-coverage canary unexpectedly rolled/cancelled")
        if int(r[0]) != 5:
            return False
        ticket = int(r[17]) if game == 1 else int(self.one(lottery, "matchingTicket(uint8,uint256,uint32,uint256)(uint256)", game, 1, int(r[15]), 0))
        claimed = int(self.one(lottery, "claimedETH(uint8,uint256,uint256)(uint256)", game, int(r[1]), ticket))
        cash_label = f"claim-cash:{game}"
        if claimed == 0 or cash_label not in self.s["completed"]:
            if claimed and "canary:" + cash_label not in self.e.state.get("transactions", {}):
                raise ValueError("cash claim occurred outside journal; canonical claim evidence must be reconciled")
            self.admin(f"claim-cash:{game}", lottery, "claimETH(uint8,uint256,uint256[],address)", game, 1, f"[{ticket}]", self.e.sender)
        if game == 1:
            asset = self.read(self.a["vault1"], "assets(uint256)(address,uint256,uint256,uint256,bool)", 0)
            if not asset[4] or "claim-NFT" not in self.s["completed"]:
                if asset[4] and "canary:claim-NFT" not in self.e.state.get("transactions", {}):
                    raise ValueError("NFT claim occurred outside journal; canonical claim evidence must be reconciled")
                self.admin("claim-NFT", self.a["vault1"], "claimNFTs(uint256,uint256[],address)", ticket, "[0]", self.e.sender)
            if self.one(asset[0], "ownerOf(uint256)(address)", asset[1]).lower() != self.e.sender.lower():
                raise ValueError("NFT claim did not deliver custody")
        self.s["evidence"][f"game{game}"] = {"drawRequestId": str(r[10]), "tieRequestId": str(r[20]),
                                                "matches": int(r[16]), "winningTicket": ticket,
                                                "claimsVerified": True,
                                                "cashClaimTx": self.s["completed"][cash_label],
                                                "nftClaimTx": self.s["completed"].get("claim-NFT") if game == 1 else None}
        self.e.save()
        return True

    def collect(self):
        """Bounded canonical log scans preserve actual oracle receipts, billing and success."""
        head = int(self.e.rpc.call("eth_blockNumber", []), 16) - int(self.cfg.get("confirmations", 2))
        start = int(self.s.get("logCursor", self.s["startBlock"]))
        expected = self.s.get("logCheckpoint")
        if expected:
            block = self.e.rpc.call("eth_getBlockByNumber", [hex(expected["number"]), False])
            if not block or block["hash"].lower() != expected["hash"].lower():
                self.s["logCursor"] = self.s["startBlock"]
                self.s.pop("logCheckpoint", None)
                self.s["evidence"].pop("oracle", None)
                self.e.save()
                raise Waiting("oracle evidence reorganization detected; rescan on restart")
        if head < start:
            return
        end = min(head, start + 499)
        logs = self.e.rpc.call("eth_getLogs", [{"address": COORDINATOR, "fromBlock": hex(start),
                        "toBlock": hex(end), "topics": [[topic(REQUESTED), topic(FULFILLED)], None,
                            f"0x{self.s['subscription']:064x}"]}])
        evidence = self.s["evidence"].setdefault("oracle", {})
        for log in logs:
            raw = log["data"][2:]
            if log["topics"][0].lower() == topic(REQUESTED).lower():
                request = int(raw[:64], 16)
                # Indexed sender must be this production lottery, never unrelated subscription traffic.
                if log["topics"][3][-40:].lower() != self.a["lottery"][2:].lower():
                    continue
                kind = "request"
            else:
                request = int(log["topics"][1], 16)
                if int(log["topics"][2], 16) != self.s["subscription"]:
                    continue
                kind = "fulfillment"
            record = evidence.setdefault(str(request), {})
            receipt = self.e.rpc.call("eth_getTransactionReceipt", [log["transactionHash"]])
            if not receipt or receipt["blockHash"].lower() != log["blockHash"].lower():
                raise Waiting("oracle receipt changed during scan")
            record[kind] = {"log": log, "receipt": receipt}
            if kind == "fulfillment":
                fields = [int(raw[i:i + 64], 16) for i in range(0, len(raw), 64)]
                record.update(payment=str(fields[1]), nativePayment=bool(fields[2]), callbackSuccess=bool(fields[3]))
        self.s["logCursor"] = end + 1
        block = self.e.rpc.call("eth_getBlockByNumber", [hex(end), False])
        self.s["logCheckpoint"] = {"number": end, "hash": block["hash"]}
        failed = [request for request, result in evidence.items()
                  if "request" in result and result.get("callbackSuccess") is False]
        if failed:
            self.s["alerts"] = {"acceptedCallbackFailed": failed,
                                "rule": "preserve accepted request; no re-request or alternate randomness"}
        self.e.save()
        if failed:
            raise Waiting("accepted coordinator callback failed; original requests preserved; see journal alerts")

    def verify_evidence(self):
        ids = []
        for game in (0, 1):
            result = self.s["evidence"].get(f"game{game}")
            if not result:
                return False
            ids.append(result["drawRequestId"])
            if game == 1:
                ids.append(result["tieRequestId"])
        if "0" in ids or len(set(ids)) != 3:
            raise ValueError("draws and independent NFT tie require three distinct request IDs")
        oracle = self.s["evidence"].get("oracle", {})
        for request in ids:
            result = oracle.get(request, {})
            if result.get("callbackSuccess") is False:
                raise Waiting("accepted VRF callback failed; no reroll or replacement permitted")
            if not all(key in result for key in ("request", "fulfillment", "payment", "callbackSuccess")):
                return False
        return True

    def run(self):
        self.setup()
        # Complete FWA settlement for each round immediately, before ticket work in the other game.
        for game in (0, 1):
            self.entries(game)
        completed = [self.advance(game) for game in (0, 1)]
        self.collect()
        if all(completed) and self.verify_evidence():
            self.s["liveStatus"] = ("LIVE SEPOLIA VERIFIED: coordinator receipts, billing, callbacks and claims"
                                    if self.s["evidenceKind"] == "live-sepolia"
                                    else "SIMULATED: never live oracle evidence")
            self.e.save()
            return
        raise Waiting("waiting for cutoff / actual coordinator callback / confirmed evidence; rerun safely")


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--config", required=True)
    p.add_argument("--state", help="durable external journal path, required for live mode")
    p.add_argument("--mode", choices=("dry-run", "live-sepolia"), default="dry-run")
    p.add_argument("--company-test-wallet-authorized", action="store_true")
    p.add_argument("--max-actions", type=int, default=5)
    args = p.parse_args()
    config = json.loads(Path(args.config).read_text())
    if args.mode == "dry-run":
        print(json.dumps(offline_plan(config), indent=2))
        return 0
    if not args.company_test_wallet_authorized or not args.state:
        p.error("live mode requires company test-wallet authorization and durable --state")
    if args.max_actions < 1 or args.max_actions > 200:
        p.error("max-actions must be 1..200")
    validate(config)
    from runtime import Engine, Pending, Halt
    try:
        with Engine(config, args.state, live=True) as engine:
            client = engine.rpc.call("web3_clientVersion", []).lower()
            if any(name in client for name in ("anvil", "hardhat", "ganache")):
                raise ValueError("live-sepolia mode refuses a local development node")
            Canary(engine, config, args.max_actions).run()
    except (Waiting, Pending) as exc:
        print(json.dumps({"status": "WAITING", "reason": str(exc), "liveComplete": False}))
        return 2
    except (Halt, ValueError) as exc:
        print(json.dumps({"status": "HALTED", "reason": str(exc), "liveComplete": False}))
        return 1
    print(json.dumps({"status": "COMPLETE", "state": args.state}))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
