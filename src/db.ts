import type { Env } from './types';
import { DAY_SECONDS } from './config';

export async function insertBalanceRow(
  env: Env,
  data: {
    ts: number;
    balance: number;
    price: number;
    usdcSupply: number;
    usdcBalance: number;
  }
) {
  await env.DB.prepare(
    `
INSERT INTO af_balance_history(ts,balance,price,USDC_supply,USDC_balance)
VALUES(?,?,?,?,?)
`
  )
    .bind(data.ts, data.balance, data.price, data.usdcSupply, data.usdcBalance)
    .run();
}

export async function insertSupplyRow(
  env: Env,
  data: {
    ts: number;
    future: number;
    lab: number;
    total: number;
    af: number;
  }
) {
  await env.DB.prepare(
    `
INSERT INTO hype_supply(ts,future,lab,total,af)
VALUES(?,?,?,?,?)
`
  )
    .bind(data.ts, data.future, data.lab, data.total, data.af)
    .run();
}

export interface LatestSupply {
  total: number;
  future: number;
  af: number;
}

export async function getLatestSupply(env: Env): Promise<LatestSupply> {
  const row = (await env.DB.prepare(
    `
SELECT *
FROM hype_supply
ORDER BY ts DESC
LIMIT 1
`
  ).first()) as any;

  return {
    total: Number(row.total),
    future: Number(row.future),
    af: Number(row.af),
  };
}

export async function get24hRows(env: Env): Promise<any[]> {
  const since = Math.floor(Date.now() / 1000) - DAY_SECONDS;

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

  return rows.results as any[];
}
