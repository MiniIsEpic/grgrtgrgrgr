import { allAddrs } from '../lib/store.js';
import { fromHelius } from '../lib/format.js';
import { notify } from '../lib/notify.js';

// Receives Helius "enhanced" webhook batches (Solana).
export default async function handler(req, res) {
  if (req.headers.authorization !== process.env.WEBHOOK_SECRET) return res.status(401).end();

  const txs = Array.isArray(req.body) ? req.body : [];
  const tracked = new Set(await allAddrs());

  for (const tx of txs) {
    try {
      const involved = new Set([
        tx.feePayer,
        ...(tx.accountData || []).map((a) => a.account),
        ...(tx.nativeTransfers || []).flatMap((t) => [t.fromUserAccount, t.toUserAccount]),
        ...(tx.tokenTransfers || []).flatMap((t) => [t.fromUserAccount, t.toUserAccount]),
      ]);
      for (const addr of involved) if (tracked.has(addr)) await notify(addr, fromHelius(tx, addr));
    } catch (e) {
      console.error('helius tx error', tx?.signature, e);
    }
  }
  res.status(200).json({ ok: true });
}
