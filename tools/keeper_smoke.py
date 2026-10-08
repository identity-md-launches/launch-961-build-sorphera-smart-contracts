#!/usr/bin/env python3
"""LOCAL ANVIL SEPOLIA FORK ONLY: keeper lifecycle/restart smoke test.

Uses production lottery and deployed coordinator request path, controlled mock FWA,
and explicitly impersonated oracle callbacks. This is NOT live VRF evidence.
Start a fresh fork at block 11866914; never point this script at a public endpoint.
"""
import argparse
import json
from pathlib import Path
import tempfile
import time

from canary import Canary, COORDINATOR, encoded_picks
from contracts import Contract
from keeper import Keeper
from runtime import Engine, Pending, RPCUnavailable, Rpc, calldata, cast, local_fork, number


class ForkRpc(Rpc):
    """Archive reads can be slow while Anvil first populates its fork cache."""
    def call(self, method, params):
        for attempt in range(4):
            try:
                result = super().call(method, params)
                if method in ("eth_sendRawTransaction", "eth_sendTransaction"):
                    # Force local mining before the immediate receipt query: a
                    # fork node can otherwise delegate a momentarily missing
                    # receipt to its slow upstream archive provider.
                    super().call("evm_mine", [])
                return result
            except RPCUnavailable:
                # A send response is ambiguous: only the journal may recover it.
                if method.startswith("eth_send") or attempt == 3:
                    raise
                time.sleep(1)


def local_picks(engine, lottery, game, word):
    """Known mock callback word only: equivalent Balls sampling for fixture entries."""
    seed = engine.read(lottery, "seedFor(uint8,uint256,uint256)(bytes32)", game, 1, word)[0]
    def uniform(domain, n):
        counter = 0
        threshold = (2**256 - n) % n
        while True:
            encoded = cast("abi-encode", "f(bytes32,bytes32,uint256)", seed, domain, counter)
            x = int(cast("keccak", encoded), 16)
            if x >= threshold:
                return x % n
            counter += 1
    bag, ordered = list(range(1, 21)), []
    for i in range(3):
        index = uniform("0x" + (i + 1).to_bytes(32, "big").hex(), 20-i)
        ordered.append(bag[index])
        bag[index] = bag[19-i]
    bonus = uniform(cast("keccak", "Sorphera bonus"), 5) + 1
    return (*ordered, bonus)


def run(url, output):
    rpc = ForkRpc(url)
    gate = {"rpcUrl": url, "signerRpc": url, "localFork": True}
    local_fork(gate, rpc)
    if number(rpc.call("eth_chainId", [])) != 11155111:
        raise ValueError("Start a local Anvil Sepolia fork with chain ID 11155111")
    if rpc.call("eth_getCode", [COORDINATOR, "latest"]) == "0x":
        raise ValueError("Real Sepolia coordinator code is required on this local fork")
    accounts = rpc.call("eth_accounts", [])
    owner, worker_address = accounts[6], accounts[7]
    # Publicly known development addresses can have real-chain EIP-7702
    # delegations. Normalize ONLY local test actors, never dependency bytecode.
    for actor in (owner, worker_address):
        rpc.call("anvil_setCode", [actor, "0x"])
        rpc.call("anvil_setBalance", [actor, hex(100*10**18)])
    cfg = {**gate, "chainId": 11155111, "sender": owner,
           "signerMethod": "eth_signTransaction", "dedicatedSender": True,
           "confirmations": 1, "maxGas": 15000000, "maxFeePerGas": 10000000000000,
           "maxTxCost": 2*10**18, "maxTotalCost": 20*10**18,
           "minimumBalance": 10**16, "subscriptionMinimum": 10**14,
           "nativeTopUpWei": 10**18, "nativePayment": True,
           "callbackGas": 200000, "requestConfirmations": 3,
           "ticketPriceWei": 1000, "cutoffDelaySeconds": 7200}
    evidence = {"mode": "LOCAL_SEPOLIA_FORK_SIMULATION", "liveVRF": "NOT RUN",
                "oracle": "real coordinator request path; callbacks impersonated ONLY on local Anvil",
                "FWA": "controlled CanaryDependencies mocks; no real FWA integration claim",
                "client": rpc.call("web3_clientVersion", []), "checks": []}
    evidence["localActorSetup"] = "Anvil test actor code cleared and 100 simulated ETH assigned; dependency bytecode retained"
    fork = rpc.call("eth_getBlockByNumber", [hex(11866914), False])
    assert number(fork["number"]) == 11866914, "RPC returned wrong fork block"
    evidence["forkBlockHash"] = fork["hash"]
    with tempfile.TemporaryDirectory(prefix="sorphera-keeper-smoke-", dir="/tmp") as directory:
        admin_path, worker_path = Path(directory)/"admin.json", Path(directory)/"keeper.json"
        with Engine(cfg, admin_path, True, rpc) as admin:
            canary = Canary(admin, cfg, 100)
            for attempt in range(4):
                try:
                    canary.setup()
                    break
                except (Pending, RPCUnavailable):
                    if attempt == 3:
                        raise
                    time.sleep(1)
            addresses = dict(canary.a)
        worker_cfg = {**cfg, "sender": worker_address, "lottery": addresses["lottery"],
                      "deploymentBlock": 11866914, "minimumVRFBalance": 10**14,
                      "openRounds": True, "acquire": True, "acquisitionBatch": 1,
                      "retrySeconds": 0, "processCooldownSeconds": 60, "logBlockBatch": 1000}

        def tick():
            # New Engine/Keeper every iteration exercises durable restart, including event cursors.
            with Engine(worker_cfg, worker_path, True, rpc) as engine:
                worker = Keeper(engine)
                try:
                    return worker.tick()
                except Pending:
                    return None

        def rounds():
            with Engine(worker_cfg, worker_path, False, rpc) as engine:
                lottery = Contract(engine, addresses["lottery"], "Sorphera")
                return [lottery.read("getRound", game, 1) for game in (0, 1)]

        tick()
        tick()
        worker_cfg["openRounds"] = False
        assert all(r["status"] == 1 for r in rounds()), "keeper did not open both games"
        evidence["checks"].append("permissionless keeper opened both games")
        words = (123, 456)
        with Engine(cfg, admin_path, True, rpc) as admin:
            canary = Canary(admin, cfg, 100)
            for game in (0, 1):
                pick = local_picks(admin, addresses["lottery"], game, words[game])
                canary.tx(f"smoke-buy:{game}", addresses["controller"],
                          "buyBatch(address,uint8,uint256,(uint8[3],uint8)[])",
                          addresses["lottery"], game, 1, encoded_picks([pick, pick]), value=2000)
            assert not admin.read(addresses["lottery"], "salesEnabled()(bool)")[0]
        for _ in range(4):
            tick()
        with Engine(cfg, admin_path, True, rpc) as admin:
            canary = Canary(admin, cfg, 100)
            for game, r in enumerate(rounds()):
                vault = Contract(admin, r["vault"], "SorpheraVault")
                assert vault.read("requestCount") == 1
                request = vault.read("requestAt", 0)
                canary.tx(f"smoke-allocate:{game}", addresses["pool"], "allocate(uint256)", request)
        for _ in range(4):
            tick()
        with Engine(cfg, admin_path, False, rpc) as admin:
            for r in rounds():
                assert Contract(admin, r["vault"], "SorpheraVault").read("pending") == 0
        evidence["checks"].append("bounded acquisitions and urgent FWA settlement completed before deadline")
        target = max(r["earliestDraw"] for r in rounds())
        rpc.call("evm_setNextBlockTimestamp", [target])
        rpc.call("evm_mine", [])
        for _ in range(8):
            tick()
            if all(r["status"] == 3 for r in rounds()):
                break
        waiting = rounds()
        assert all(r["status"] == 3 for r in waiting), "draw requests not accepted"
        draw_ids = [r["requestId"] for r in waiting]
        rpc.call("evm_increaseTime", [7200])
        rpc.call("evm_mine", [])
        tick()
        assert [r["requestId"] for r in rounds()] == draw_ids
        assert all(r["status"] == 3 for r in rounds())
        evidence["checks"].append("restart and two-hour delayed callbacks retained accepted draw IDs")

        def mock_callback(request, word):
            # The local_fork gate above is mandatory before any impersonation RPC.
            rpc.call("anvil_impersonateAccount", [COORDINATOR])
            rpc.call("anvil_setBalance", [COORDINATOR, hex(10**18)])
            tx_hash = rpc.call("eth_sendTransaction", [{"from": COORDINATOR,
                "to": addresses["lottery"], "data": calldata("rawFulfillRandomWords(uint256,uint256[])", request, [word]),
                "gas": hex(300000)}])
            rpc.call("anvil_stopImpersonatingAccount", [COORDINATOR])
            receipt = rpc.call("eth_getTransactionReceipt", [tx_hash])
            assert number(receipt["status"]) == 1
            return receipt

        evidence["simulatedCallbacks"] = [mock_callback(request, word) for request, word in zip(draw_ids, words)]
        for _ in range(6):
            tick()
            r = rounds()
            if r[0]["status"] == 5 and r[1]["status"] == 9:
                break
        r = rounds()
        assert r[0]["status"] == 5 and r[0]["matches"] == 2
        assert r[1]["status"] == 9 and r[1]["matches"] == 2
        tie_id = r[1]["tieBreakRequestId"]
        assert len(set([*draw_ids, tie_id])) == 3
        tick()
        assert rounds()[1]["tieBreakRequestId"] == tie_id
        evidence["simulatedCallbacks"].append(mock_callback(tie_id, 789))
        tick()
        r = rounds()
        assert all(x["status"] == 5 for x in r)
        evidence["checks"].append("independent NFT tie request persisted and finalized only after its own callback")
        with Engine(cfg, admin_path, True, rpc) as admin:
            canary = Canary(admin, cfg, 100)
            for game in (0, 1):
                tickets = "[1,2]" if game == 0 else f"[{r[1]['winningTicket']}]"
                canary.admin(f"smoke-claim-eth:{game}", addresses["lottery"],
                             "claimETH(uint8,uint256,uint256[],address)", game, 1, tickets, owner)
            canary.admin("smoke-claim-nft", r[1]["vault"], "claimNFTs(uint256,uint256[],address)",
                         r[1]["winningTicket"], "[0]", owner)
            asset = admin.read(r[1]["vault"], "assets(uint256)(address,uint256,uint256,uint256,bool)", 0)
            assert admin.read(asset[0], "ownerOf(uint256)(address)", asset[1])[0].lower() == owner.lower()
            evidence["adminTransactions"] = admin.state["transactions"]
        with Engine(worker_cfg, worker_path, False, rpc) as engine:
            evidence["keeperTransactions"] = engine.state["transactions"]
            evidence["checkpoints"] = engine.state["checkpoints"]
        evidence.update(addresses=addresses, drawIds=list(map(str, draw_ids)), tieId=str(tie_id),
                        finalStatuses=[x["status"] for x in r], forkBlock=11866914)
        evidence["checks"].append("both ETH claims and winning NFT custody verified; no keeper ownership")
        # Signed public bytes are unnecessary in the report; receipt evidence remains.
        for section in ("adminTransactions", "keeperTransactions"):
            for item in evidence[section].values():
                item.pop("raw", None)
        output.write_text(json.dumps(evidence, indent=2) + "\n")
        print(json.dumps({"status": "PASS", "mode": evidence["mode"], "checks": evidence["checks"],
                          "evidence": str(output), "liveVRF": "NOT RUN"}))


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--rpc-url", required=True)
    parser.add_argument("--output", type=Path, required=True)
    args = parser.parse_args()
    run(args.rpc_url, args.output)
