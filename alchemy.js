import { allAddrs } from '../lib/store.js';
import { fromAlchemy } from '../lib/format.js';
import { notify } from '../lib/notify.js';

// Receives Alchemy ADDRESS_ACTIVITY webhooks (Ethereum).
export default async function handler(req, res) {
  if (req.query.key !== process.env.WEBHOOK_SECRET) return res.status(401).end();

  const acts = req.body?.event?.activity || [];
  const time = req.body?.createdAt ? Math.floor(Date.parse(req.body.createdAt) / 1000) : undefined;
  const tracked = new Set((await allAddrs()).map((a) => a.toLowerCase()));

  const byHash = {};
  for (const a of acts) (byHash[a.hash] ||= []).push(a);

  for (const [hash, group] of Object.entries(byHash)) {
    try {
      const involved = new Set(group.flatMap((a) => [a.fromAddress?.toLowerCase(), a.toAddress?.toLowerCase()]));
      for (const addr of involved) if (addr && tracked.has(addr)) await notify(addr, fromAlchemy(hash, group, addr, time));
    } catch (e) {
      console.error('alchemy tx error', hash, e);
    }
  }
  res.status(200).json({ ok: true });
}
