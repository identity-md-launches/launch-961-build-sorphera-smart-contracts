#!/usr/bin/env python3
"""Behavior tests for bounded permissionless plans, without live RPC or signing."""
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import keeper
from contracts import abi_type, normalize
from runtime import Halt, RPCUnavailable


LOTTERY, FACTORY, ROUTER, OWNER, SENDER = ["0x" + f"{n:040x}" for n in range(1, 6)]
VAULT, POOL, COORDINATOR = ["0x" + f"{n:040x}" for n in range(6, 9)]


def encoded(signature, *args):
    return signature + repr(args)


class Fixture:
    def __init__(self):
        self.sender = SENDER
        self.config = dict(lottery=LOTTERY, confirmations=2, deploymentBlock=1,
                           minimumVRFBalance=10, openRounds=False, acquire=False,
                           acquisitionBatch=8, retrySeconds=30)
        self.state = {"checkpoints": {}, "transactions": {}}
        self.rpc = self
        self.live = True
        self.now = 1000
        self.calls = []
        self.sent = []
        self.values = {
            (LOTTERY, "owner"): OWNER, (LOTTERY, "factory"): FACTORY,
            (FACTORY, "owner"): OWNER, (FACTORY, "router"): ROUTER,
            (ROUTER, "owner"): OWNER, (LOTTERY, "coordinator"): COORDINATOR,
            (LOTTERY, "roundRandomConfig"): [1, "key", 3, 200000, True],
            (LOTTERY, "roundMinimumVRFBalance"): 10,
            (VAULT, "requestCount"): 0, (VAULT, "refundCredit"): 0,
            (VAULT, "budget"): 0, (VAULT, "pending"): 0,
            (VAULT, "pool"): POOL, (VAULT, "settings"): [10, 12, 5, 100, 2000],
        }
        self.r = dict(status=1, vault=VAULT, cutoff=2000, earliestDraw=2060,
                      settlementDeadline=5600, sold=100, eligibleNFTs=1, requestedAt=500,
                      requestId=1, tieBreakRequestId=0)
        self.requests = {}
        self.listings = {}
        self.balance = 0
        self.subscription_balance = 100
        self.quote = [10, 2, 12]
        self.blackout = False
        self.active = 1
        self.backing = 100
        self.saves = 0

    def contract_read(self, address, name, args):
        self.calls.append((address, name, args))
        if name == "getRound":
            return copy.deepcopy(self.r)
        if name == "requestAt":
            return args[0] + 1
        if name == "requestState":
            return 1
        return self.values[(address, name)]

    def read(self, address, signature, *args):
        self.calls.append((address, signature, args))
        if signature == "pool()(address)":
            return [POOL]
        if signature == keeper.ACQUISITION:
            return [self.requests[args[0]]]
        if signature == keeper.LISTING:
            return [self.listings[args[0]]]
        if signature in ("settlementWindow()(uint256)", "finalizeWindow()(uint256)"):
            return [3600]
        if signature == "getSubscription(uint256)(uint96,uint96,uint64,address,address[])":
            return [self.subscription_balance, self.subscription_balance, 0, OWNER, [LOTTERY]]
        if signature == "stuckNFTRecipient(uint256)(address)":
            return [keeper.ZERO]
        if signature == "quoteAcquisitionPrice()(uint256,uint256,uint256)":
            return self.quote
        if signature == "isPurchaseBlackout()(bool)":
            return [self.blackout]
        if signature == "activeListingCount()(uint256)":
            return [self.active]
        if signature == "weightedBackingTotal()(uint256)":
            return [self.backing]
        raise AssertionError((address, signature, args))

    def call(self, method, params):
        self.calls.append((method, params))
        if method == "eth_getBlockByNumber":
            return {"number": "0xa" if params[0] == "latest" else params[0],
                    "timestamp": hex(self.now), "hash": "0x1234"}
        if method == "eth_getBalance":
            return hex(self.balance)
        if method == "eth_blockNumber":
            return "0xa"
        if method == "eth_getLogs":
            return []
        raise AssertionError(method)

    def save(self):
        self.saves += 1

    def reconcile(self):
        pass

    def transact(self, action):
        self.sent.append(copy.deepcopy(action))
        return {"status": "0x1"} if self.live else None

    def checkpoint(self, name, block):
        self.state["checkpoints"][name] = dict(number=int(block["number"], 16), hash=block["hash"])


class FakeContract:
    def __init__(self, engine, address, name):
        self.engine, self.address = engine, address

    def read(self, name, *args):
        return self.engine.contract_read(self.address, name, args)

    def action(self, name, *args, label=None):
        return {"to": self.address, "data": encoded(name, *args), "value": 0,
                "label": label or name}


class KeeperTest(unittest.TestCase):
    def setUp(self):
        self.addCleanup(patch.stopall)
        patch("keeper.Contract", FakeContract).start()
        patch("keeper.calldata", encoded).start()
        patch("keeper.cast", lambda *a: "topic").start()
        patch("sys.stdout", new=io.StringIO()).start()
        self.e = Fixture()
        self.worker = keeper.Keeper(self.e)
        self.worker.s["rounds"]["0:1"] = dict(game=0, round=1, vault=VAULT)
        self.worker.discover = lambda: None

    def labels(self):
        return [x[2]["label"] for x in self.worker.plan()[1]]

    def test_keeper_cannot_have_owner_rights(self):
        for address in (LOTTERY, FACTORY, ROUTER):
            with self.subTest(address=address):
                self.e.values[(address, "owner")] = SENDER
                with self.assertRaisesRegex(Halt, "must not own"):
                    keeper.Keeper(self.e)
                self.e.values[(address, "owner")] = OWNER

    def test_accepted_draw_and_tie_never_replaced(self):
        self.e.now = 10000
        for status in (3, 9):
            with self.subTest(status=status):
                self.e.r["status"] = status
                self.assertFalse(any("request" in x.lower() for x in self.labels()))
        self.e.r["status"] = 4
        self.assertIn("finalize:0:1", self.labels())
        self.e.r["status"] = 10
        self.assertIn("finalizeTieBreak:0:1", self.labels())

    def test_funding_depletion_blocks_new_request_but_not_finalization(self):
        self.e.now = 3000
        self.e.r["status"] = 2
        self.e.subscription_balance = 0
        self.assertNotIn("requestDraw:0:1", self.labels())
        self.e.subscription_balance = 100
        self.assertIn("requestDraw:0:1", self.labels())
        self.e.subscription_balance = 0
        self.e.r["status"] = 4
        self.assertIn("finalize:0:1", self.labels())

    def test_tie_requires_distinct_request_after_draw_finalization(self):
        self.e.r["status"] = 8
        self.assertIn("requestTieBreak:0:1", self.labels())
        self.e.r["status"] = 9
        self.assertNotIn("requestTieBreak:0:1", self.labels())

    def test_close_and_empty_round_progress_do_not_need_funding(self):
        self.e.now = 2000
        self.e.subscription_balance = 0
        self.assertIn("close:0:1", self.labels())
        self.e.r.update(status=2, sold=0)
        self.assertIn("requestDraw:0:1", self.labels())

    def test_acquisition_obeys_frozen_budget_batch_quote_and_blackout(self):
        self.e.config["acquire"] = True
        self.e.values[(VAULT, "budget")] = 1000
        self.e.balance = 1000
        actions = self.worker.plan()[1]
        acquisition = [a[2] for a in actions if a[2]["label"] == "acquire:" + VAULT][0]
        self.assertEqual(acquisition["data"], encoded("acquire", 8, 1120))
        self.assertEqual(acquisition["value"], 0)
        self.e.values[(VAULT, "budget")] = self.e.balance = 25
        acquisition = [a[2] for a in self.worker.plan()[1] if a[2]["label"] == "acquire:" + VAULT][0]
        self.assertEqual(acquisition["data"], encoded("acquire", 2, 1120))
        for name, value in (("blackout", True), ("active", 0), ("backing", 4), ("quote", [11, 1, 12])):
            old = getattr(self.e, name)
            setattr(self.e, name, value)
            self.assertNotIn("acquire:" + VAULT, self.labels())
            setattr(self.e, name, old)

    def test_settlement_deadlines_take_priority_over_new_spend(self):
        self.e.values[(VAULT, "requestCount")] = 2
        self.e.values[(VAULT, "pending")] = 2
        self.e.values[(VAULT, "budget")] = self.e.balance = 1000
        self.e.config["acquire"] = True
        for request, allocation in ((1, 300), (2, 100)):
            self.e.requests[request] = [VAULT, 0, 10, request, 2]
            self.e.listings[request] = ["nft", OWNER, VAULT, request, 1, 10, 0, 0, 0, allocation, 2]
        actions = self.worker.plan()[1]
        self.assertEqual(actions[0][2]["label"], f"settle:{VAULT}:2")
        self.assertEqual(actions[1][2]["label"], f"settle:{VAULT}:1")
        self.assertEqual(actions[-1][2]["label"], "acquire:" + VAULT)

    def test_fallback_request_scan_bounded_and_persisted(self):
        self.e.values[(VAULT, "requestCount")] = 101
        self.e.values[(VAULT, "pending")] = 101
        self.e.requests = {n: [VAULT, 0, 10, 0, 1] for n in range(1, 102)}
        self.worker.plan()
        self.assertEqual(self.worker.s["cursors"][VAULT], 50)
        scanned = [c for c in self.e.calls if len(c) == 3 and c[1] == "requestAt"]
        self.assertEqual(len(scanned), 50)
        restarted = keeper.Keeper(self.e)
        restarted.discover = lambda: None
        restarted.plan()
        self.assertEqual(restarted.s["cursors"][VAULT], 100)
        restarted.plan()
        self.assertEqual(restarted.s["cursors"][VAULT], 0)

    def test_refunds_and_terminal_late_reconciliation_continue(self):
        self.e.r["status"] = 5
        self.e.values[(VAULT, "requestCount")] = 1
        self.e.values[(VAULT, "refundCredit")] = 10
        self.e.requests[1] = [VAULT, 0, 10, 0, 4]
        labels = self.labels()
        self.assertIn(f"reconcile:{VAULT}:1", labels)
        self.assertIn("refund:" + VAULT, labels)

    def test_bad_nft_simulation_does_not_starve_another_urgent_action(self):
        block = {"timestamp": "0x3e8", "number": "0xa"}
        actions = [(0, 1100, {"label": "settle:first", "data": "bad", "to": VAULT}),
                   (0, 1200, {"label": "settle:second", "data": "good", "to": VAULT})]
        self.worker.plan = lambda: (block, actions)
        def send(action):
            self.e.sent.append(action)
            if action["data"] == "bad":
                raise Halt("recipient rejected delivery")
            return {"status": "0x1"}
        self.e.transact = send
        self.assertEqual(self.worker.tick()["status"], "0x1")
        self.assertEqual(len(self.e.sent), 2)

    def test_rpc_outage_does_not_fall_through_to_another_action(self):
        self.e.now = 2000
        self.e.transact = lambda _: (_ for _ in ()).throw(RPCUnavailable("RPC unavailable"))
        with self.assertRaises(RPCUnavailable):
            self.worker.tick()
        self.assertEqual(self.worker.s["last"], {})

    def test_supervisor_retries_transport_failure_but_not_safety_halt(self):
        with tempfile.TemporaryDirectory(prefix="sorphera-keeper-test-", dir="/tmp") as tmp:
            path = Path(tmp) / "config.json"
            path.write_text(json.dumps(self.e.config))
            with patch("sys.argv", ["keeper.py", "--config", str(path), "--state", str(Path(tmp)/"state.json"), "--once"]):
                with patch("keeper.Engine", side_effect=RPCUnavailable("RPC unavailable")):
                    self.assertEqual(keeper.main(), 75)
                with patch("keeper.Engine", side_effect=Halt("REORG")):
                    self.assertEqual(keeper.main(), 2)

    def test_log_ranges_bounded_and_use_confirmed_head(self):
        self.e.config["logBlockBatch"] = 3
        page = self.worker.events(LOTTERY, "topic", "scan")
        self.assertEqual(page[1]["number"], "0x3")
        self.e.checkpoint(page[2], page[1])
        page = self.worker.events(LOTTERY, "topic", "scan")
        self.assertEqual(page[1]["number"], "0x6")
        self.e.checkpoint(page[2], page[1])
        page = self.worker.events(LOTTERY, "topic", "scan")
        self.assertEqual(page[1]["number"], "0x9")
        self.e.checkpoint(page[2], page[1])
        self.assertEqual(self.worker.events(LOTTERY, "topic", "scan"), [])

    def test_dry_run_tick_has_no_cooldown_side_effect(self):
        self.e.live = False
        self.e.now = 2000
        self.worker.tick()
        self.assertEqual(self.worker.s["last"], {})

    def test_abi_tuple_array_normalization_preserves_status_fields(self):
        field = {"type": "tuple[]", "components": [
            {"name": "status", "type": "uint8"}, {"name": "word", "type": "uint256"}]}
        self.assertEqual(abi_type(field), "(uint8,uint256)[]")
        self.assertEqual(normalize(field, [["0x9", "123"]]), [{"status": 9, "word": 123}])


if __name__ == "__main__":
    unittest.main()
