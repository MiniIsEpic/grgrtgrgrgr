import { redis } from './redis.js';

// DexScreener: free, no key, covers both chains.
const DEX = { sol: 'solana', eth: 'ethereum' };
export const NATIVE = {
  sol: { id: 'So11111111111111111111111111111111111111112' }, // wrapped SOL
  eth: { id: '0xC02aaA39b223FE8D0A0e5C4F27eAD9083C756Cc2' }, // WETH
};
const minLiq = () => Number(process.env.MIN_LIQUIDITY_USD ?? 10000);

// -> { [id]: usdPrice }   0 = no trusted market, undefined = lookup failed
export async function prices(chain, ids) {
  const dex = DEX[chain];
  const key = (id) => `px:${dex}:${id.toLowerCase()}`;
  const out = {};
  const missing = [];

  for (const id of [...new Set(ids)]) {
    const c = await redis.get(key(id));
    if (c !== null && c !== undefined) out[id] = Number(c);
    else missing.push(id);
  }

  for (let i = 0; i < missing.length; i += 30) {
    const batch = missing.slice(i, i + 30);
    let pairs = null;
    try {
      const r = await fetch(`https://api.dexscreener.com/tokens/v1/${dex}/${batch.join(',')}`);
      if (r.ok) pairs = await r.json();
    } catch {}
    for (const id of batch) {
      if (!Array.isArray(pairs)) { out[id] = undefined; continue; } // failed: don't cache
      const best = pairs
        .filter((p) => p.baseToken?.address?.toLowerCase() === id.toLowerCase() && (p.liquidity?.usd || 0) >= minLiq())
        .sort((a, b) => b.liquidity.usd - a.liquidity.usd)[0];
      const px = best ? Number(best.priceUsd) || 0 : 0;
      out[id] = px;
      await redis.set(key(id), px, { ex: 120 });
    }
  }
  return out;
}

// Adds USD values to a normalised tx. n.value = null means "couldn't price" (fail open).
export async function enrich(n) {
  const nat = NATIVE[n.chain].id;
  const ids = [...(n.native ? [nat] : []), ...n.tokens.map((t) => t.id)];
  const px = ids.length ? await prices(n.chain, ids) : {};

  let inflow = 0, outflow = 0, unknown = false;
  const leg = (amount, price) => {
    if (price === undefined) { unknown = true; return null; }
    const v = amount * price;
    if (v > 0) inflow += v; else outflow += -v;
    return v;
  };
  n.nativeUsd = n.native ? leg(n.native, px[nat]) : null;
  for (const t of n.tokens) t.usd = leg(t.amount, px[t.id]);
  n.value = unknown ? null : Math.max(inflow, outflow);
  return n;
}
