#!/usr/bin/env python3
"""Read-only deployment/activation preflight; null drafts fail. No keys or transactions."""
import argparse,json,subprocess
p=argparse.ArgumentParser();p.add_argument('config');p.add_argument('--rpc-url',required=True);p.add_argument('--block',required=True);a=p.parse_args()
c=json.load(open(a.config))
def checked(v,name):
 if v is None or v=='' or v==0 or v=='0' or (isinstance(v,str) and v.startswith('0x') and int(v,16)==0):raise SystemExit('UNCONFIGURED: '+name)
 return v
def cast(*args):return subprocess.check_output(['cast',*map(str,args),'--rpc-url',a.rpc_url],text=True).strip()
def call(addr,sig,*args):return cast('call',addr,sig,*args,'--block',a.block)
for name in ['owner','treasury','pool','helper','coordinator','gasPriceAssumptionWei']:checked(c.get(name),name)
for name in ['subscription','keyHash','confirmations','callbackGas','minimumFundingWei']:checked(c['randomness'].get(name),'randomness.'+name)
for game in ['ETH','NFT']:
 rules=checked(c['rules'].get(game),'rules.'+game)
 for field in ['price','firstCutoff','settlementDelay','maxFee','maxTotal','minValue']:checked(rules.get(field),game+'.'+field)
assert int(cast('chain-id'))==c['chainId'] and c['chainId'] in (1,11155111),'wrong chain'
for name in ['pool','helper','coordinator']:
 assert len(cast('code',c[name],'--block',a.block))>2,'missing code: '+name
pool,helper,coord=c['pool'],c['helper'],c['coordinator']
expected={1:'0xD7f86b4b8Cae7D942340FF628F82735b7a20893a',11155111:'0x9DdfaCa8183c41ad55329BdeeD9F6A8d53168B1B'}
assert coord.lower()==expected[c['chainId']].lower(),'wrong coordinator'
if c['chainId']==1:assert pool.lower()=='0x958c41181182e76f221331b2755b77d9e1426a98','wrong mainnet pool'
assert isinstance(c['randomness'].get('nativePayment'),bool),'choose billing currency'
token=call(pool,'token()(address)');rewards=call(pool,'rewards()(address)')
assert call(rewards,'fwa()(address)').lower()==pool.lower()
assert call(rewards,'token()(address)').lower()==token.lower()
assert call(helper,'token()(address)').lower()==token.lower()
assert call(helper,'depositsPaused()(bool)')=='false'
permit2='0x000000000022d473030f116ddee9f6b43ac78ba3'
assert call(helper,'permit2()(address)').lower()==permit2
assert call(token,'permit2()(address)').lower()==permit2
for dep in [helper,rewards]:assert call(token,'isDistributor(address)(bool)',dep)=='true'
config=c['randomness'];proving=call(coord,'s_provingKeys(bytes32)(bool,uint64)',config['keyHash']);assert proving.startswith('true')
quote=cast('call',pool,'quoteAcquisitionPrice()(uint256,uint256,uint256)','--block',a.block,'--gas-price',c['gasPriceAssumptionWei'],'--legacy')
quote_values=[int(x.split()[0]) for x in quote.splitlines()]
for game in ['ETH','NFT']:
 rules=c['rules'][game]
 assert 0<quote_values[0]<=int(rules['maxFee']) and quote_values[2]<=int(rules['maxTotal']),'quote outside frozen policy: '+game
 assert int(call(pool,'weightedBackingTotal()(uint256)').split()[0])>=int(rules['minValue']),'backing below policy'
report={'status':'READS ONLY; activation still requires onchain validateLaunch and independent review','block':a.block,'chainId':c['chainId'],'quoteAtAssumedGasPrice':quote,'gasPriceObserved':cast('gas-price'),'gasPriceAssumed':c['gasPriceAssumptionWei'],'builderRewardBps':call(rewards,'builderRewardBps()(uint256)'), 'coordinatorConfig':call(coord,'s_config()(uint16,uint32,bool,uint32,uint32,uint32,uint32,uint8,uint8)'), 'subscription':call(coord,'getSubscription(uint256)(uint96,uint96,uint64,address,address[])',config['subscription']),'settlementWindow':call(pool,'settlementWindow()(uint256)'),'finalizeWindow':call(pool,'finalizeWindow()(uint256)'),'activeListings':call(pool,'activeListingCount()(uint256)')}
# Compare balances/membership as numbers, independent of cast's decorated output.
def rawcall(addr,sig,*args):
 data=subprocess.check_output(['cast','calldata',sig,*map(str,args)],text=True).strip()
 return call(addr,'--data',data)
sub=rawcall(coord,'getSubscription(uint256)',config['subscription']).removeprefix('0x')
words=[int(sub[i:i+64],16) for i in range(0,len(sub),64)]
balance=words[1 if config['nativePayment'] else 0]
assert balance>=int(config['minimumFundingWei']),'subscription below company reserve'
if c.get('lottery'):
 assert int(c['lottery'],16) in words[6:],'lottery consumer missing'
else:report['consumer']='NOT YET DEPLOYED: add lottery as consumer after deployment'
print(json.dumps(report,indent=2))
