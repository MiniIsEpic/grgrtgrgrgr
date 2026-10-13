const rpcUrl = () =>
  process.env.SOLANA_RPC_URL ||
  (process.env.HELIUS_API_KEY
    ? `https://mainnet.helius-rpc.com/?api-key=${process.env.HELIUS_API_KEY}`
    : 'https://api.mainnet-beta.solana.com');

export async function rpc(method, params) {
  const r = await fetch(rpcUrl(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

export const getBalance = async (a) => (await rpc('getBalance', [a])).value;
export const getSignatures = (a, opts = {}) =>
  rpc('getSignaturesForAddress', [a, { limit: 10, ...opts }]);
export const getTx = (sig) =>
  rpc('getTransaction', [sig, { encoding: 'jsonParsed', maxSupportedTransactionVersion: 0 }]);

export const short = (a) => `${a.slice(0, 4)}…${a.slice(-4)}`;
export const sol = (lamports) => (lamports / 1e9).toLocaleString('en-US', { maximumFractionDigits: 6 });
export const txLink = (s) => `https://solscan.io/tx/${s}`;
export const acctLink = (a) => `https://solscan.io/account/${a}`;
export const utc = (t) => new Date(t * 1000).toISOString().replace('T', ' ').slice(0, 19) + ' UTC';
