import "dotenv/config";
import { getAddress, isAddress } from "viem";
import {
  DEFAULT_API_URL,
  DEFAULT_FACILITATOR_URL,
  DEFAULT_RPC_URL,
} from "./constants.js";

export function sellerAddress(): `0x${string}` {
  const value = process.env.SELLER_ADDRESS?.trim();
  if (!value || !isAddress(value)) {
    throw new Error(
      "Invalid SELLER_ADDRESS in .env. Run `npm run wallets:init` first.",
    );
  }
  return getAddress(value);
}

export function buyerPrivateKey(): `0x${string}` {
  const value = process.env.BUYER_PRIVATE_KEY?.trim();
  if (!value || !/^0x[0-9a-fA-F]{64}$/.test(value)) {
    throw new Error("Missing/invalid BUYER_PRIVATE_KEY in local .env.");
  }
  return value as `0x${string}`;
}

export function serverConfig() {
  const port = Number(process.env.PORT ?? "4021");
  const host = process.env.HOST ?? "127.0.0.1";
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error("PORT must be an integer from 1 to 65535.");
  }
  if (host !== "127.0.0.1" && host !== "localhost") {
    throw new Error("For this local lab, HOST must be 127.0.0.1 or localhost.");
  }
  return { port, host, payTo: sellerAddress() };
}

export function apiUrl(): string {
  const raw = process.env.API_URL ?? DEFAULT_API_URL;
  const url = new URL(raw);
  if (
    url.protocol !== "http:" ||
    !["127.0.0.1", "localhost"].includes(url.hostname) ||
    url.pathname !== "/api/hello" ||
    url.search !== "" ||
    url.hash !== ""
  ) {
    throw new Error("API_URL must be http://127.0.0.1:<port>/api/hello (local only).");
  }
  return url.toString();
}

export function facilitatorUrl(): string {
  const raw = process.env.FACILITATOR_URL ?? DEFAULT_FACILITATOR_URL;
  // The demo intentionally refuses arbitrary settlement facilitators.
  if (raw !== DEFAULT_FACILITATOR_URL) {
    throw new Error(`Only the official testnet facilitator is permitted: ${DEFAULT_FACILITATOR_URL}`);
  }
  return raw;
}

export function rpcUrl(): string {
  const raw = process.env.BASE_SEPOLIA_RPC_URL ?? DEFAULT_RPC_URL;
  if (!raw.startsWith("https://")) {
    throw new Error("BASE_SEPOLIA_RPC_URL must be HTTPS.");
  }
  return raw;
}
