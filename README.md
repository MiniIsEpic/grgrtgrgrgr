# Solana + Ethereum wallet tracker → Telegram (Vercel)

Push alerts via Helius (Solana) and Alchemy (Ethereum) webhooks, Telegram webhook for commands,
Upstash Redis for state, DexScreener for USD prices. Alerts only fire when the moved value is above
your threshold (default $1; `/threshold <usd>` to change, `0` for everything).

## Deploy
1. Create a bot with @BotFather -> copy token.
2. Push this folder to GitHub -> import in Vercel.
3. Storage -> Marketplace -> add **Upstash Redis**.
4. Env vars from `.env.example`. Helius key for Solana; Alchemy API key + Auth token for Ethereum.
5. Make sure Deployment Protection doesn't block production (webhooks must be publicly reachable).
6. Deploy, then open `https://<your-app>.vercel.app/api/setup?key=<WEBHOOK_SECRET>` once.
7. DM the bot: `/track <solana-or-0x-address> mywallet`

## Notes
- Value = the larger of USD in / USD out for the tx. Tokens with no pool above MIN_LIQUIDITY_USD count as $0,
  so airdropped scam tokens never alert. If the price API is down, alerts fail open (sent without USD).
- NFTs aren't priced, so they won't alert unless threshold is 0 (and ETH NFT transfers are currently skipped).
- No Helius key? Solana falls back to polling via `/api/poll?key=<CRON_SECRET>` every minute (Vercel Cron on Pro,
  or cron-job.org). ETH has no polling fallback; it needs the Alchemy webhook.
