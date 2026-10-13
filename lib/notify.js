import { redis } from './redis.js';
import { chatsFor, chatAddrs, isMuted, getMinUsd } from './store.js';
import { send } from './telegram.js';
import { enrich } from './price.js';
import { format } from './format.js';

// Fan out one transaction to every chat tracking `addr`, applying each chat's USD threshold.
export async function notify(addr, n) {
  // dedupe so webhook retries / poll+webhook overlap never double-notify
  const fresh = await redis.set(`seen:${addr}:${n.sig}`, 1, { nx: true, ex: 86400 });
  if (!fresh) return;

  await enrich(n);

  for (const chat of await chatsFor(addr)) {
    if (await isMuted(chat)) continue;
    const min = await getMinUsd(chat);
    if (n.value !== null && n.value < min) continue; // null = couldn't price -> fail open
    const label = (await chatAddrs(chat))[addr];
    await send(chat, format(n, addr, label ? String(label) : ''));
  }
}
