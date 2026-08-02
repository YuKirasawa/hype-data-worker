import {
  getBalance,
  getHYPESupplyDetail,
  getPrice,
  getUSDCSupply,
} from './hyperliquid';
import {
  get24hRows,
  getLatestSupply,
  insertBalanceRow,
  insertSupplyRow,
} from './db';
import {
  AF_ADDRESS,
  HYPERLAB_ADDRESS,
  USDC_INTEREST_RATE_PCT,
} from './config';
import { type Stats, buybackReport } from './message';
import type { Env } from './types';

export async function saveData(env: Env) {
  const { hype, usdc } = await getBalance();
  const price = await getPrice();
  const usdcSupply = await getUSDCSupply();

  await insertBalanceRow(env, {
    ts: Math.floor(Date.now() / 1000),
    balance: hype,
    price,
    usdcSupply,
    usdcBalance: usdc,
  });
}

export async function saveSupply(env: Env) {
  const { futureEmissions, nonCirculatingUserBalances, totalSupply } =
    await getHYPESupplyDetail();

  const future = Number(futureEmissions ?? 0);
  const total = Number(totalSupply ?? 0);

  const labEntry = nonCirculatingUserBalances?.find(
    (x) => x[0] === HYPERLAB_ADDRESS
  );
  const afEntry = nonCirculatingUserBalances?.find(
    (x) => x[0] === AF_ADDRESS
  );

  const lab = Number(labEntry?.[1] ?? 0);
  const af = Number(afEntry?.[1] ?? 0);

  await insertSupplyRow(env, {
    ts: Math.floor(Date.now() / 1000),
    future,
    lab,
    total,
    af,
  });
}

export async function getSupply(env: Env): Promise<number> {
  const { total, future, af } = await getLatestSupply(env);

  return total - future - af;
}

export interface Calc24hResult {
  buyback: number;
  current: number;
  usdc: number;
  usdc_balance_diff: number;
}

export async function calc24h(env: Env): Promise<Calc24hResult> {
  const rows = await get24hRows(env);

  if (rows.length === 0) {
    return {
      buyback: 0,
      current: 0,
      usdc: 0,
      usdc_balance_diff: 0,
    };
  }

  const first = Number(rows[0].balance);
  const last = Number(rows[rows.length - 1].balance);

  return {
    buyback: Math.max(0, last - first),
    current: last,
    usdc: rows[rows.length - 1].USDC_supply,
    usdc_balance_diff:
      Number(rows[rows.length - 1].USDC_balance) -
      Number(rows[0].USDC_balance),
  };
}

export async function computeStats(env: Env): Promise<Stats> {
  const price = await getPrice();
  const stat = await calc24h(env);
  const hypeSupply = await getSupply(env);
  const revenue = stat.buyback * price + stat.usdc_balance_diff;
  const pe = (hypeSupply / revenue / 365) * price;

  return {
    currentBalance: stat.current,
    buybackHype: stat.buyback,
    buybackUsd: stat.buyback * price,
    hypePrice: price,
    USDCSupply: stat.usdc,
    USDCDailyInterest: (stat.usdc * USDC_INTEREST_RATE_PCT) / 100 / 365,
    USDCBalanceDiff: stat.usdc_balance_diff,
    revenue,
    hypeSupply,
    pe,
  };
}

async function pushTelegram(env: Env, text: string) {
  await env.telegram.send({
    text: text,
  });
}

export async function runScheduled(env: Env, pushMessage: boolean) {
  await saveData(env);

  if (pushMessage) {
    const stats = await computeStats(env);
    const text = buybackReport(stats);

    await pushTelegram(env, text);
  }
}
