import { mkdirSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { x402Client } from "@x402/core/client";
import { ExactEvmScheme } from "@x402/evm/exact/client";
import { wrapFetchWithPayment } from "@x402/fetch";
import { privateKeyToAccount } from "viem/accounts";
import {
  appendPaymentIdentifierToExtensions,
  generatePaymentId,
} from "@x402/extensions/payment-identifier";
import {
  createSIWxPayload,
  encodeSIWxHeader,
} from "@x402/extensions/sign-in-with-x";
import { apiUrl, buyerPrivateKey, sellerAddress } from "./config.js";
import { NETWORK } from "./constants.js";
import { isPaidPath, PAID_RESOURCES, type PaidPath } from "./catalog.js";
import { assertExpectedOffer, decodePaymentRequired, decodePaymentResponse } from "./payment-offer.js";

// Important: 'read-*' commands NEVER construct an x402 payment.
const COMMANDS = {
  "read-file": "/api/files/guide.md",
  "read-pass": "/api/pass/24h",
  "buy-file": "/api/files/guide.md",
  "buy-pass": "/api/pass/24h",
  "buy-analysis": "/api/analysis",
} as const;

type Command = keyof typeof COMMANDS | "catalog" | "probe";
type BuyerAccount = ReturnType<typeof privateKeyToAccount>;

function baseUrl(): string {
  // Reuse the legacy localhost allow-list from config.ts (no remote spending).
  return new URL(apiUrl()).origin;
}

function getUrl(path: string): string {
  if (!path.startsWith("/api/")) throw new Error("Only preapproved local API paths are allowed.");
  return new URL(path, baseUrl()).toString();
}

async function get(path: PaidPath, headers?: HeadersInit): Promise<Response> {
  return fetch(getUrl(path), {
    headers,
    redirect: "error",
    signal: AbortSignal.timeout(30_000),
  });
}

function requireExpected402(response: Response, path: PaidPath): unknown {
  if (response.status !== 402) {
    throw new Error(`Expected HTTP 402 from ${path}; received ${response.status}. No payment attempted.`);
  }
  const challenge = decodePaymentRequired(response.headers.get("payment-required") ?? "");
  assertExpectedOffer(challenge, sellerAddress(), PAID_RESOURCES[path].atomicAmount);
  return challenge;
}

type SIWxExtension = {
  info?: Record<string, unknown>;
  supportedChains?: unknown;
};

/** Sign an official SIWX challenge only; this function NEVER creates a payment. */
async function retryWithSIWx(
  challenge: unknown,
  path: PaidPath,
  account: BuyerAccount,
): Promise<Response | null> {
  if (!challenge || typeof challenge !== "object") return null;
  const extensions = (challenge as { extensions?: Record<string, unknown> }).extensions;
  const siwx = extensions?.["sign-in-with-x"] as SIWxExtension | undefined;
  if (!siwx || typeof siwx !== "object" || !siwx.info) return null;

  // SDK revisions place supportedChains either inside info or at extension root.
  const chains = siwx.info.supportedChains ?? siwx.supportedChains;
  if (!Array.isArray(chains)) {
    throw new Error("SIWX challenge has no supportedChains. Refusing to sign.");
  }
  const matching = chains.find((chain: unknown) => {
    return !!chain && typeof chain === "object" &&
      (chain as { chainId?: unknown }).chainId === NETWORK;
  }) as { chainId: string; type?: string } | undefined;
  if (!matching) throw new Error("SIWX challenge does not support Base Sepolia.");

  const url = getUrl(path);
  // A 3rd parameter binding the challenge to the HTTP response URL was added
  // in official SDK 2.29. This lab pins the newer 2.32.0 family.
  const completeInfo = {
    ...siwx.info,
    chainId: matching.chainId,
    ...(matching.type ? { type: matching.type } : {}),
  };
  const payload = await createSIWxPayload(
    completeInfo as Parameters<typeof createSIWxPayload>[0],
    account,
    url,
  );
  const header = encodeSIWxHeader(payload);
  return get(path, { "SIGN-IN-WITH-X": header });
}

async function outputResource(response: Response, path: PaidPath): Promise<void> {
  if (path === "/api/files/guide.md") {
    const data = Buffer.from(await response.arrayBuffer());
    mkdirSync(resolve(process.cwd(), "downloads"), { recursive: true });
    const filename = resolve(process.cwd(), "downloads", "x402-field-guide.md");
    writeFileSync(filename, data);
    console.log(`Saved purchased resource: ${filename} (${data.length} bytes)`);
  } else {
    console.log(await response.text());
  }
}

async function readWithoutPay(path: PaidPath, account: BuyerAccount): Promise<boolean> {
  const initial = await get(path);
  const challenge = requireExpected402(initial, path);
  const authResponse = await retryWithSIWx(challenge, path, account);
  if (!authResponse || authResponse.status === 402) {
    console.log("HTTP 402: no active entitlement for this wallet. NO PAYMENT MADE.");
    return false;
  }
  if (!authResponse.ok) {
    throw new Error(`SIWX access request failed with HTTP ${authResponse.status}. NO PAYMENT MADE.`);
  }
  console.log(`HTTP ${authResponse.status}: wallet-authenticated repeat access. NO PAYMENT MADE.`);
  await outputResource(authResponse, path);
  return true;
}

async function buy(path: PaidPath, account: BuyerAccount): Promise<void> {
  if (!process.argv.includes("--pay")) throw new Error("Payment is opt-in: supply --pay.");

  const challengeResponse = await get(path);
  const challenge = requireExpected402(challengeResponse, path);
  console.log(`Offer checked: ${PAID_RESOURCES[path].price} test USDC on ${NETWORK}`);

  // Before spending, try the authenticated (free) path for repeat-access routes.
  if (path !== "/api/analysis") {
    const auth = await retryWithSIWx(challenge, path, account);
    if (auth?.ok) {
      console.log("Already purchased; access recovered using SIWX. NO NEW PAYMENT MADE.");
      await outputResource(auth, path);
      return;
    }
    if (auth && auth.status !== 402) {
      throw new Error(`SIWX attempt returned ${auth.status}; refusing to initiate payment.`);
    }
  }

  const id = generatePaymentId("lab_");
  const client = new x402Client();
  client.register(NETWORK, new ExactEvmScheme(account));
  client.onBeforePaymentCreation(async ({ paymentRequired }) => {
    if (paymentRequired.extensions) {
      appendPaymentIdentifierToExtensions(paymentRequired.extensions, id);
    }
  });
  const payFetch = wrapFetchWithPayment(fetch, client);
  console.log(`Payment-Identifier: ${id}`);
  console.log("Authorizing ONE x402 payment. Do not retry blindly after a timeout.");

  const response = await payFetch(getUrl(path), {
    redirect: "error",
    signal: AbortSignal.timeout(60_000),
  });
  console.log(`Final HTTP status: ${response.status}`);
  if (!response.ok) {
    console.log((await response.text()).slice(0, 1000));
    throw new Error("Payment/delivery failed or is unknown. Check chain BEFORE any retry.");
  }
  const receipt = decodePaymentResponse(response.headers.get("payment-response"));
  if (!receipt || typeof receipt !== "object" || (receipt as { success?: unknown }).success !== true) {
    throw new Error("No verified success in PAYMENT-RESPONSE. Check chain; do not pay again blindly.");
  }
  const transaction = (receipt as { transaction?: unknown }).transaction;
  if (typeof transaction === "string" && /^0x[\da-fA-F]{64}$/.test(transaction)) {
    console.log(`Explorer: https://sepolia.basescan.org/tx/${transaction}`);
  }
  await outputResource(response, path);
  console.log("Payment reported successful. Use balance/explorer to confirm final settlement.");
}

async function main() {
  const command = process.argv[2] as Command | undefined;
  if (command === "catalog") {
    const response = await fetch(getUrl("/api/catalog"), { redirect: "error" });
    if (!response.ok) throw new Error(`Catalog HTTP ${response.status}`);
    console.log(await response.text());
    return;
  }
  if (command === "probe") {
    for (const path of Object.keys(PAID_RESOURCES)) {
      if (!isPaidPath(path)) continue;
      const response = await get(path);
      requireExpected402(response, path);
      console.log(`${path}: HTTP 402 PASS (${PAID_RESOURCES[path].price} test USDC)`);
    }
    console.log("No signature created and no payment made.");
    return;
  }
  if (!command || !(command in COMMANDS)) {
    throw new Error("Use catalog | probe | read-file | read-pass | buy-file | buy-pass | buy-analysis");
  }
  const path = COMMANDS[command as keyof typeof COMMANDS];
  if (!isPaidPath(path)) throw new Error("Not an approved paid route.");
  const account = privateKeyToAccount(buyerPrivateKey());
  console.log(`BUYER (public): ${account.address}`);
  if (command.startsWith("read-")) {
    await readWithoutPay(path, account);
  } else {
    await buy(path, account);
  }
}

main().catch((error: unknown) => {
  console.error("Lab client error:", error);
  process.exitCode = 1;
});
