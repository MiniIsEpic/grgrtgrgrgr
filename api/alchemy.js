import { redis } from './redis.js';
import { publicUrl } from './helius.js';

const D = 'https://dashboard.alchemy.com/api';
const headers = () => ({ 'X-Alchemy-Token': process.env.ALCHEMY_AUTH_TOKEN, 'content-type': 'application/json' });

async function check(r) {
  if (!r.ok) throw new Error('Alchemy webhook sync failed: ' + (await r.text()));
  return r;
}

// Add an address to the (single) Alchemy ADDRESS_ACTIVITY webhook, creating it on first use.
export async function ethAdd(addr) {
  if (!process.env.ALCHEMY_AUTH_TOKEN) return 'no-token';
  const id = await redis.get('alchemy:webhook');
  if (!id) {
    const r = await check(await fetch(`${D}/create-webhook`, {
      method: 'POST',
      headers: headers(),
      body: JSON.stringify({
        network: 'ETH_MAINNET',
        webhook_type: 'ADDRESS_ACTIVITY',
        webhook_url: `${publicUrl()}/api/alchemy?key=${process.env.WEBHOOK_SECRET}`,
        addresses: [addr],
      }),
    }));
    await redis.set('alchemy:webhook', String((await r.json()).data.id));
  } else {
    await check(await fetch(`${D}/update-webhook-addresses`, {
      method: 'PATCH',
      headers: headers(),
      body: JSON.stringify({ webhook_id: String(id), addresses_to_add: [addr], addresses_to_remove: [] }),
    }));
  }
  return 'ok';
}

export async function ethRemove(addr) {
  const id = await redis.get('alchemy:webhook');
  if (!process.env.ALCHEMY_AUTH_TOKEN || !id) return;
  await check(await fetch(`${D}/update-webhook-addresses`, {
    method: 'PATCH',
    headers: headers(),
    body: JSON.stringify({ webhook_id: String(id), addresses_to_add: [], addresses_to_remove: [addr] }),
  }));
}
