import { tg } from '../lib/telegram.js';
import { publicUrl, syncWebhook } from '../lib/helius.js';

// Visit once after deploy: https://<your-app>.vercel.app/api/setup?key=<WEBHOOK_SECRET>
export default async function handler(req, res) {
  if (req.query.key !== process.env.WEBHOOK_SECRET) return res.status(401).send('bad key');

  const url = `${publicUrl()}/api/telegram`;
  const hook = await tg('setWebhook', {
    url,
    secret_token: process.env.WEBHOOK_SECRET,
    allowed_updates: ['message'],
  });
  await tg('setMyCommands', {
    commands: [
      { command: 'track', description: 'Track a Solana address' },
      { command: 'untrack', description: 'Stop tracking' },
      { command: 'list', description: 'Tracked wallets' },
      { command: 'balance', description: 'SOL balance' },
      { command: 'recent', description: 'Recent transactions' },
      { command: 'threshold', description: 'Set minimum USD value to alert on' },
      { command: 'mute', description: 'Pause notifications' },
      { command: 'unmute', description: 'Resume notifications' },
    ],
  });
  const helius = await syncWebhook().catch((e) => e.message);
  res.status(200).json({ telegram: hook, url, helius });
}
