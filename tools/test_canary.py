"""Offline CLI state-machine tests. All oracle behavior here is simulated."""
import json
import unittest
from unittest.mock import patch
import canary


def address(n):
    return "0x" + f"{n:040x}"


class FakeEngine:
    def __init__(self):
        self.state, self.sender, self.live = {}, address(90), False
        self.rpc = self
        self.rounds = {game: [0, 1, 1000, 0, 50000, 50060, 53600, address(10 + game),
                              0, 0, 0, 0, 0, [1, 2, 3], 1, 123, 0, 0, 0, 0, 0, 0]
                       for game in (0, 1)}
        self.sent, self.journal, self.pending = [], {}, {}
        self.acquired, self.allocated, self.claimed = set(), set(), set()
        self.now, self.next_request, self.owner, self.asset_claimed = 50061, 20, address(11), False

    def save(self):
        pass

    def call(self, method, params):
        if method == "eth_getBlockByNumber":
            return {"timestamp": hex(self.now), "hash": "0xabc"}
        raise AssertionError(method)

    def read(self, target, signature, *args):
        if signature == canary.ROUND:
            return [self.rounds[int(args[0])].copy()]
        game = 0 if target == address(10) else 1
        if signature.startswith("requestCount"):
            return [int(game in self.acquired)]
        if signature.startswith("requestAt"):
            return [game + 1]
        if signature.startswith("requestState"):
            return [2 if game in self.allocated else 1]
        if signature.startswith("acquisitions"):
            game = int(args[0]) - 1
            return [[address(10 + game), 1, 1000, game + 1, 2 if game in self.allocated else 1]]
        if signature.startswith("getSubscription"):
            return [10**18, 10**18, 0, self.sender, [address(6)]]
        if signature.startswith("matchingTicket"):
            return [123]
        if signature.startswith("claimedETH"):
            return [1000 if int(args[0]) in self.claimed else 0]
        if signature.startswith("assets"):
            return [address(5), 2, 2, 2, self.asset_claimed]
        if signature.startswith("ownerOf"):
            return [self.owner]
        raise AssertionError(signature)

    def transact(self, action):
        if action["id"] in self.journal:
            return self.journal[action["id"]]
        signature, args = json.loads(action["data"])
        self.sent.append(action)
        if signature.startswith("openRound"):
            self.rounds[int(args[0])][0] = 1
        elif signature.startswith("buyBatch"):
            self.rounds[int(args[1])][8] += str(args[3]).count("([")
        elif signature.startswith("acquire("):
            self.acquired.add(0 if action["to"] == address(10) else 1)
        elif signature.startswith("allocate"):
            self.allocated.add(int(args[0]) - 1)
        elif signature.startswith("settle"):
            pass
        elif signature.startswith("requestDraw"):
            r = self.rounds[int(args[0])]
            r[0], r[10] = 3, self.next_request
            self.next_request += 1
        elif signature.startswith("finalize("):
            game = int(args[0]); r = self.rounds[game]
            r[0], r[16] = (5, 1) if game == 0 else (8, 2)
        elif signature.startswith("requestTieBreak"):
            self.rounds[1][0], self.rounds[1][20] = 9, self.next_request
            self.next_request += 1
        elif signature.startswith("finalizeTieBreak"):
            self.rounds[1][0], self.rounds[1][17] = 5, 123
        elif signature.startswith("execute"):
            inner, inner_args = json.loads(args[1])
            if inner.startswith("claimETH"):
                self.claimed.add(int(inner_args[0]))
            elif inner.startswith("claimNFTs"):
                self.asset_claimed, self.owner = True, inner_args[2]
            else:
                raise AssertionError(inner)
        else:
            raise AssertionError(signature)
        receipt = {"transactionHash": f"0x{len(self.sent):064x}", "status": "0x1"}
        self.journal[action["id"]] = receipt
        return receipt


class CanaryTests(unittest.TestCase):
    def setUp(self):
        self.patch = patch.object(canary, "calldata", lambda signature, *args: json.dumps([signature, args]))
        self.patch.start()
        self.addCleanup(self.patch.stop)
        self.config = {"chainId": 11155111, "subscriptionMinimum": 1,
                       "callbackGas": 200000, "requestConfirmations": 3}

    def workflow(self, engine=None, limit=200):
        engine = engine or FakeEngine()
        work = canary.Canary(engine, self.config, limit)
        work.a.update(lottery=address(6), pool=address(4), controller=address(3),
                      vault0=address(10), vault1=address(11))
        work.s["subscription"] = 42
        return work

    def test_all_combinations_guarantee_one_or_two_matching_tickets(self):
        self.assertEqual(len(canary.picks()), 5700)
        self.assertEqual(len(set(canary.picks())), 5700)
        twice = [p for start in range(0, 11400, 100) for p in canary.batch(start, 11400)]
        self.assertEqual(twice[:5700], twice[5700:])
        self.assertTrue(all(1 <= a < b < c <= 20 and 1 <= bonus <= 5 for a, b, c, bonus in twice))

    def test_default_dry_run_has_no_engine_or_rpc_and_reports_not_run(self):
        result = canary.offline_plan({})
        self.assertFalse(result["broadcast"])
        self.assertEqual(result["liveEvidence"], "NOT RUN")
        self.assertEqual(result["ticketBatches"], 171)

    def test_refuses_mainnet_and_unsafe_configuration(self):
        canary.validate(self.config)
        for key, value in [("chainId", 1), ("localFork", True), ("coordinator", address(88)), ("ticketPriceWei", 11),
                           ("subscriptionMinimum", 0), ("callbackGas", 100), ("keyHash", "0x123")]:
            with self.subTest(key=key), self.assertRaises(ValueError):
                canary.validate(dict(self.config, **{key: value}))

    def test_simulation_journal_cannot_be_promoted_to_live_evidence(self):
        work = self.workflow()
        work.e.live = True
        with self.assertRaises(ValueError):
            self.workflow(work.e)

    def test_ticket_cursor_recovers_after_restart_and_rejects_unexpected_sale(self):
        work = self.workflow(limit=3)
        with self.assertRaises(canary.Waiting):
            work.entries(0)
        self.assertEqual(work.e.rounds[0][8], 200)
        resumed = self.workflow(work.e)
        resumed.entries(0)
        self.assertEqual(work.e.rounds[0][8], 5700)
        buys = [t for t in work.e.sent if t["label"].startswith("buy:")]
        self.assertEqual(len(buys), 57)
        self.assertEqual(sum(t["value"] for t in buys), 5700000)
        work.e.rounds[1][8] = 101
        with self.assertRaises(ValueError):
            resumed.entries(1)

    def test_both_lifecycles_delayed_callbacks_restart_distinct_tie_and_claims(self):
        work = self.workflow()
        work.entries(0); work.entries(1)
        self.assertFalse(work.advance(0)); self.assertFalse(work.advance(1))
        requests = len(work.e.sent)
        resumed = self.workflow(work.e)
        self.assertFalse(resumed.advance(0)); self.assertFalse(resumed.advance(1))
        self.assertEqual(len(work.e.sent), requests, "accepted requests must never be replaced")
        work.e.rounds[0][0] = 4  # Simulated delivery after restart.
        work.e.rounds[1][0] = 4
        self.assertTrue(resumed.advance(0)); self.assertFalse(resumed.advance(1))
        self.assertEqual(work.e.rounds[1][0], 9)
        work.e.rounds[1][0] = 10
        self.assertTrue(resumed.advance(1))
        self.assertEqual(work.e.claimed, {0, 1})
        self.assertEqual(work.e.owner, work.e.sender)
        self.assertEqual(len({work.e.rounds[0][10], work.e.rounds[1][10], work.e.rounds[1][20]}), 3)
        self.assertFalse(resumed.verify_evidence(), "simulation does not provide actual coordinator receipts")

    def test_actual_receipts_and_distinct_ids_required_for_live_success(self):
        work = self.workflow()
        work.s["evidence"].update(game0={"drawRequestId": "1"}, game1={"drawRequestId": "2", "tieRequestId": "3"})
        work.s["evidence"]["oracle"] = {str(i): {"request": {}, "fulfillment": {}, "payment": "100", "callbackSuccess": True} for i in (1,2,3)}
        self.assertTrue(work.verify_evidence())
        work.s["evidence"]["oracle"]["3"]["callbackSuccess"] = False
        with self.assertRaises(canary.Waiting):
            work.verify_evidence()
        work.s["evidence"]["game1"]["tieRequestId"] = "2"
        with self.assertRaises(ValueError):
            work.verify_evidence()

    def test_receipt_billing_collection_and_reorg_without_new_blocks(self):
        work = self.workflow()
        work.s["startBlock"] = 1
        def word(n):
            return f"{n:064x}"
        requests = {"address": canary.COORDINATOR,
                    "topics": ["requested", "key", "0x" + word(42), "0x" + word(6)],
                    "data": "0x" + word(17), "transactionHash": "request-tx", "blockHash": "block"}
        fulfilled = {"address": canary.COORDINATOR,
                     "topics": ["fulfilled", "0x" + word(17), "0x" + word(42)],
                     "data": "0x" + "".join(word(n) for n in (99, 456, 1, 1, 0)),
                     "transactionHash": "fulfill-tx", "blockHash": "block"}
        chain = {"hash": "block"}
        def rpc(method, params):
            if method == "eth_blockNumber": return "0x5"
            if method == "eth_getLogs": return [requests, fulfilled]
            if method == "eth_getTransactionReceipt": return {"blockHash": "block", "status": "0x1"}
            if method == "eth_getBlockByNumber": return chain
            raise AssertionError(method)
        work.e.call = rpc
        with patch.object(canary, "topic", lambda s: "requested" if s == canary.REQUESTED else "fulfilled"):
            work.collect()
            evidence = work.s["evidence"]["oracle"]["17"]
            self.assertEqual(evidence["payment"], "456")
            self.assertTrue(evidence["nativePayment"])
            self.assertTrue(evidence["callbackSuccess"])
            self.assertIn("receipt", evidence["fulfillment"])
            chain["hash"] = "reorg-block"
            with self.assertRaises(canary.Waiting):
                work.collect()
        self.assertEqual(work.s["logCursor"], 1)
        self.assertNotIn("oracle", work.s["evidence"])


if __name__ == "__main__":
    unittest.main()
