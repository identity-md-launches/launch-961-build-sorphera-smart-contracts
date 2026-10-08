#!/usr/bin/env python3
"""Permissionless Sorphera worker. Dry-run by default, no treasury/configuration methods."""
import argparse
import hashlib
import json
from pathlib import Path
import signal
import time
from contracts import Contract
from runtime import Engine, Halt, Pending, Reverted, RPCUnavailable, calldata, cast, log, number

TERMINAL = (5, 6, 7)
ZERO = "0x" + "0" * 40
ACQUISITION = "acquisitions(uint256)((address,uint256,uint256,uint256,uint8))"
LISTING = "listings(uint256)((address,address,address,uint256,uint256,uint256,uint256,uint256,uint256,uint256,uint8))"


class Keeper:
    def __init__(self, engine):
        self.e = engine
        self.cfg = engine.config
        self.lottery = Contract(engine, self.cfg["lottery"], "Sorphera")
        self.s = engine.state.setdefault("keeper", {"rounds": {}, "urgent": {}, "cursors": {}, "last": {}})
        if self.lottery.read("owner").lower() == engine.sender.lower():
            raise Halt("Keeper sender must not own the lottery")
        factory = Contract(engine, self.lottery.read("factory"), "SorpheraVaultFactory")
        router = Contract(engine, factory.read("router"), "SorpheraRouter")
        if engine.sender.lower() in (factory.read("owner").lower(), router.read("owner").lower()):
            raise Halt("Keeper sender must not own factory/router")

    def view(self, target, signature, *args):
        return self.e.read(target, signature, *args)

    def uint(self, target, signature, *args):
        return number(self.view(target, signature, *args)[0])

    def events(self, address, topic, checkpoint):
        """One bounded page per iteration; checkpoint hash is checked by Engine.reconcile."""
        head = number(self.e.rpc.call("eth_blockNumber", [])) - int(self.cfg["confirmations"]) + 1
        old = self.e.state["checkpoints"].get(checkpoint)
        start = old["number"] + 1 if old else int(self.cfg["deploymentBlock"])
        if head < start:
            return []
        end = min(head, start + int(self.cfg.get("logBlockBatch", 1000)) - 1)
        records = self.e.rpc.call("eth_getLogs", [{"address": address, "fromBlock": hex(start),
                                                   "toBlock": hex(end), "topics": [topic]}])
        block = self.e.rpc.call("eth_getBlockByNumber", [hex(end), False])
        if not block or number(block["number"]) != end:
            raise Halt("RPC returned wrong checkpoint block")
        # Caller records events in memory before the single durable checkpoint save.
        return records, block, checkpoint

    def discover(self):
        topic = cast("keccak", "RoundOpened(uint8,uint256,uint256,address,uint256,uint256,uint256,uint256,uint256)")
        page = self.events(self.lottery.address, topic, "rounds")
        if page:
            records, block, key = page
            for event in records:
                game, rid = number(event["topics"][1]), number(event["topics"][2])
                r = self.lottery.read("getRound", game, rid)
                if r["vault"] == ZERO:
                    raise Halt("Round event has no canonical vault")
                self.s["rounds"][f"{game}:{rid}"] = {"game": game, "round": rid, "vault": r["vault"]}
            self.e.checkpoint(key, block)
        # Track allocation events for all origin vaults, including terminal rounds with late recoveries.
        vaults = {}
        pools = set()
        for entry in self.s["rounds"].values():
            vaults[entry["vault"].lower()] = entry
            pool = self.view(entry["vault"], "pool()(address)")[0]
            pools.add(pool)
        allocation = cast("keccak", "NFTAllocated(uint256,uint256,address,address,uint256,uint256)")
        for pool in sorted(pools):
            page = self.events(pool, allocation, "allocations:" + pool.lower())
            if not page:
                continue
            records, block, key = page
            for event in records:
                vault = "0x" + event["topics"][3][-40:]
                if vault.lower() in vaults:
                    request = number(event["topics"][1])
                    self.s["urgent"][f"{vault}:{request}"] = [vault, request]
            self.e.checkpoint(key, block)

    def settlement(self, vault, request, now):
        pool = self.view(vault, "pool()(address)")[0]
        a = self.view(pool, ACQUISITION, request)[0]
        if a[0].lower() != vault.lower():
            raise Halt("FWA purchaser binding mismatch")
        if number(a[4]) == 2 and number(a[3]):
            listing = self.view(pool, LISTING, a[3])[0]
            if number(listing[10]) == 2:
                deadline = number(listing[9]) + min(self.uint(pool, "settlementWindow()(uint256)"),
                                                       self.uint(pool, "finalizeWindow()(uint256)"))
                if deadline - now < int(self.cfg.get("settlementAlertSeconds", 600)):
                    log("urgent_settlement", vault=vault, request=request, secondsRemaining=deadline-now)
                return deadline, {"to": vault, "data": calldata("settle(uint256)", request),
                                  "value": 0, "label": f"settle:{vault}:{request}"}
        return None

    def funding(self, game, rid, r, now):
        config = self.lottery.read("roundRandomConfig", game, rid)
        sub, key, confirmations, gas, native = config
        coordinator = self.lottery.read("coordinator")
        balances = self.view(coordinator, "getSubscription(uint256)(uint96,uint96,uint64,address,address[])", sub)
        available = number(balances[1 if native else 0])
        floor = max(self.lottery.read("roundMinimumVRFBalance", game, rid), int(self.cfg["minimumVRFBalance"]))
        consumer = self.lottery.address.lower() in [a.lower() for a in balances[4]]
        if available < floor or not consumer:
            log("vrf_funding_alert", game=game, round=rid, subscription=sub,
                balance=available, minimum=floor, registered=consumer)
            return False
        if r["status"] in (3, 9) and now - r["requestedAt"] > int(self.cfg.get("vrfAlertSeconds", 3600)):
            log("vrf_delayed", game=game, round=rid, request=r["tieBreakRequestId"] or r["requestId"],
                action="monitor original request; never replace")
        return True

    def plan(self):
        self.e.reconcile()
        self.discover()
        block = self.e.rpc.call("eth_getBlockByNumber", ["latest", False])
        now = number(block["timestamp"])
        actions = []
        # Allocations discovered from events take priority over round progression and new spending.
        for key, (vault, request) in list(self.s["urgent"].items()):
            result = self.settlement(vault, request, now)
            if result:
                actions.append((0, result[0], result[1]))
            else:
                del self.s["urgent"][key]
        for key, entry in sorted(self.s["rounds"].items()):
            game, rid, vault = entry["game"], entry["round"], entry["vault"]
            r = self.lottery.read("getRound", game, rid)
            if r["vault"].lower() != vault.lower():
                raise Halt("Stored vault differs from canonical round")
            v = Contract(self.e, vault, "SorpheraVault")
            total = v.read("requestCount")
            cursor = self.s["cursors"].get(vault, 0)
            if cursor >= total:
                cursor = 0
            end = min(total, cursor + 50)
            for index in range(cursor, end):
                request = v.read("requestAt", index)
                settle = self.settlement(vault, request, now)
                if settle:
                    actions.append((0, settle[0], settle[1]))
                    continue
                pool = v.read("pool")
                a = self.view(pool, ACQUISITION, request)[0]
                if number(a[4]) in (2, 3, 4) and v.read("requestState", request) == 1:
                    actions.append((1, 0, v.action("reconcile", [request], label=f"reconcile:{vault}:{request}")))
                if number(a[3]) and self.view(pool, "stuckNFTRecipient(uint256)(address)", a[3])[0].lower() == vault.lower():
                    actions.append((3, 0, v.action("recoverNFT", request, label=f"recover-nft:{vault}:{request}")))
            self.s["cursors"][vault] = 0 if end >= total else end
            if v.read("refundCredit"):
                actions.append((1, 0, v.action("recoverRefund", label="refund:" + vault)))
            balance = number(self.e.rpc.call("eth_getBalance", [vault, "latest"]))
            budget = v.read("budget")
            if balance > budget or (now >= r["cutoff"] and budget):
                actions.append((2, 0, v.action("syncETH", label="sync:" + vault)))
            status = r["status"]
            if status not in TERMINAL:
                funded = self.funding(game, rid, r, now)
                action = None
                if status == 1 and now >= r["cutoff"]:
                    action = self.lottery.action("close", game, rid)
                elif status == 2 and (now >= r["earliestDraw"] or r["sold"] == 0):
                    cancel = game == 1 and r["eligibleNFTs"] == 0 and now >= r["settlementDeadline"]
                    if cancel or r["sold"] == 0 or (funded and v.read("pending") == 0 and not v.read("refundCredit")):
                        action = self.lottery.action("requestDraw", game, rid)
                elif status == 4:
                    action = self.lottery.action("finalize", game, rid)
                elif status == 8 and funded:
                    action = self.lottery.action("requestTieBreak", game, rid)
                elif status == 10:
                    action = self.lottery.action("finalizeTieBreak", game, rid)
                if action:
                    action["label"] += f":{game}:{rid}"
                    actions.append((2, 0, action))
            # Process only when pending; cooldown bounds no-progress transactions.
            if v.read("pending"):
                actions.append((3, 0, v.action("process", 50, label="process:" + vault)))
            if status == 1 and now < r["cutoff"] and self.cfg.get("acquire", False):
                pool = v.read("pool")
                fee, vrf, total_price = map(number, self.view(pool, "quoteAcquisitionPrice()(uint256,uint256,uint256)"))
                bounds = v.read("settings")
                max_fee, max_total, min_value, slippage, cutoff = bounds
                available = not self.view(pool, "isPurchaseBlackout()(bool)")[0] and self.uint(pool, "activeListingCount()(uint256)") > 0
                if available and fee > 0 and fee <= max_fee and total_price == fee + vrf and total_price <= max_total and self.uint(pool, "weightedBackingTotal()(uint256)") >= min_value:
                    count = min(8, int(self.cfg.get("acquisitionBatch", 1)), budget // total_price)
                    if count:
                        actions.append((5, 0, v.action("acquire", count, min(now + 120, cutoff), label="acquire:" + vault)))
        if self.cfg.get("openRounds", True):
            for game in (0, 1):
                latest = self.lottery.read("latestRound", game)
                r = self.lottery.read("getRound", game, latest) if latest else None
                rules = self.lottery.read("futureRules", game)
                cutoff = rules[1] + latest * 604800
                if rules[0] and now >= cutoff - 604800 and (r is None or r["status"] in TERMINAL):
                    actions.append((4, 0, self.lottery.action("openRound", game, label=f"open:{game}:{latest+1}")))
        self.e.save()
        return block, sorted(actions, key=lambda a: (a[0], a[1], a[2]["label"]))

    def tick(self):
        block, actions = self.plan()
        now = number(block["timestamp"])
        for priority, deadline, action in actions:
            label = action["label"]
            cooldown = int(self.cfg.get("processCooldownSeconds", 60)) if label.startswith("process:") else int(self.cfg.get("retrySeconds", 30))
            if now - self.s["last"].get(label, -cooldown) < cooldown:
                continue
            digest = hashlib.sha256(action["data"].encode()).hexdigest()[:16]
            action["id"] = f"keeper:{number(block['number'])}:{label}:{digest}"
            try:
                result = self.e.transact(action)
            except Pending:
                self.s["last"][label] = now
                self.e.save()
                raise
            except RPCUnavailable:
                # A transport failure may happen after broadcast; preserve the
                # journal and let the supervisor retry, never try another action.
                raise
            except Halt as exc:
                # A rejected simulation of one bad NFT must not starve unrelated urgent work.
                if self.e.state["transactions"].get(action["id"]):
                    raise
                self.s["last"][label] = now
                self.e.save()
                log("action_blocked", label=label, reason=str(exc))
                continue
            if self.e.live:
                self.s["last"][label] = now
                self.e.save()
            return result
        log("idle", candidates=len(actions), block=number(block["number"]))
        return None


def main():
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument("--config", required=True)
    p.add_argument("--state", required=True)
    p.add_argument("--mode", choices=("dry-run", "live-sepolia", "local-fork"), default="dry-run")
    p.add_argument("--authorize-test-wallet", action="store_true")
    p.add_argument("--once", action="store_true")
    p.add_argument("--adopt", nargs=2, metavar=("ACTION_ID", "TX_HASH"))
    p.add_argument("--retry-reverted", metavar="ACTION_ID")
    p.add_argument("--recover-checkpoints", action="store_true",
                   help="rescan event-only reorgs; requires all own receipts remain canonical")
    a = p.parse_args()
    config = json.loads(Path(a.config).read_text())
    if a.mode == "live-sepolia" and (int(config["chainId"]) != 11155111 or not a.authorize_test_wallet):
        p.error("live-sepolia requires chain 11155111 and --authorize-test-wallet")
    if a.mode == "local-fork" and not config.get("localFork"):
        p.error("local-fork requires verified loopback Anvil config localFork=true")
    running = True
    def stop(*_):
        nonlocal running
        running = False
    signal.signal(signal.SIGTERM, stop)
    signal.signal(signal.SIGINT, stop)
    try:
        with Engine(config, a.state, live=a.mode != "dry-run") as engine:
            if a.recover_checkpoints:
                engine.recover_checkpoints()
                return 0
            if a.adopt:
                engine.adopt(*a.adopt)
                return
            if a.retry_reverted:
                engine.retry_reverted(a.retry_reverted)
                return
            keeper = Keeper(engine)
            while running:
                try:
                    keeper.tick()
                except Pending as exc:
                    log("waiting", reason=str(exc))
                except RPCUnavailable as exc:
                    log("rpc_unavailable", reason=str(exc))
                    return 75
                except Halt as exc:
                    # RPC outages can be retried by the supervisor; unresolved safety failures stop.
                    log("halt", reason=str(exc))
                    return 2
                if a.once:
                    break
                until = time.monotonic() + min(60, max(1, int(config.get("pollSeconds", 12))))
                while running and time.monotonic() < until:
                    time.sleep(min(1, until - time.monotonic()))
    except RPCUnavailable as exc:
        log("rpc_unavailable", reason=str(exc))
        return 75
    except (Halt, OSError, ValueError, KeyError) as exc:
        log("halt", reason=str(exc))
        return 2
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
