import { redis } from '../lib/redis.js';
import { allAddrs } from '../lib/store.js';
import { chainOf } from '../lib/chain.js';
import { getSignatures, getTx } from '../lib/solana.js';
import { fromRpc } from '../lib/format.js';
import { notify } from '../lib/notify.js';

// Solana-only polling fallback (no Helius). Hit every minute via Vercel Cron (Pro)
// or an external pinger like cron-job.org: /api/poll?key=<CRON_SECRET>
export default async function handler(req, res) {
  const secret = process.env.CRON_SECRET;
  const ok = !secret || req.headers.authorization === `Bearer ${secret}` || req.query.key === secret;
  if (!ok) return res.status(401).end();

  let sent = 0;
  for (const addr of (await allAddrs()).filter((a) => chainOf(a) === 'sol')) {
    try {
      const last = await redis.get(`last:${addr}`);
      const sigs = await getSignatures(addr, last ? { until: String(last), limit: 20 } : { limit: 1 });
      if (!sigs.length) continue;
      await redis.set(`last:${addr}`, sigs[0].signature);
      if (!last) continue; // first run: just set the cursor

      for (const s of sigs.reverse()) { // oldest -> newest
        const tx = await getTx(s.signature);
        if (!tx) continue;
        await notify(addr, fromRpc(s.signature, tx, addr));
        sent++;
      }
    } catch (e) {
      console.error('poll error', addr, e);
    }
  }
  res.status(200).json({ ok: true, sent });
}
