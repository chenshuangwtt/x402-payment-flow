import assert from "node:assert/strict";
import test from "node:test";
import { BASE_SEPOLIA_USDC, NETWORK, PRICE_ATOMIC } from "../src/constants.js";
import { assertExpectedOffer, decodePaymentRequired } from "../src/payment-offer.js";

const SELLER = "0x1111111111111111111111111111111111111111";
const challenge = () => ({
  x402Version: 2,
  accepts: [{
    scheme: "exact", network: NETWORK, payTo: SELLER,
    amount: PRICE_ATOMIC.toString(), asset: BASE_SEPOLIA_USDC,
  }],
});

test("decode base64 JSON challenge", () => {
  const raw = Buffer.from(JSON.stringify(challenge())).toString("base64");
  assert.deepEqual(decodePaymentRequired(raw), challenge());
});

test("accept exact intended testnet payment", () => {
  assert.equal(assertExpectedOffer(challenge(), SELLER).amount, "10000");
});

test("refuse mainnet, a larger amount, or another receiver", () => {
  const wrongNetwork = challenge();
  wrongNetwork.accepts[0]!.network = "eip155:8453" as typeof NETWORK;
  assert.throws(() => assertExpectedOffer(wrongNetwork, SELLER));

  const wrongAmount = challenge();
  wrongAmount.accepts[0]!.amount = "10000000";
  assert.throws(() => assertExpectedOffer(wrongAmount, SELLER));

  const wrongRecipient = challenge();
  wrongRecipient.accepts[0]!.payTo = "0x2222222222222222222222222222222222222222";
  assert.throws(() => assertExpectedOffer(wrongRecipient, SELLER));
});
