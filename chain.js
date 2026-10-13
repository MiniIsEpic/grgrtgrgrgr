export const BASE58 = /^[1-9A-HJ-NP-Za-km-z]{32,44}$/;
export const ETH_RE = /^0x[0-9a-fA-F]{40}$/;

// 'eth' | 'sol' | null
export const chainOf = (a) => (ETH_RE.test(a) ? 'eth' : BASE58.test(a) ? 'sol' : null);
// ETH addresses are case-insensitive -> store lowercase
export const norm = (a) => (ETH_RE.test(a) ? a.toLowerCase() : a);

export const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const SYMBOL = { sol: 'SOL', eth: 'ETH' };
export const CHAIN_NAME = { sol: 'Solana', eth: 'Ethereum' };

export const txUrl = (c, s) => (c === 'eth' ? `https://etherscan.io/tx/${s}` : `https://solscan.io/tx/${s}`);
export const addrUrl = (c, a) => (c === 'eth' ? `https://etherscan.io/address/${a}` : `https://solscan.io/account/${a}`);

export const amt = (x) => Number(x).toLocaleString('en-US', { maximumFractionDigits: 6 });
export const usd = (x) =>
  '$' + Number(x).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
export const utc = (t) => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
