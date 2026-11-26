import {
  BASE_SEPOLIA_USDC,
  NETWORK,
  PRICE_ATOMIC,
} from "./constants.js";

/**
 * Inspect the server's V2 challenge before signing anything.
 * This does NOT pay. It makes the one-off lab refuse unexpected terms.
 */
export function decodePaymentRequired(value: string): unknown {
  if (!value) {
    throw new Error("Missing PAYMENT-REQUIRED header. Is the server using x402 V2?");
  }
  try {
    return JSON.parse(Buffer.from(value, "base64").toString("utf8")) as unknown;
  } catch {
    throw new Error("Could not parse PAYMENT-REQUIRED (base64 JSON).");
  }
}

type Offer = {
  scheme?: unknown;
  network?: unknown;
  payTo?: unknown;
  amount?: unknown;
  asset?: unknown;
};

export function assertExpectedOffer(
  challenge: unknown,
  sellerAddress: string,
  expectedAtomicAmount: bigint = PRICE_ATOMIC,
): Offer {
  if (!challenge || typeof challenge !== "object") {
    throw new Error("Invalid payment challenge.");
  }
  const parsed = challenge as { x402Version?: unknown; accepts?: unknown };
  if (parsed.x402Version !== 2 || !Array.isArray(parsed.accepts)) {
    throw new Error("Expected x402 V2 and an accepts array.");
  }
  if (parsed.accepts.length !== 1) {
    throw new Error(`Unexpected number of payment options: ${parsed.accepts.length}`);
  }

  const offer = parsed.accepts[0] as Offer;
  if (
    offer.scheme !== "exact" ||
    offer.network !== NETWORK ||
    typeof offer.payTo !== "string" ||
    offer.payTo.toLowerCase() !== sellerAddress.toLowerCase() ||
    typeof offer.asset !== "string" ||
    offer.asset.toLowerCase() !== BASE_SEPOLIA_USDC.toLowerCase() ||
    typeof offer.amount !== "string" ||
    offer.amount !== expectedAtomicAmount.toString()
  ) {
    throw new Error(
      `Payment offer mismatch; refused to sign. Received: ${JSON.stringify(offer)}`,
    );
  }
  return offer;
}

export function decodePaymentResponse(header: string | null): unknown | null {
  if (!header) return null;
  try {
    return JSON.parse(Buffer.from(header, "base64").toString("utf8")) as unknown;
  } catch {
    return { warning: "PAYMENT-RESPONSE was present but could not be decoded" };
  }
}
