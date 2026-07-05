export interface Env {
  DB: D1Database;
}

const AF_ADDRESS =
  "0xfefefefefefefefefefefefefefefefefefefefe";

const INFO_API = "https://api.hyperliquid.xyz/info";

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

async function saveBalance(env: Env) {
  const balance = await getBalance();

  const ts = Math.floor(Date.now() / 1000);

  await env.DB.prepare(
    `
INSERT INTO af_balance_history(ts,balance)
VALUES(?,?)
`
  )
    .bind(ts, balance)
    .run();
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
    };
  }

  const first = Number(result[0].balance);
  const last = Number(result[result.length - 1].balance);

  return {
    buyback: Math.max(0, last - first),
    current: last,
  };
}

export default {

  async scheduled(event: ScheduledEvent, env: Env) {
    await saveBalance(env);
  },

  async fetch(req: Request, env: Env) {

    const price = await getPrice();

    const stat = await calc24h(env);

    return Response.json({
      currentBalance: stat.current,
      buybackHype: stat.buyback,
      buybackUsd: stat.buyback * price,
      price,
    });

  },
};
