export interface Env {
  DB: D1Database;
  ASSETS: Fetcher;
  telegram: Queue;
  wallet_address: string;
  private_key: string;
}
