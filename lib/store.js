import { redis } from './redis.js';
import { chainOf, norm } from './chain.js';

export async function trackAddr(chat, addr, label = '') {
  await redis.sadd('addrs', addr);
  await redis.sadd(`a:${addr}`, String(chat));
  await redis.hset(`c:${chat}`, { [addr]: label });
}

// returns true if nobody tracks this address anymore
export async function untrackAddr(chat, addr) {
  await redis.srem(`a:${addr}`, String(chat));
  await redis.hdel(`c:${chat}`, addr);
  if (!(await redis.scard(`a:${addr}`))) {
    await redis.srem('addrs', addr);
    await redis.del(`last:${addr}`);
    return true;
  }
  return false;
}

// { address: label }
export const chatAddrs = async (chat) => (await redis.hgetall(`c:${chat}`)) || {};
export const chatsFor = async (addr) => (await redis.smembers(`a:${addr}`)).map(String);
export const allAddrs = async () => (await redis.smembers('addrs')).map(String);

export const isMuted = async (chat) => (await redis.sismember('muted', String(chat))) === 1;
export const setMuted = (chat, on) =>
  on ? redis.sadd('muted', String(chat)) : redis.srem('muted', String(chat));

// per-chat USD threshold (default $1, override with DEFAULT_MIN_USD)
export async function getMinUsd(chat) {
  const v = await redis.hget('minusd', String(chat));
  return v === null || v === undefined ? Number(process.env.DEFAULT_MIN_USD ?? 1) : Number(v);
}
export const setMinUsd = (chat, v) => redis.hset('minusd', { [String(chat)]: v });

// resolve an address or a label to a stored address for this chat
export async function resolve(chat, arg) {
  if (!arg) return null;
  if (chainOf(arg)) return norm(arg);
  const mine = await chatAddrs(chat);
  const hit = Object.entries(mine).find(([, l]) => String(l).toLowerCase() === arg.toLowerCase());
  return hit ? hit[0] : null;
}
