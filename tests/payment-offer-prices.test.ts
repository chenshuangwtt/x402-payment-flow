import assert from "node:assert/strict";
import test from "node:test";
import { NETWORK, BASE_SEPOLIA_USDC } from "../src/constants.js";
import { assertExpectedOffer } from "../src/payment-offer.js";

const payTo = "0x1111111111111111111111111111111111111111";
function offer(amount: string) {
  return { x402Version: 2, accepts: [
    { scheme: "exact", network: NETWORK, asset: BASE_SEPOLIA_USDC, payTo, amount },
  ] };
}

test("strict per-route payment amount check", () => {
  assert.doesNotThrow(() => assertExpectedOffer(offer("20000"), payTo, 20_000n));
  assert.doesNotThrow(() => assertExpectedOffer(offer("50000"), payTo, 50_000n));
  assert.throws(() => assertExpectedOffer(offer("50000"), payTo, 20_000n));
  assert.throws(() => assertExpectedOffer(offer("10000"), payTo, 50_000n));
});
