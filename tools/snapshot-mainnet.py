#!/usr/bin/env python3
"""Read-only, pinned dependency evidence. Requires cast and an archive RPC. Never signs."""
import argparse, concurrent.futures, datetime, json, pathlib, subprocess, urllib.request
p = argparse.ArgumentParser()
p.add_argument('--rpc-url', required=True)
p.add_argument('--block', type=int, required=True)
p.add_argument('--output', default='docs/reference/mainnet')
a = p.parse_args()
out = pathlib.Path(a.output)
out.mkdir(parents=True, exist_ok=True)
def cast(*args):
    return subprocess.check_output(['cast', *args, '--rpc-url', a.rpc_url], text=True).strip()
def call(addr, sig, *args):
    return cast('call', addr, sig, *args, '--block', str(a.block))
assert cast('chain-id') == '1', 'mainnet only'
addresses = dict(service='0xCACBd874e24B533935176154E990Bf710F56693A', notifier='0x612dF3a344990F8E53499ec1bC79Be63cFa496D0', buyback='0xaba91665cdf921F0f6B33A099337336B324c9793', floorOracle='0xaA4D9009a4664604b57644bF13e447E9036727DC', pool='0x958C41181182e76F221331b2755b77D9e1426A98',
 rewards='0xA54b44C7a894AA19C49734A753D01f9B8C5f6516',
 token='0xa0Df17B5aC76ABaBA36E1450E2cbCd18A620C845',
 helper='0xcE6d5B618e034f87C7a8B6dCa65FB8669b8c301B',
 permit2='0x000000000022D473030F116dDEE9F6B43aC78BA3',
 hook='0x2C67ebA8A50AF0dB5Fba55F725247a75CbDA6444',
 poolManager='0x000000000004444c5dc75cB358380D2e3dE08A90',
 coordinator='0xD7f86b4b8Cae7D942340FF628F82735b7a20893a')
sigs = {
 'pool':['floorOracle()(address)','fwairLaunchRegistry()(address)','rewards()(address)','token()(address)','quoteAcquisitionPrice()(uint256,uint256,uint256)',
 'vrfCoordinatorAndSubId()(address,uint256)','vrfRequestConfig()(bytes32,uint32)',
 'callbackGasLimit()(uint32)','vrfServiceFee()(uint256)','settlementWindow()(uint256)',
 'finalizeWindow()(uint256)','selectionTimeoutBlocks()(uint256)','selectionSlippageBps()(uint256)',
 'activeListingCount()(uint256)','weightedBackingTotal()(uint256)','ownerAcquisitionFeeBps()(uint256)',
 'ownerSettlementFeeBps()(uint256)','settlementDiscountBps()(uint256)','retainedToProtocol()(bool)',
 'pendingAcquisitionCount()(uint256)','unsettledAcquisitionCount()(uint256)',
 'nextSequenceToProcess()(uint64)','lastIssuedSequence()(uint64)','isPurchaseBlackout()(bool)'],
 'rewards':['fwa()(address)','token()(address)','tokenPoolManager()(address)','tokenHook()(address)',
 'builderRewardBps()(uint256)','tokenBuyAllowanceTotal()(uint256)','currentEpoch()(uint64)','buyback()(address)'],
 'token':['symbol()(string)','decimals()(uint8)','permit2()(address)','poolManager()(address)',
 'hook()(address)','pool()(address)','launched()(bool)'],
 'helper':['token()(address)','permit2()(address)','depositsPaused()(bool)','totalEscrowed()(uint256)'],
 'hook':['token()(address)','poolManager()(address)','externalBuysEnabled()(bool)'],
 'service':['requestFee()(uint256)'],
 'coordinator':['s_config()(uint16,uint32,bool,uint32,uint32,uint32,uint32,uint8,uint8)']}
def record(item):
    name,addr=item
    code=cast('code',addr,'--block',str(a.block)); assert len(code)>2
    (out/(name+'.runtime.hex')).write_text(code+'\n')
    result={'address':addr,'bytes':(len(code)-2)//2,'keccak256':subprocess.check_output(['cast','keccak',code],text=True).strip(),'reads':{}}
    for sig in sigs.get(name,[]):
        try: result['reads'][sig]=call(addr,sig)
        except subprocess.CalledProcessError:result['reads'][sig]={'status':'READ FAILED; investigate ABI/version'}
    url='https://sourcify.dev/server/v2/contract/1/'+addr+'?fields=abi,compilation,deployment'
    try:
        data=json.load(urllib.request.urlopen(url,timeout=45))
        (out/(name+'.abi.json')).write_text(json.dumps(data['abi'],indent=2)+'\n')
        result['sourceVerification']={k:v for k,v in data.items() if k!='abi'}
        result['sourceVerification']['url']=url
    except Exception as e:result['sourceVerification']={'status':'UNAVAILABLE','error':str(e)}
    return name,result
block_data=json.loads(cast('block',str(a.block),'--json'))
result={'chainId':1,'block':a.block,'blockData':block_data.get('data',block_data),
 'gasPriceObservedWei':cast('gas-price'),'gasPriceReadAtUTC':datetime.datetime.now(datetime.timezone.utc).isoformat(),'gasPriceScope':'latest RPC estimate; contract reads/code pinned; quoteAt1Gwei explicitly sets legacy tx.gasprice','quoteGasPriceWei':0,'dependencies':dict(concurrent.futures.ThreadPoolExecutor(max_workers=4).map(record,addresses.items()))}
for who in ['helper','rewards','poolManager']:
    result['dependencies']['token']['reads']['isDistributor('+who+')']=call(addresses['token'],'isDistributor(address)(bool)',addresses[who])
result['quoteAt1Gwei']=cast('call',addresses['pool'],'quoteAcquisitionPrice()(uint256,uint256,uint256)','--block',str(a.block),'--gas-price','1000000000','--legacy')
result['mainnet200GweiKey']=call(addresses['coordinator'],'s_provingKeys(bytes32)(bool,uint64)','0x8077df514608a09f83e4e8d300645594e5d7234665448ba83f51a50f842bd3d9')
(out/'snapshot.json').write_text(json.dumps(result,indent=2)+'\n')
print('Captured chain 1 block', a.block, 'to', out)
