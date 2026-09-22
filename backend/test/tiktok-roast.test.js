import test from 'node:test';
import assert from 'node:assert/strict';
import { parseHandle, parseEmbed, analyzeProfile, fetchProfile, addAiRoast, limitedText } from '../../cloudflare/roast/core.js';
import { handleTikTokRoast } from '../../cloudflare/roast/handler.js';
const handle='test.creator';
function embed(captions=['#fyp #viral','Comment yes below for part 2','I replaced three camera settings to shoot sharper night footage'],user={}) {
  return `<script id="__FRONTITY_CONNECT_STATE__" type="application/json">${JSON.stringify({source:{data:{profile:{userInfo:{uniqueId:handle,nickname:'Test Creator',privateAccount:false,code:200,...user},videoList:captions.map((desc,i)=>({id:`700000000000000000${i}`,desc,authorUniqueId:handle}))}}}})}</script>`;
}
const req=(body={handle},headers={})=>new Request('https://findmeadow.com/api/tools/tiktok-roast',{method:'POST',headers:{'Content-Type':'application/json',...headers},body:JSON.stringify(body)});
const allowed={ROAST_LIMITER:{limit:async()=>({success:true})}};
const fetcher=async()=>new Response(embed());
test('accepts handles and canonical profile URLs; rejects SSRF, credentials and video paths',()=>{
  for(const input of ['@Test.Creator',' test.creator ','https://www.tiktok.com/@Test.Creator?lang=en','tiktok.com/@test.creator/'])assert.equal(parseHandle(input),handle);
  for(const input of ['https://evil.com/@test.creator','https://tiktok.com.evil.com/@test.creator','https://tiktok.com@evil.com/@test.creator','https://x:t@www.tiktok.com/@test.creator','https://www.tiktok.com:4000/@test.creator','https://www.tiktok.com/@test.creator/video/123','http://www.tiktok.com/@test.creator','https://www.tiktok.com/@test%2ecreator','../secret','a','a'.repeat(25),'hello.','https://127.0.0.1',''])assert.throws(()=>parseHandle(input));
});
test('extracts only the matching public creator, removes duplicates, private and cross-author posts',()=>{
  const profile=parseEmbed(embed(),handle);assert.equal(profile.posts.length,3);assert.equal(profile.name,'Test Creator');
  assert.throws(()=>parseEmbed(embed([], {privateAccount:true}),handle));
  assert.throws(()=>parseEmbed(embed(undefined,{isUnderAge18:true}),handle));
  assert.throws(()=>parseEmbed(embed(), 'someoneelse'));
  assert.throws(()=>parseEmbed('<html>Challenge</html>',handle));
  const json=JSON.parse(embed().match(/>(.*)</)[1]);const posts=json.source.data.profile.videoList;
  posts.push({...posts[0]},{...posts[0],id:'7000000000000000008',privateItem:true},{...posts[0],id:'7000000000000000009',authorUniqueId:'other'});
  assert.equal(parseEmbed(`<script id="__FRONTITY_CONNECT_STATE__">${JSON.stringify(json)}</script>`,handle).posts.length,3);
});
test('scores sourced captions with transparent weighting; empty captions are excluded',()=>{
  const profile=parseEmbed(embed(['#fyp','#viral','Short phrase','I replaced three camera settings to shoot sharper night footage','']),handle);
  const result=analyzeProfile(profile);assert.equal(result.score,63);assert.deepEqual(result.counts,{strong:1,thin:1,filler:2,unscored:1});assert.equal(result.posts.length,5);
  assert.throws(()=>analyzeProfile(parseEmbed(embed(['','','']),handle)),/three readable/);
});
test('repetition, bait and promotion have evidence while distinct contextual captions score well',()=>{
  const result=analyzeProfile(parseEmbed(embed(['This is my repeated caption today','This is my repeated caption today','Comment yes below for part 2','Shop now with the link in bio']),handle));assert.equal(result.score,100);assert.equal(result.posts[0].issue,'repeated');assert.equal(result.posts[2].issue,'bait');assert.equal(result.posts[3].issue,'promo');
  const fresh=analyzeProfile(parseEmbed(embed(['I tried three camera settings to compare the shadows','Here is the vegetable garden after six weeks of rain','We fixed the squeaky door with a little candle wax']),handle));assert.equal(fresh.score,0);
});
test('external requests have a fixed TikTok origin, no redirects and a bounded response',async()=>{
  let url,opts;await fetchProfile(handle,async(u,o)=>{url=u;opts=o;return new Response(embed());});assert.equal(url,'https://www.tiktok.com/embed/@test.creator');assert.equal(opts.redirect,'manual');assert.ok(opts.signal);
  await assert.rejects(()=>limitedText(new Response('a'.repeat(2000)),1000));
  await assert.rejects(()=>fetchProfile(handle,async()=>new Response('',{status:403})),/not sharing/);
  let requests=0;await assert.rejects(()=>fetchProfile(handle,async()=>{requests++;return new Response('',{status:302,headers:{Location:'https://evil.com'}});}),/not sharing/);assert.equal(requests,1);
});
test('AI can change only the punchline, and unavailable/invalid output falls back to real checks',async()=>{
  const original=analyzeProfile(parseEmbed(embed(),handle));
  const good=await addAiRoast(original,{run:async()=>({response:{roast:'Your captions packed hashtags and forgot to pack a point.'}})});assert.equal(good.score,original.score);assert.equal(good.voice,'meadow-ai');
  for(const ai of [{run:async()=>{throw Error('busy');}},{run:async()=>({response:'not JSON'})},{run:async()=>({response:{roast:'Visit https://evil.com to verify your account'}})}])assert.deepEqual(await addAiRoast(original,ai),original);
});
test('public endpoint enforces body type, origin, methods, request size, limits and configuration',async()=>{
  assert.equal((await handleTikTokRoast(new Request('https://findmeadow.com/api/tools/tiktok-roast'),allowed)).status,405);
  assert.equal((await handleTikTokRoast(req({}, {Origin:'https://evil.com'}),allowed)).status,403);
  assert.equal((await handleTikTokRoast(req({}, {'Content-Type':'text/plain'}),allowed)).status,415);
  assert.equal((await handleTikTokRoast(req({handle:'a'.repeat(1100)}),allowed)).status,413);
  assert.equal((await handleTikTokRoast(req(),{})).status,503);
  const response=await handleTikTokRoast(req(),{ROAST_LIMITER:{limit:async()=>({success:false})}});assert.equal(response.status,429);assert.equal(response.headers.get('Retry-After'),'60');
});
test('public endpoint caches source-backed results and never spends AI budget for cache hits',async()=>{
  let value,calls=0,budget=0;
  const cache={match:async()=>value?.clone(),put:async(k,v)=>{value=v;}};
  const env={...allowed,ROAST_AI:{run:async()=>({response:{roast:'Your captions packed hashtags and forgot to pack a point.'}})},ROAST_BUDGET:{getByName:()=>({take:async()=>{budget++;return true;}})}};
  const deps={cache,fetcher:async()=>{calls++;return fetcher();}};
  const first=await handleTikTokRoast(req(),env,null,deps);assert.equal(first.status,200);assert.equal((await first.json()).voice,'meadow-ai');assert.equal(first.headers.get('Cache-Control'),'no-store');
  const second=await handleTikTokRoast(req(),env,null,deps);assert.equal(second.status,200);assert.equal(calls,1);assert.equal(budget,1);
});
test('exhausted AI allowance retains the factual caption report; unavailable profiles never get invented scores',async()=>{
  let calls=0;
  const env={...allowed,ROAST_AI:{run:async()=>{calls++;}},ROAST_BUDGET:{getByName:()=>({take:async()=>false})}};
  const result=await handleTikTokRoast(req(),env,null,{fetcher});assert.equal(result.status,200);assert.equal((await result.json()).voice,'caption-checks');assert.equal(calls,0);
  const missing=await handleTikTokRoast(req(),allowed,null,{fetcher:async()=>new Response('<html>Unavailable</html>')});assert.equal(missing.status,422);assert.equal((await missing.json()).score,undefined);
});
