import {it,expect,vi} from 'vitest';
import {readFileSync} from 'node:fs';
import {runInNewContext} from 'node:vm';
function worker(){
  const events=new Map<string,(event:Record<string,unknown>)=>void>();
  const addAll=vi.fn().mockResolvedValue(undefined);
  const cache={addAll,match:vi.fn().mockResolvedValue(new Response('<script src="/_next/static/chunks/offline.js?dpl=preview123"></script><link href="/_next/static/offline.css?dpl=preview123"><script src="https://untrusted.invalid/_next/static/other.js"></script>'))};
  runInNewContext(readFileSync('public/sw.js','utf8'),{URL,Response,fetch:vi.fn(),self:{location:{href:'https://staging.example/sw.js?build=preview123',origin:'https://staging.example'},addEventListener:(name:string,fn:(event:Record<string,unknown>)=>void)=>events.set(name,fn),skipWaiting:vi.fn(),clients:{claim:vi.fn()}},caches:{open:vi.fn().mockResolvedValue(cache)}});
  return {events,addAll};
}
it('precaches public shell assets with Vercel deployment query keys intact',async()=>{
  const {events,addAll}=worker();let finished:Promise<unknown>|undefined;
  events.get('install')!({waitUntil:(promise:Promise<unknown>)=>{finished=promise;}});await finished;
  expect(addAll.mock.calls[1][0]).toEqual(['https://staging.example/_next/static/chunks/offline.js?dpl=preview123','https://staging.example/_next/static/offline.css?dpl=preview123']);
});
it('does not intercept API responses or external signed attachment URLs for caching',()=>{
  const {events}=worker();const respondWith=vi.fn();
  for(const url of ['https://staging.example/api/v1/knowledge','https://storage.example/private/evidence?token=synthetic'])events.get('fetch')!({request:{method:'GET',url,mode:'cors'},respondWith});
  expect(respondWith).not.toHaveBeenCalled();
});
