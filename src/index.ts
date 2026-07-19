import { JSONParser } from '@streamparser/json-whatwg';

export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  telegram: Queue;
}

const AF_ADDRESS =
  "0xfefefefefefefefefefefefefefefefefefefefe";

const HYPERLAB_ADDRESS =
  "0x43e9abea1910387c4292bca4b94de81462f8a251";
  
const USDC_ADDRESS = "0xb88339CB7199b77E23DB6E890353E22632Ba630f";

const USDC_DECIMALS = 6;

const INFO_API = "https://api.hyperliquid.xyz/info";

const EVM_RPC = "https://rpc.hyperliquid.xyz/evm";

const HYPE_TOKEN_ID = "0x0d01dc56dcaaca66ad901c959b4011ec";

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

  const usdc = json.balances.find(
    (x: any) => x.coin === "USDC"
  );

  return {
    hype: Number(hype?.total ?? 0),
    usdc: Number(usdc?.total ?? 0),
  };
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

  const price = mids?.HYPE ?? 0;

  if (price === 0) {
    console.error("get HYPE price error");
  }

  return Number(price);
}

async function getHYPESupplyDetail() {
  const res = await fetch(INFO_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      type: "tokenDetails",
      tokenId: HYPE_TOKEN_ID
    }),
  });
  const detail = await res.json();
  const futureEmissions = detail.futureEmissions;
  const nonCirculatingUserBalances = detail.nonCirculatingUserBalances;
  const totalSupply = detail.totalSupply;
  return {
    futureEmissions: futureEmissions,
    nonCirculatingUserBalances: nonCirculatingUserBalances,
    totalSupply: totalSupply
  }
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

async function saveSupply(env: Env) {
  const { futureEmissions, nonCirculatingUserBalances, totalSupply } =
    await getHYPESupplyDetail();

  const ts = Math.floor(Date.now() / 1000);
  const future = Number(futureEmissions ?? 0);
  const total = Number(totalSupply ?? 0);

  const labEntry = nonCirculatingUserBalances?.find(
    (x: any) => x[0] === HYPERLAB_ADDRESS
  );
  const afEntry = nonCirculatingUserBalances?.find(
    (x: any) => x[0] === AF_ADDRESS
  );

  const lab = Number(labEntry?.[1] ?? 0);
  const af = Number(afEntry?.[1] ?? 0);

  await env.DB.prepare(
    `
INSERT INTO hype_supply(ts,future,lab,total,af)
VALUES(?,?,?,?,?)
`
  )
    .bind(ts, future, lab, total, af)
    .run();
}

async function saveData(env: Env) {
  const { hype, usdc } = await getBalance();
  
  const price = await getPrice();

  const ts = Math.floor(Date.now() / 1000);
  
  const USDCSupply = await getUSDCSupply();

  await env.DB.prepare(
    `
INSERT INTO af_balance_history(ts,balance,price,USDC_supply,USDC_balance)
VALUES(?,?,?,?,?)
`
  )
    .bind(ts, hype, price, USDCSupply, usdc)
    .run();
}

async function getSupply(env: Env) {
  const row = await env.DB.prepare(
    `
SELECT *
FROM hype_supply
ORDER BY ts DESC
LIMIT 1
`
  ).first();

  return row.total - row.future - row.af;
}

async function calc24h(env: Env) {
  const now = Math.floor(Date.now() / 1000);

  const since = now - 86400;

  const rows = await env.DB.prepare(
    `
SELECT *
FROM af_balance_history
WHERE ts>=?
ORDER BY ts ASC
`
  )
    .bind(since)
    .all();

  const result = rows.results as any[];

  if (result.length == 0) {
    return {
      buyback: 0,
      current: 0,
      usdc: 0,
      usdc_balance_diff: 0,
    };
  }

  const first = Number(result[0].balance);
  const last = Number(result[result.length - 1].balance);

  return {
    buyback: Math.max(0, last - first),
    current: last,
    usdc: result[result.length - 1].USDC_supply,
    usdc_balance_diff: Number(result[result.length - 1].USDC_balance) - Number(result[0].USDC_balance)
  };
}

async function pushTelegram(env: Env, text: string) {
  await env.telegram.send({
    text: text
  });
}

async function runScheduled(env: Env, pushMessage: boolean) {
  await saveData(env);

  if (pushMessage) {
    const price = await getPrice();
    const stat = await calc24h(env);

    const text = [
      `📊 AF Buyback Report`,
      `Balance: ${stat.current.toLocaleString('en-US')} HYPE`,
      `Buyback (24h): ${stat.buyback.toLocaleString('en-US')} HYPE (\$${(stat.buyback * price).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })})`,
      `HYPE Price: \$${price.toFixed(4)}`,
      `USDC Supply: ${stat.usdc.toLocaleString('en-US')}`,
      `USDC Δ Balance: ${stat.usdc_balance_diff >= 0 ? '+' : ''}${stat.usdc_balance_diff.toLocaleString('en-US')}`,
      `Revenue: \$${(stat.buyback * price + stat.usdc_balance_diff).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`,
      `PE: ${(getSupply() / (stat.buyback * price + stat.usdc_balance_diff) / 365 * price).toFixed(2)}`,
    ].join('\n');

    await pushTelegram(env, text);
  }
}

export default {

  async scheduled(event: ScheduledEvent, env: Env) {
    const hour = new Date().getHours();
    await runScheduled(env, hour % 8 === 7);
    if (hour === 0) {
      await saveSupply(env);
    }
  },

  async fetch(req: Request, env: Env) {

    const url = new URL(req.url);

    if (url.pathname === "/api/scheduled" && req.method === "POST") {
      const { passwd } = await req.json() as { passwd?: string };
      if (!passwd) {
        return Response.json({ error: "missing passwd" }, { status: 400 });
      }
      const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(passwd));
      const hex = [...new Uint8Array(hash)].map(b => b.toString(16).padStart(2, "0")).join("");
      if (hex !== "fd90c7629460f68cb54c7bd7d611c9a3ed21f7f5e1b6c250f85eb8139a3b14b5") {
        return Response.json({ error: "invalid passwd" }, { status: 403 });
      }
      await runScheduled(env, true);
      return Response.json({ success: true });
    }

    if (url.pathname === "/api/update") {
      await saveData(env);
      return Response.json({ success: true });
    }

    if (url.pathname === "/api") {
      const price = await getPrice();
      const stat = await calc24h(env);

      return Response.json({
        currentBalance: stat.current,
        buybackHype: stat.buyback,
        buybackUsd: stat.buyback * price,
        hypePrice: price,
        USDCSupply: stat.usdc,
        USDCDailyInterest: stat.usdc * 3.5 / 100 / 365,
        USDCBalanceDiff: stat.usdc_balance_diff,
        revenue: stat.buyback * price + stat.usdc_balance_diff,
        pe: getSupply() / (stat.buyback * price + stat.usdc_balance_diff) / 365 * price,
      });
    }

    if (url.pathname === "/api/test") {
      await saveSupply(env);
      return Response.json({ success: true });
    }

    const assetUrl = new URL(req.url);
    if (assetUrl.pathname === "/") {
      assetUrl.pathname = "/index.html";
    }
    return env.ASSETS.fetch(new Request(assetUrl, req));
  },
};
