import { apiUrl, sellerAddress } from "./config.js";
import { assertExpectedOffer, decodePaymentRequired } from "./payment-offer.js";

async function main() {
  const url = apiUrl();
  console.log(`GET ${url} (without payment)`);
  const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(15_000) });
  if (response.status !== 402) {
    throw new Error(`Expected 402, received ${response.status}; response: ${await response.text()}`);
  }
  const challenge = decodePaymentRequired(response.headers.get("payment-required") ?? "");
  const offer = assertExpectedOffer(challenge, sellerAddress());
  console.log("HTTP 402 Payment Required: PASS");
  console.log(JSON.stringify({ x402Version: 2, accepts: [offer] }, null, 2));
  console.log("No wallet signature created. No payment made.");
}

main().catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
