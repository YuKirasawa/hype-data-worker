# hype-data-worker

A Cloudflare Worker that tracks the Hyperliquid buyback wallet and token supply data.

## Overview

The worker periodically snapshots data from the Hyperliquid APIs and stores it in a Cloudflare D1 database. It monitors:

- The HYPE balance of the buyback wallet (`0xfefefe...`)
- The HYPE price
- The total HYPE supply
- The total USDC supply on the Hyperliquid EVM chain

From this data it computes derived stats such as 24-hour buyback volume, estimated revenue, and a P/E ratio based on circulating supply.

## How it works

A cron trigger runs every hour. Each run records a data snapshot into the `af_balance_history` table. Once a day (at midnight) it also records supply details into the `hype_supply` table. Every 8th hour it computes stats and pushes a buyback report to a Telegram queue.

## API

- `GET /api` — returns computed stats (balance, buyback, HYPE price, USDC supply, revenue)
- `GET /api/update` — manually triggers a data snapshot
- `POST /api/scheduled` — manually triggers a scheduled run (requires a password)

## Bindings

- `DB` — D1 database
- `telegram` — Queue for Telegram messages

## Data sources

- Hyperliquid info API: `api.hyperliquid.xyz/info`
- Hyperliquid EVM RPC: `rpc.hyperliquid.xyz/evm`

## Dependencies

- `src/hyperliquid-api` — Hyperliquid TypeScript SDK, adapted from [nomeida/hyperliquid](https://github.com/nomeida/hyperliquid). Provides REST and WebSocket clients for interacting with the Hyperliquid exchange API.
