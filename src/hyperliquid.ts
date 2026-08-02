import {
  AF_ADDRESS,
  EVM_RPC,
  HYPE_TOKEN_ID,
  INFO_API,
  RETRIES,
  USDC_ADDRESS,
  USDC_DECIMALS,
} from './config';

export interface AFBalance {
  hype: number;
  usdc: number;
}

export interface SupplyDetail {
  futureEmissions?: number;
  nonCirculatingUserBalances?: Array<[string, string]>;
  totalSupply?: number;
}

async function postInfo(payload: unknown): Promise<any> {
  const res = await fetch(INFO_API, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  return res.json();
}

async function postEvm(params: unknown[]): Promise<any> {
  const res = await fetch(EVM_RPC, {
    method: "POST",
    headers: {
      "content-type": "application/json",
    },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "eth_call",
      params,
    }),
  });

  return res.json();
}

export async function getBalance(retries = RETRIES): Promise<AFBalance> {
  for (let i = 0; i < retries; i++) {
    try {
      const json = await postInfo({
        type: "spotClearinghouseState",
        user: AF_ADDRESS,
      });

      const hype = json.balances.find((x: any) => x.coin === "HYPE");
      const usdc = json.balances.find((x: any) => x.coin === "USDC");

      return {
        hype: Number(hype?.total ?? 0),
        usdc: Number(usdc?.total ?? 0),
      };
    } catch (e) {
      if (i === retries - 1) throw e;
      await new Promise(r => setTimeout(r, 1000 * (i + 1)));
    }
  }

  throw new Error("unreachable");
}

export async function getPrice(): Promise<number> {
  const mids = await postInfo({ type: "allMids" });

  const price = mids?.HYPE ?? 0;

  if (price === 0) {
    console.error("get HYPE price error");
  }

  return Number(price);
}

export async function getHYPESupplyDetail(): Promise<SupplyDetail> {
  const detail = await postInfo({
    type: "tokenDetails",
    tokenId: HYPE_TOKEN_ID,
  });

  return {
    futureEmissions: detail.futureEmissions,
    nonCirculatingUserBalances: detail.nonCirculatingUserBalances,
    totalSupply: detail.totalSupply,
  };
}

export async function getUSDCSupply(): Promise<number> {
  const json = await postEvm([
    {
      to: USDC_ADDRESS,
      data: "0x18160ddd", // totalSupply
    },
    "latest",
  ]);

  const supply = BigInt(json.result);

  return Number(supply) / 10 ** USDC_DECIMALS;
}
