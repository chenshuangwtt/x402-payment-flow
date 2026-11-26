import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import { apiUrl, buyerPrivateKey, sellerAddress } from "./config.js";
import { NETWORK, PRICE } from "./constants.js";
import { assertExpectedOffer, decodePaymentRequired, decodePaymentResponse } from "./payment-offer.js";

async function main() {
  if (!process.argv.includes("--pay")) {
    throw new Error("Payment is opt-in. Run `npm run pay` (which includes --pay).");
  }

  const url = apiUrl(); // Restricted to localhost and the one expected route.
  const account = privateKeyToAccount(buyerPrivateKey());
  console.log(`Buyer: ${account.address}`);
  console.log(`Seller: ${sellerAddress()}`);
  console.log(`Maximum expected payment: ${PRICE} test USDC on ${NETWORK}`);

  // Explicitly inspect what the local server requires before signing.
  const challengeResponse = await fetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  if (challengeResponse.status !== 402) {
    throw new Error(`Expected an initial HTTP 402, got ${challengeResponse.status}`);
  }
  const challenge = decodePaymentRequired(challengeResponse.headers.get("payment-required") ?? "");
  assertExpectedOffer(challenge, sellerAddress());
  console.log("402 challenge verified: expected chain, exact amount, asset and receiver.");

  const client = new x402Client();
  client.register(NETWORK, new ExactEvmScheme(account));
  const payFetch = wrapFetchWithPayment(fetch, client);
  console.log("Authorizing one x402 test payment...");

  const response = await payFetch(url, {
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  const body = await response.text();
  console.log(`Final HTTP status: ${response.status}`);
  console.log(`Body: ${body}`);
  const receipt = decodePaymentResponse(response.headers.get("payment-response"));
  if (receipt !== null) {
    console.log("Payment response:");
    console.log(JSON.stringify(receipt, null, 2));
    if (typeof receipt === "object" && receipt && "transaction" in receipt) {
      const hash = (receipt as { transaction?: unknown }).transaction;
      if (typeof hash === "string" && /^0x[a-fA-F0-9]{64}$/.test(hash)) {
        console.log(`Explorer: https://sepolia.basescan.org/tx/${hash}`);
      }
    }
  } else {
    console.log("No PAYMENT-RESPONSE header returned; inspect server/facilitator logs.");
  }
  if (!response.ok) {
    throw new Error("Paid request failed. Do not assume any payment settled without checking chain.");
  }
  if (receipt === null) {
    throw new Error("HTTP success without payment receipt; verify on-chain before considering the lab complete.");
  }
  console.log("HTTP 200 and settlement response received. Check balances/explorer to confirm settlement.");
}

main().catch((error: unknown) => {
  console.error("Payment flow failed:", error);
  process.exitCode = 1;
});
