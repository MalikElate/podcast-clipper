let tokenProvider = null;
let resolveTokenProviderReady;
let tokenProviderReady = new Promise(resolve => { resolveTokenProviderReady = resolve; });

export function installTokenProvider(provider) {
  tokenProvider = provider;
  resolveTokenProviderReady();
  return () => {
    if (tokenProvider !== provider) return;
    tokenProvider = null;
    tokenProviderReady = new Promise(resolve => { resolveTokenProviderReady = resolve; });
  };
}

export async function getAuthToken(options) {
  while (!tokenProvider) await tokenProviderReady;
  return tokenProvider(options);
}
