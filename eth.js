const url = () =>
  process.env.ETH_RPC_URL ||
  (process.env.ALCHEMY_API_KEY
    ? `https://eth-mainnet.g.alchemy.com/v2/${process.env.ALCHEMY_API_KEY}`
    : 'https://ethereum-rpc.publicnode.com');

export async function ethRpc(method, params) {
  const r = await fetch(url(), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params }),
  });
  const j = await r.json();
  if (j.error) throw new Error(j.error.message);
  return j.result;
}

export const getEthBalance = async (a) => Number(BigInt(await ethRpc('eth_getBalance', [a, 'latest']))) / 1e18;

// latest transfers in or out (needs ALCHEMY_API_KEY)
export async function ethRecent(addr, n = 5) {
  if (!process.env.ALCHEMY_API_KEY) throw new Error('/recent for ETH needs ALCHEMY_API_KEY');
  const base = {
    fromBlock: '0x0', toBlock: 'latest', order: 'desc', withMetadata: true,
    category: ['external', 'internal', 'erc20'], maxCount: '0x' + n.toString(16),
  };
  const [inc, out] = await Promise.all([
    ethRpc('alchemy_getAssetTransfers', [{ ...base, toAddress: addr }]),
    ethRpc('alchemy_getAssetTransfers', [{ ...base, fromAddress: addr }]),
  ]);
  const seen = new Set();
  return [...inc.transfers, ...out.transfers]
    .sort((a, b) => parseInt(b.blockNum, 16) - parseInt(a.blockNum, 16))
    .filter((t) => (seen.has(t.hash) ? false : seen.add(t.hash)))
    .slice(0, n)
    .map((t) => ({
      hash: t.hash,
      dir: t.to?.toLowerCase() === addr ? '🟢 in' : '🔴 out',
      value: t.value,
      asset: t.asset,
      time: t.metadata?.blockTimestamp,
    }));
}
