export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
}

const AF_ADDRESS =
  "0xfefefefefefefefefefefefefefefefefefefefe";

const USDC_ADDRESS = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";

const USDC_DECIMALS = 6;

const INFO_API = "https://api.hyperliquid.xyz/info";

const EVM_RPC = "https://rpc.hyperliquid.xyz/evm";

async function getBalance() {
  const res = await fetch(INFO_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "spotClearinghouseState",
      user: AF_ADDRESS,
    }),
  });

  const json: any = await res.json();

  const hype = json.balances.find(
    (x: any) => x.coin === "HYPE"
  );

  return Number(hype?.total ?? 0);
}

async function getPrice() {
  const res = await fetch(INFO_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "allMids",
    }),
  });

  const mids = await res.json();

  return Number(mids.HYPE);
}

async function getUSDCSupply() {
  const res = await fetch(EVM_RPC, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      "jsonrpc": "2.0",
      "id": 1,
      "method": "eth_call",
      "params": [
        {
          "to": USDC_ADDRESS,
          "data": "0x18160ddd" // totalSupply
        },
        "latest"
      ]
    }),
  });

  const json: any = await res.json();

  const supply = BigInt(json.result);

  return Number(supply) / 10 ** USDC_DECIMALS;
}

async function saveData(env: Env) {
  const balance = await getBalance();
  
  const price = await getPrice();

  const ts = Math.floor(Date.now() / 1000);
  
  const USDCSupply = await getUSDCSupply();

  await env.DB.prepare(
    `
INSERT INTO af_balance_history(ts,balance,price,USDC_supply)
VALUES(?,?,?,?)
`
  )
    .bind(ts, balance, price, USDCSupply)
    .run();
}

async function calc24h(env: Env) {
  const row = await env.DB.prepare(`
    WITH latest AS (
      SELECT ts, balance, USDC_supply FROM af_balance_history ORDER BY ts DESC LIMIT 1
    )
    SELECT
      latest.balance AS current,
      latest.USDC_supply AS usdc,
      COALESCE(
        (SELECT balance FROM af_balance_history WHERE ts <= latest.ts - 86400 ORDER BY ts DESC LIMIT 1),
        0
      ) AS earlier_balance
    FROM latest
  `).first();

  if (!row) {
    return { buyback: 0, current: 0, usdc: 0 };
  }

  const r = row as any;
  return {
    buyback: Math.max(0, Number(r.current) - Number(r.earlier_balance)),
    current: Number(r.current),
    usdc: r.usdc,
  };
}

export default {

  async scheduled(event: ScheduledEvent, env: Env) {
    await saveData(env);
  },

  async fetch(req: Request, env: Env) {

    const url = new URL(req.url);

    if (url.pathname === "/api") {
      const price = await getPrice();
      const stat = await calc24h(env);

      return Response.json({
        currentBalance: stat.current,
        buybackHype: stat.buyback,
        buybackUsd: stat.buyback * price,
        hypePrice: price,
        USDCSupply: stat.usdc,
        USDCDailyInterest: stat.usdc * 3.5 / 100 / 365
      });
    }

    const assetUrl = new URL(req.url);
    if (assetUrl.pathname === "/") {
      assetUrl.pathname = "/index.html";
    }
    return env.ASSETS.fetch(new Request(assetUrl, req));
  },
};
