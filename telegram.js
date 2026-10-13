import { send, esc } from '../lib/telegram.js';
import { trackAddr, untrackAddr, chatAddrs, resolve, setMuted, getMinUsd, setMinUsd } from '../lib/store.js';
import { chainOf, norm, short, SYMBOL, CHAIN_NAME, txUrl, addrUrl, amt, usd, utc } from '../lib/chain.js';
import { getBalance, getSignatures } from '../lib/solana.js';
import { getEthBalance, ethRecent } from '../lib/eth.js';
import { syncWebhook } from '../lib/helius.js';
import { ethAdd, ethRemove } from '../lib/alchemy.js';
import { prices, NATIVE } from '../lib/price.js';

const HELP = `<b>Wallet tracker · Solana + Ethereum</b>

/track &lt;address&gt; [label] – start watching a wallet
/untrack &lt;address|label&gt; – stop watching
/list – wallets you're tracking
/balance [address|label] – current balance in USD
/recent [address|label] [n] – latest transactions
/threshold [usd] – only alert above this value (default $1, 0 = everything)
/mute · /unmute – pause / resume notifications`;

async function balanceLine(addr, label) {
  const chain = chainOf(addr);
  const bal = chain === 'eth' ? await getEthBalance(addr) : (await getBalance(addr)) / 1e9;
  const px = (await prices(chain, [NATIVE[chain].id]))[NATIVE[chain].id];
  return `${esc(label || short(addr))} (${CHAIN_NAME[chain]}): <b>${amt(bal)} ${SYMBOL[chain]}</b>${px ? ` (~${usd(bal * px)})` : ''}`;
}

async function handle(chat, text) {
  const [raw, ...args] = text.trim().split(/\s+/);
  const cmd = raw.split('@')[0].toLowerCase();

  switch (cmd) {
    case '/start':
    case '/help':
      return send(chat, HELP);

    case '/track': {
      const [input, ...rest] = args;
      const chain = input && chainOf(input);
      if (!chain) return send(chat, 'Usage: /track &lt;solana or ethereum address&gt; [label]');
      const addr = norm(input);
      const label = rest.join(' ').slice(0, 40);
      await trackAddr(chat, addr, label);

      let warn = '';
      try {
        if (chain === 'sol') {
          if ((await syncWebhook()) === 'polling') warn = '\n\n<i>No HELIUS_API_KEY set, so Solana alerts need /api/poll.</i>';
        } else if ((await ethAdd(addr)) === 'no-token') {
          warn = '\n\n⚠️ <i>ETH push alerts need ALCHEMY_AUTH_TOKEN.</i>';
        }
      } catch (e) {
        warn = `\n\n⚠️ ${esc(e.message)}`;
      }
      const bal = await balanceLine(addr, label).catch(() => null);
      return send(chat, `✅ Tracking <a href="${addrUrl(chain, addr)}">${esc(label || short(addr))}</a> (${CHAIN_NAME[chain]})` + (bal ? `\n${bal}` : '') + warn);
    }

    case '/untrack': {
      const addr = await resolve(chat, args.join(' '));
      if (!addr) return send(chat, 'Usage: /untrack &lt;address|label&gt;');
      const gone = await untrackAddr(chat, addr);
      let warn = '';
      try {
        if (chainOf(addr) === 'sol') await syncWebhook();
        else if (gone) await ethRemove(addr);
      } catch (e) {
        warn = `\n⚠️ ${esc(e.message)}`;
      }
      return send(chat, `🗑 Stopped tracking <code>${short(addr)}</code>${warn}`);
    }

    case '/list': {
      const mine = Object.entries(await chatAddrs(chat));
      if (!mine.length) return send(chat, 'Nothing tracked yet. Try /track &lt;address&gt;');
      return send(chat, mine.map(([a, l]) => `• ${l ? `<b>${esc(l)}</b> ` : ''}<code>${a}</code> (${CHAIN_NAME[chainOf(a)]})`).join('\n'));
    }

    case '/balance': {
      const one = args[0] ? await resolve(chat, args[0]) : null;
      const mine = await chatAddrs(chat);
      const targets = one ? [[one, mine[one]]] : Object.entries(mine);
      if (!targets.length) return send(chat, 'Nothing to check. Try /track &lt;address&gt;');
      const out = [];
      for (const [a, l] of targets) out.push(await balanceLine(a, l));
      return send(chat, out.join('\n'));
    }

    case '/recent': {
      const addr = args[0] ? await resolve(chat, args[0]) : Object.keys(await chatAddrs(chat))[0];
      if (!addr) return send(chat, 'Usage: /recent [address|label] [n]');
      const chain = chainOf(addr);
      const n = Math.min(Math.max(parseInt(args[1]) || 5, 1), 15);
      let lines;
      if (chain === 'eth') {
        const rows = await ethRecent(addr, n);
        lines = rows.map((r) => `${r.dir} ${amt(r.value || 0)} ${esc(r.asset || '')} <a href="${txUrl('eth', r.hash)}">${short(r.hash)}</a>`);
      } else {
        const sigs = await getSignatures(addr, { limit: n });
        lines = sigs.map((s) => `${s.err ? '❌' : '✅'} ${s.blockTime ? utc(s.blockTime) : ''} <a href="${txUrl('sol', s.signature)}">${short(s.signature)}</a>`);
      }
      if (!lines.length) return send(chat, 'No transactions found.');
      return send(chat, `<b>Recent: ${short(addr)}</b>\n` + lines.join('\n'));
    }

    case '/threshold': {
      if (!args[0]) return send(chat, `Alerting on activity worth ≥ <b>${usd(await getMinUsd(chat))}</b>. Change with /threshold &lt;usd&gt;`);
      const v = Number(args[0].replace('$', ''));
      if (!Number.isFinite(v) || v < 0) return send(chat, 'Usage: /threshold &lt;usd&gt; (0 = everything)');
      await setMinUsd(chat, v);
      return send(chat, `✅ Now alerting on activity worth ≥ <b>${usd(v)}</b>`);
    }

    case '/mute':
      await setMuted(chat, true);
      return send(chat, '🔕 Notifications muted. /unmute to resume.');
    case '/unmute':
      await setMuted(chat, false);
      return send(chat, '🔔 Notifications on.');

    default:
      return send(chat, 'Unknown command. /help');
  }
}

export default async function handler(req, res) {
  if (req.headers['x-telegram-bot-api-secret-token'] !== process.env.WEBHOOK_SECRET) return res.status(401).end();

  const msg = req.body?.message;
  if (!msg?.text) return res.status(200).end();

  const allowed = (process.env.ALLOWED_USER_IDS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (allowed.length && !allowed.includes(String(msg.from?.id))) {
    await send(msg.chat.id, '⛔ Not authorized.');
    return res.status(200).end();
  }

  try {
    await handle(msg.chat.id, msg.text);
  } catch (e) {
    console.error(e);
    await send(msg.chat.id, `⚠️ ${esc(e.message)}`);
  }
  res.status(200).end(); // always 200 so Telegram doesn't retry
}
