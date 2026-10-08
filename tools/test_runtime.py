#!/usr/bin/env python3
"""Offline transaction-engine regressions; every journal lives under /tmp."""
import copy
import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch

import runtime


SENDER = "0x" + "11" * 20
TARGET = "0x" + "22" * 20
HASH = "0x" + "aa" * 32
BLOCK = "0x" + "bb" * 32
ACTION = {"id": "draw:0:1", "to": TARGET, "data": "0x1234", "value": 0}


def config(**updates):
    result = {
        "chainId": 31337, "sender": SENDER, "rpcUrl": "http://unused.invalid",
        "signerRpc": "http://signer.invalid", "signerMethod": "eth_signTransaction",
        "dedicatedSender": True, "confirmations": 1, "maxGas": 100000,
        "maxFeePerGas": 1000, "maxTxCost": 100000000,
        "maxTotalCost": 1000000000, "minimumBalance": 100,
    }
    result.update(updates)
    return result


class FakeRPC:
    def __init__(self):
        self.chain = 31337
        self.sender_code = "0x"
        self.calls = []
        self.sent = []
        self.receipt = None
        self.transaction = None
        self.latest = 0
        self.pending = 0
        self.head = 10
        self.block_hash = BLOCK
        self.balance = 10**18
        self.gas = 21000
        self.gas_price = 100
        self.fail = set()
        self.lose_send_response = False

    def call(self, method, params):
        self.calls.append((method, copy.deepcopy(params)))
        if method in self.fail:
            raise runtime.Halt("simulated RPC outage/revert")
        if method == "eth_chainId":
            return hex(self.chain)
        if method == "eth_getCode":
            return self.sender_code
        if method == "web3_clientVersion":
            return "anvil/v-test"
        if method == "anvil_nodeInfo":
            return {"currentBlockNumber": self.head}
        if method == "eth_call":
            return "0x"
        if method == "eth_estimateGas":
            return hex(self.gas)
        if method == "eth_gasPrice":
            return hex(self.gas_price)
        if method == "eth_getBalance":
            return hex(self.balance)
        if method == "eth_getTransactionCount":
            return hex(self.latest if params[1] == "latest" else self.pending)
        if method == "eth_getTransactionReceipt":
            return self.receipt
        if method == "eth_getTransactionByHash":
            return self.transaction
        if method == "eth_getBlockByNumber":
            return {"number": params[0], "hash": self.block_hash}
        if method == "eth_blockNumber":
            return hex(self.head)
        if method == "eth_sendRawTransaction":
            self.sent.append(params[0])
            self.transaction = {"hash": HASH}
            self.pending = 1
            if self.lose_send_response:
                self.lose_send_response = False
                raise runtime.Halt("simulated response lost AFTER broadcast")
            return HASH
        raise AssertionError(method)

    def mine(self, success=True, block=10):
        self.latest = self.pending = 1
        self.receipt = {"transactionHash": HASH, "blockNumber": hex(block),
                        "blockHash": self.block_hash, "status": hex(int(success)),
                        "gasUsed": hex(21000), "effectiveGasPrice": hex(100)}


class FakeSigner:
    def __init__(self):
        self.signed = []
        self.changed = {}

    def call(self, method, params):
        if method not in ("eth_signTransaction", "account_signTransaction"):
            raise AssertionError(method)
        self.signed.append(copy.deepcopy(params[0]))
        return {"raw": "0xdeadbeef"}

    def decode(self, *args):
        if args[0] != "decode-transaction":
            raise AssertionError(args)
        tx = self.signed[-1]
        result = {**tx, "signer": tx["from"], "input": tx["data"], "hash": HASH}
        result.update(self.changed)
        return result


class RuntimeTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory(prefix="sorphera-engine-", dir="/tmp")
        self.addCleanup(self.tmp.cleanup)
        self.path = Path(self.tmp.name) / "state.json"
        self.rpc = FakeRPC()
        self.signer = FakeSigner()
        self.addCleanup(patch.stopall)
        patch("runtime.Rpc", return_value=self.signer).start()
        patch("runtime.cast", side_effect=self.signer.decode).start()
        patch("sys.stdout", new=io.StringIO()).start()

    def engine(self, live=True, **kwargs):
        return runtime.Engine(config(**kwargs), self.path, live=live, rpc=self.rpc)

    def submit_pending(self, engine):
        with self.assertRaises(runtime.Pending):
            engine.transact(ACTION)

    def test_dry_run_never_signs_or_broadcasts(self):
        with self.engine(live=False) as e:
            self.assertIsNone(e.transact(ACTION))
            self.assertEqual(e.state["transactions"], {})
            self.assertEqual(e.state["spentCeiling"], 0)
        self.assertFalse(self.signer.signed)
        self.assertFalse(self.rpc.sent)

    def test_live_mainnet_and_wrong_chain_are_rejected(self):
        self.rpc.chain = 1
        with self.assertRaisesRegex(runtime.Halt, "restricted"):
            self.engine(chainId=1)
        with self.assertRaisesRegex(runtime.Halt, "does not match"):
            self.engine()
        self.assertFalse(self.rpc.sent)

    def test_live_signer_and_exclusive_sender_required(self):
        for changes in ({"signerRpc": None}, {"dedicatedSender": False}):
            with self.subTest(changes=changes), self.assertRaisesRegex(runtime.Halt, "external signerRpc"):
                self.engine(**changes)
        self.rpc.chain = 11155111
        with self.assertRaisesRegex(runtime.Halt, "Clef-compatible"):
            self.engine(chainId=11155111)

    def test_live_sepolia_refuses_sender_with_delegated_code(self):
        self.rpc.chain = 11155111
        self.rpc.sender_code = "0xef0100" + TARGET[2:]
        with self.assertRaisesRegex(runtime.Halt, "EIP-7702"):
            self.engine(chainId=11155111, signerMethod="account_signTransaction")
        self.rpc.sender_code = "0x"
        with self.engine(chainId=11155111, signerMethod="account_signTransaction") as engine:
            self.assertTrue(engine.live)

    def test_local_fork_requires_loopback_anvil_and_same_local_signer(self):
        self.rpc.chain = 1
        for changes, message in (({"rpcUrl": "https://example.org"}, "loopback"),
                                 ({"rpcUrl": "http://127.0.0.1:18545"}, "same local")):
            with self.subTest(changes=changes), self.assertRaisesRegex(runtime.Halt, message):
                self.engine(chainId=1, localFork=True, **changes)
        local = {"chainId": 1, "localFork": True, "rpcUrl": "http://127.0.0.1:18545",
                 "signerRpc": "http://127.0.0.1:18545"}
        self.rpc.fail = {"anvil_nodeInfo"}
        with self.assertRaises(runtime.Halt):
            self.engine(**local)
        self.rpc.fail.clear()
        with self.engine(**local) as e:
            self.assertTrue(e.live)

    def test_same_journal_lock_rejects_duplicate_worker(self):
        with self.engine():
            with self.assertRaisesRegex(runtime.Halt, "worker"):
                self.engine()

    def test_same_sender_different_journal_rejects_duplicate_worker(self):
        with self.engine():
            with self.assertRaisesRegex(runtime.Halt, "sender"):
                with runtime.Engine(config(), Path(self.tmp.name) / "other.json", True, self.rpc):
                    pass

    def test_ceilings_and_reserve_stop_before_signing(self):
        for changes in ({"maxGas": 20000}, {"maxFeePerGas": 119},
                        {"maxTxCost": 3149999}, {"maxTotalCost": 3149999}):
            with self.subTest(changes=changes), self.engine(**changes) as e:
                with self.assertRaisesRegex(runtime.Halt, "ceiling"):
                    e.transact(ACTION)
        self.rpc.balance = 3150099
        with self.engine() as e:
            with self.assertRaisesRegex(runtime.Halt, "FUNDING ALERT"):
                e.transact(ACTION)
        self.assertFalse(self.signer.signed)
        self.assertFalse(self.rpc.sent)

    def test_preflight_revert_and_rpc_outage_do_not_sign(self):
        for method in ("eth_call", "eth_estimateGas", "eth_gasPrice"):
            with self.subTest(method=method), self.engine() as e:
                self.rpc.fail = {method}
                with self.assertRaises(runtime.Halt):
                    e.transact(ACTION)
                self.rpc.fail.clear()
        self.assertFalse(self.signer.signed)

    def test_unknown_pending_nonce_refuses_signing(self):
        self.rpc.pending = 1
        with self.engine() as e, self.assertRaisesRegex(runtime.Halt, "unknown pending"):
            e.transact(ACTION)
        self.assertFalse(self.signer.signed)

    def test_signer_cannot_change_transaction(self):
        changes = ({"nonce": "0x2"}, {"gas": "0xffff"}, {"gasPrice": "0x1"},
                   {"value": "0x1"}, {"chainId": "0x1"}, {"signer": TARGET},
                   {"to": SENDER}, {"input": "0xbeef"})
        for change in changes:
            with self.subTest(change=change), self.engine() as e:
                self.signer.changed = change
                with self.assertRaisesRegex(runtime.Halt, "signer changed"):
                    e.transact(ACTION)
                self.assertFalse(e.state["transactions"])
        self.assertFalse(self.rpc.sent)

    def test_lost_broadcast_response_is_durable_and_restart_does_not_resign(self):
        self.rpc.lose_send_response = True
        with self.engine() as e:
            with self.assertRaisesRegex(runtime.Halt, "AFTER broadcast"):
                e.transact(ACTION)
        saved = json.loads(self.path.read_text())
        self.assertEqual(saved["transactions"][ACTION["id"]]["raw"], "0xdeadbeef")
        self.assertEqual(self.path.stat().st_mode & 0o777, 0o600)
        with self.engine() as restarted:
            with self.assertRaises(runtime.Pending):
                restarted.reconcile()
            self.rpc.mine()
            restarted.reconcile()
            self.assertEqual(restarted.transact(ACTION)["status"], "0x1")
        self.assertEqual(len(self.signer.signed), 1)
        self.assertEqual(len(self.rpc.sent), 1)

    def test_dropped_transaction_rebroadcasts_identical_bytes(self):
        with self.engine() as e:
            self.submit_pending(e)
        self.rpc.transaction = None
        with self.engine() as e:
            with self.assertRaises(runtime.Pending):
                e.reconcile()
        self.assertEqual(self.rpc.sent, ["0xdeadbeef", "0xdeadbeef"])
        self.assertEqual(len(self.signer.signed), 1)

    def test_dry_restart_never_rebroadcasts_pending_transaction(self):
        with self.engine() as e:
            self.submit_pending(e)
        self.rpc.transaction = None
        with self.engine(live=False) as e:
            with self.assertRaises(runtime.Pending):
                e.reconcile()
        self.assertEqual(len(self.rpc.sent), 1)

    def test_unknown_replacement_stops(self):
        with self.engine() as e:
            self.submit_pending(e)
            self.rpc.latest = 1
            with self.assertRaisesRegex(runtime.Halt, "REPLACED"):
                e.reconcile()
        self.assertEqual(len(self.signer.signed), 1)

    def test_confirmations_and_receipt_reorg(self):
        with self.engine(confirmations=2) as e:
            self.submit_pending(e)
            self.rpc.mine()
            with self.assertRaisesRegex(runtime.Pending, "confirmations"):
                e.reconcile()
            self.rpc.head += 1
            e.reconcile()
            self.rpc.block_hash = "0x" + "cc" * 32
            with self.assertRaisesRegex(runtime.Halt, "REORG"):
                e.reconcile()

    def test_reverted_transaction_requires_explicit_retry(self):
        with self.engine() as e:
            self.submit_pending(e)
            self.rpc.mine(success=False)
            with self.assertRaises(runtime.Reverted):
                e.reconcile()
            with self.assertRaises(runtime.Reverted):
                e.transact(ACTION)
            e.retry_reverted(ACTION["id"])
            self.assertNotIn(ACTION["id"], e.state["transactions"])
            self.assertEqual(len(e.state["failedAttempts"]), 1)
            self.assertGreater(e.state["spentCeiling"], 0)

    def test_changed_action_id_payload_rejected(self):
        with self.engine() as e:
            self.submit_pending(e)
            self.rpc.mine()
            e.reconcile()
            with self.assertRaisesRegex(runtime.Halt, "Action changed"):
                e.transact({**ACTION, "data": "0xbeef"})

    def test_checkpoint_reorg_stops_before_next_transaction(self):
        with self.engine() as e:
            e.checkpoint("scan", {"number": "0xa", "hash": BLOCK})
            self.rpc.block_hash = "0x" + "cc" * 32
            with self.assertRaisesRegex(runtime.Halt, "REORG"):
                e.transact(ACTION)
        self.assertFalse(self.rpc.sent)

    def test_checkpoint_only_recovery_preserves_transactions_and_cooldowns(self):
        with self.engine() as e:
            self.submit_pending(e)
            self.rpc.mine()
            e.reconcile()
            original = copy.deepcopy(e.state["transactions"])
            e.state["checkpoints"]["scan"] = {"number": 2, "hash": "orphan"}
            e.state["keeper"] = {"rounds": {"0:1": {}}, "urgent": {"old": []},
                                 "cursors": {"vault": 50}, "last": {"process:vault": 100}}
            e.recover_checkpoints()
            self.assertEqual(e.state["transactions"], original)
            self.assertEqual(e.state["checkpoints"], {})
            self.assertEqual(e.state["keeper"]["rounds"], {})
            self.assertEqual(e.state["keeper"]["last"], {"process:vault": 100})

    def test_checkpoint_recovery_refuses_pending_or_orphaned_own_transactions(self):
        with self.engine() as e:
            self.submit_pending(e)
            with self.assertRaisesRegex(runtime.Halt, "confirmed"):
                e.recover_checkpoints()
            self.rpc.mine()
            e.reconcile()
            self.rpc.block_hash = "changed"
            with self.assertRaisesRegex(runtime.Halt, "own transaction orphaned"):
                e.recover_checkpoints()

    def replacement(self, engine):
        original = engine.state["transactions"][ACTION["id"]]["tx"]
        replacement = {**original, "input": original["data"], "gasPrice": "0xfa"}
        self.rpc.transaction = replacement
        self.rpc.mine()
        return replacement

    def test_adopt_replacement_preserves_identity_and_accounts_budget(self):
        with self.engine() as e:
            self.submit_pending(e)
            replacement = self.replacement(e)
            before = e.state["spentCeiling"]
            replacement["input"] = "0xbeef"
            with self.assertRaisesRegex(runtime.Halt, "calldata"):
                e.adopt(ACTION["id"], HASH)
            replacement["input"] = ACTION["data"]
            e.adopt(ACTION["id"], HASH)
            self.assertGreater(e.state["spentCeiling"], before)

    def test_adopt_replacement_refuses_excess_gas_and_total_budget(self):
        for updates in ({"gasPrice": "0xffff"}, {"gas": "0xffffff"}):
            with self.subTest(updates=updates), self.engine() as e:
                if not e.state["transactions"]:
                    self.submit_pending(e)
                replacement = self.replacement(e)
                replacement.update(updates)
                with self.assertRaisesRegex(runtime.Halt, "ceiling"):
                    e.adopt(ACTION["id"], HASH)
        with self.engine(maxTotalCost=4000000) as e:
            self.replacement(e)
            with self.assertRaisesRegex(runtime.Halt, "ceiling"):
                e.adopt(ACTION["id"], HASH)

    def test_unconfirmed_adopt_does_not_rebroadcast_original_bytes(self):
        with self.engine(confirmations=2) as e:
            self.submit_pending(e)
            self.replacement(e)
            with self.assertRaises(runtime.Pending):
                e.adopt(ACTION["id"], HASH)
            self.rpc.receipt = self.rpc.transaction = None
            self.rpc.latest = 0
            with self.assertRaisesRegex(runtime.Halt, "replacement"):
                e.reconcile()
        self.assertEqual(len(self.rpc.sent), 1)


if __name__ == "__main__":
    unittest.main()
