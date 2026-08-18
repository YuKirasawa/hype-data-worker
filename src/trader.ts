import { Hyperliquid } from './hyperliquid-api';

export async function trader_main(env: Env) {
  const privateKey = env.private_key;
  const walletAddress = env.wallet_address;
  const sdk = new Hyperliquid({
    enableWs: false,
    privateKey: privateKey,
    walletAddress: walletAddress,
    disableAssetMapRefresh: true
  });

  const placeOrderResponse = await sdk.exchange.placeOrder({
    coin: 'HYPE-SPOT',
    is_buy: false,
    sz: '0.3', // Will be automatically converted to "1"
    limit_px: '70', // Will be automatically converted to "50000"
    reduce_only: false,
    order_type: { limit: { tif: 'Gtc' } },
  });

  const oid = placeOrderResponse.response.data.statuses[0].resting.oid;

  // query by oid
  const rsp = await sdk.info.getOrderStatus(walletAddress, oid);
  console.log(rsp);
  if (rsp.order.status == "open") {
    console.log("open");
  }
  // Cancel Order
  const cancelRequest = {
    coin: "HYPE-SPOT",
    o: oid,
  };
  console.log("\nCancel Order:");
  const cancelOrderResponse = await sdk.exchange.cancelOrder(cancelRequest);
  console.log(JSON.stringify(cancelOrderResponse));
  return
}
