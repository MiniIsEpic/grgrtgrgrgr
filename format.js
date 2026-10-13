import { esc } from './telegram.js';
import { short, SYMBOL, CHAIN_NAME, txUrl, addrUrl, amt, usd, utc } from './chain.js';

/* Normalised shape (all sources):
   { chain, sig, time, failed, type, native (whole units, signed),
     tokens: [{ id, symbol?, amount (signed) }], counterparty } */

export function fromHelius(tx, addr) {
  let lamports = 0, cp = null;
  for (const t of tx.nativeTransfers || []) {
    if (t.toUserAccount === addr) { lamports += t.amount; cp ||= t.fromUserAccount; }
    if (t.fromUserAccount === addr) { lamports -= t.amount; cp ||= t.toUserAccount; }
  }
  const map = {};
  for (const t of tx.tokenTransfers || []) {
    if (t.toUserAccount === addr) { map[t.mint] = (map[t.mint] || 0) + t.tokenAmount; cp ||= t.fromUserAccount; }
    if (t.fromUserAccount === addr) { map[t.mint] = (map[t.mint] || 0) - t.tokenAmount; cp ||= t.toUserAccount; }
  }
  return {
    chain: 'sol',
    sig: tx.signature,
    time: tx.timestamp,
    failed: !!tx.transactionError,
    type: [tx.type, tx.source].filter((x) => x && x !== 'UNKNOWN').join(' · '),
    native: lamports / 1e9,
    tokens: Object.entries(map).filter(([, v]) => v).map(([id, amount]) => ({ id, amount })),
    counterparty: cp,
  };
}

export function fromRpc(sig, tx, addr) {
  const keys = tx.transaction.message.accountKeys.map((k) => k.pubkey || k);
  const i = keys.indexOf(addr);
  const lamports = i >= 0 ? tx.meta.postBalances[i] - tx.meta.preBalances[i] : 0;
  const map = {};
  for (const b of tx.meta.postTokenBalances || [])
    if (b.owner === addr) map[b.mint] = (map[b.mint] || 0) + Number(b.uiTokenAmount.uiAmountString || 0);
  for (const b of tx.meta.preTokenBalances || [])
    if (b.owner === addr) map[b.mint] = (map[b.mint] || 0) - Number(b.uiTokenAmount.uiAmountString || 0);
  return {
    chain: 'sol',
    sig,
    time: tx.blockTime,
    failed: !!tx.meta.err,
    type: '',
    native: lamports / 1e9,
    tokens: Object.entries(map).filter(([, v]) => v).map(([id, amount]) => ({ id, amount })),
    counterparty: null,
  };
}

// acts = Alchemy ADDRESS_ACTIVITY entries sharing one tx hash; addr is lowercase
export function fromAlchemy(hash, acts, addr, time) {
  let native = 0, cp = null;
  const map = {};
  for (const a of acts) {
    const from = a.fromAddress?.toLowerCase();
    const to = a.toAddress?.toLowerCase();
    if (from === to) continue;
    const sign = to === addr ? 1 : from === addr ? -1 : 0;
    if (!sign) continue;
    const v = Number(a.value) || 0;
    const isNative = a.category === 'external' || a.category === 'internal';
    const isToken = a.category === 'token' || a.category === 'erc20';
    if (!isNative && !isToken) continue; // NFTs aren't priced
    cp ||= sign > 0 ? from : to;
    if (isNative) native += sign * v;
    else {
      const id = (a.rawContract?.address || a.asset || '?').toLowerCase();
      const e = (map[id] ||= { id, symbol: a.asset, amount: 0 });
      e.amount += sign * v;
    }
  }
  return {
    chain: 'eth',
    sig: hash,
    time,
    failed: false,
    type: '',
    native,
    tokens: Object.values(map).filter((t) => t.amount),
    counterparty: cp,
  };
}

export function format(n, addr, label) {
  const pos = n.native > 0 || n.tokens.some((t) => t.amount > 0);
  const neg = n.native < 0 || n.tokens.some((t) => t.amount < 0);
  const head = n.failed ? '❌ Failed transaction'
    : pos && neg ? '🔁 Swap / mixed'
    : pos ? '🟢 Incoming'
    : neg ? '🔴 Outgoing'
    : 'ℹ️ Activity';

  const sym = SYMBOL[n.chain];
  const sgn = (x) => (x > 0 ? '+' : '−');
  const val = (u) => (u !== null && u !== undefined && u !== 0 ? ` (~${usd(Math.abs(u))})` : '');

  const lines = [
    `<b>${head}</b>`,
    `👛 <a href="${addrUrl(n.chain, addr)}">${esc(label || short(addr))}</a> · ${CHAIN_NAME[n.chain]}`,
  ];
  if (n.native) lines.push(`${sgn(n.native)}${amt(Math.abs(n.native))} ${sym}${val(n.nativeUsd)}`);
  for (const t of n.tokens)
    lines.push(`${sgn(t.amount)}${amt(Math.abs(t.amount))} <code>${esc(t.symbol || short(t.id))}</code>${val(t.usd)}`);
  if (n.value > 0) lines.push(`💵 Value: ~${usd(n.value)}`);
  if (n.counterparty) lines.push(`${pos && !neg ? 'From' : 'To'}: <code>${short(n.counterparty)}</code>`);
  if (n.type) lines.push(`Type: ${esc(n.type)}`);
  if (n.time) lines.push(utc(n.time));
  lines.push(`<a href="${txUrl(n.chain, n.sig)}">View transaction</a>`);
  return lines.join('\n');
}
