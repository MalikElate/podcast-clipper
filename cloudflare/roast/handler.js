import { RoastError, parseHandle, fetchProfile, analyzeProfile, addAiRoast, limitedText } from './core.js';
const headers = { 'Cache-Control':'no-store', 'Content-Type':'application/json; charset=utf-8', 'X-Content-Type-Options':'nosniff' };
export async function handleTikTokRoast(request, env, ctx, deps = {}) {
  if (request.method !== 'POST') return new Response(JSON.stringify({error:'Use POST to request a roast.'}), {status:405,headers:{...headers,Allow:'POST'}});
  const origin = request.headers.get('Origin');
  if (origin && !['https://findmeadow.com','https://www.findmeadow.com','https://app.findmeadow.com'].includes(origin)) return Response.json({error:'Open this tool on findmeadow.com.'},{status:403,headers});
  try {
    if (!request.headers.get('Content-Type')?.startsWith('application/json')) throw new RoastError('Send a JSON request.',415);
    const text = await limitedText(request, 1024);
    let data; try { data=JSON.parse(text); } catch { throw new RoastError('Enter a TikTok handle.'); }
    const handle = parseHandle(data?.handle);
    if (!env.ROAST_LIMITER) throw new RoastError('The roast tool is temporarily unavailable. Please try again shortly.',503,'unavailable');
    const rate = await env.ROAST_LIMITER.limit({key:request.headers.get('CF-Connecting-IP') || 'unknown'});
    if (!rate.success) throw new RoastError('Give the roast a minute to cool down, then try again.',429,'rate_limited');
    const cache = deps.cache || globalThis.caches?.default;
    const cacheKey = new Request(`https://findmeadow.com/__roast-cache/v2/${handle}`);
    const cached = await cache?.match(cacheKey);
    if (cached) return Response.json(await cached.json(),{headers});
    const profile = await fetchProfile(handle, deps.fetcher);
    let result = analyzeProfile(profile);
    if (env.ROAST_AI && env.ROAST_BUDGET) {
      let permit = false;
      try { permit = await env.ROAST_BUDGET.getByName('daily').take(); } catch { /* fail closed on AI spend */ }
      if (permit) result = await addAiRoast(result, env.ROAST_AI);
    }
    if (cache) {
      const save = cache.put(cacheKey,Response.json(result,{headers:{'Cache-Control':'public, max-age=3600'}}));
      if (ctx?.waitUntil) ctx.waitUntil(save); else await save;
    }
    return Response.json(result,{headers});
  } catch (error) {
    const known = error instanceof RoastError;
    return Response.json({error:known ? error.message : 'The roast could not finish. Please try again shortly.',code:known ? error.code : 'unavailable'},{status:known ? error.status : 503,headers:{...headers,...(error.status===429 ? {'Retry-After':'60'} : {})}});
  }
}
