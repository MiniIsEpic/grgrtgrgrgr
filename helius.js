import { redis } from './redis.js';
import { allAddrs } from './store.js';
import { chainOf } from './chain.js';

export const publicUrl = () =>
  process.env.PUBLIC_URL || `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`;

// Keeps the Helius webhook's address list equal to every tracked Solana address.
export async function syncWebhook() {
  const key = process.env.HELIUS_API_KEY;
  if (!key) return 'polling';
  const base = 'https://api.helius.xyz/v0/webhooks';
  const addrs = (await allAddrs()).filter((a) => chainOf(a) === 'sol');
  const id = await redis.get('helius:webhook');

  if (!addrs.length) {
    if (id) {
      await fetch(`${base}/${id}?api-key=${key}`, { method: 'DELETE' });
      await redis.del('helius:webhook');
    }
    return 'ok';
  }

  const body = JSON.stringify({
    webhookURL: `${publicUrl()}/api/helius`,
    transactionTypes: ['ANY'],
    accountAddresses: addrs,
    webhookType: 'enhanced',
    authHeader: process.env.WEBHOOK_SECRET,
  });
  const r = await fetch(id ? `${base}/${id}?api-key=${key}` : `${base}?api-key=${key}`, {
    method: id ? 'PUT' : 'POST',
    headers: { 'content-type': 'application/json' },
    body,
  });
  if (!r.ok) throw new Error('Helius webhook sync failed: ' + (await r.text()));
  if (!id) await redis.set('helius:webhook', String((await r.json()).webhookID));
  return 'ok';
}
