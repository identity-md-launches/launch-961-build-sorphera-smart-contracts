#!/usr/bin/env python3
"""Optional localhost cache for archive reads. Never accepts transaction submission.
Cache is transport evidence only; upstream responses are returned without changing chain state.
"""
import argparse, http.server, json, sqlite3, threading, time, urllib.request, urllib.error
p=argparse.ArgumentParser();p.add_argument('--upstream',required=True);p.add_argument('--port',type=int,default=8547);p.add_argument('--cache',default='/tmp/sorphera-rpc.sqlite');p.add_argument('--interval',type=float,default=0.16);a=p.parse_args()
lock=threading.Lock();db=sqlite3.connect(a.cache,check_same_thread=False);db.execute('create table if not exists rpc (key text primary key, value text)')
allowed={'eth_chainId','eth_blockNumber','eth_getBlockByNumber','eth_getBlockByHash','eth_getCode','eth_getBalance','eth_getStorageAt','eth_getTransactionCount','eth_getTransactionByHash','eth_getTransactionReceipt','eth_call','eth_getLogs','eth_gasPrice','eth_feeHistory','net_version'}
def one(req):
 m=req.get('method'); params=req.get('params',[]); key=json.dumps([a.upstream,m,params],sort_keys=True)
 if m not in allowed:return {'jsonrpc':'2.0','id':req.get('id'),'error':{'code':-32601,'message':'read-only RPC'}}
 cacheable = m in {'eth_chainId','net_version'} or (m not in {'eth_blockNumber','eth_gasPrice'} and 'latest' not in json.dumps(params) and 'pending' not in json.dumps(params))
 with lock:
  row=db.execute('select value from rpc where key=?',(key,)).fetchone() if cacheable else None
  if row:r=json.loads(row[0])
  else:
   for attempt in range(7):
    try:
     time.sleep(a.interval)
     r=json.load(urllib.request.urlopen(urllib.request.Request(a.upstream,json.dumps(req).encode(),{'Content-Type':'application/json'}),timeout=40));break
    except urllib.error.HTTPError as e:
     if e.code not in {429,502,503,504}:raise
     time.sleep(min(2**attempt,20))
   else:raise RuntimeError('RPC retries exhausted')
   if cacheable and 'result' in r:
    db.execute('insert or replace into rpc values (?,?)',(key,json.dumps(r)));db.commit()
 r['id']=req.get('id');return r
class Handler(http.server.BaseHTTPRequestHandler):
 def do_POST(self):
  try:
   q=json.loads(self.rfile.read(int(self.headers['Content-Length'])));r=[one(x) for x in q] if isinstance(q,list) else one(q)
   b=json.dumps(r).encode();self.send_response(200);self.send_header('Content-Type','application/json');self.end_headers();self.wfile.write(b)
  except Exception as e:
   self.send_error(502,str(e))
 def log_message(self,*args):pass
http.server.ThreadingHTTPServer(('127.0.0.1',a.port),Handler).serve_forever()
