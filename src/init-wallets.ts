import { existsSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { generatePrivateKey, privateKeyToAccount } from "viem/accounts";

const envFile = resolve(process.cwd(), ".env");

if (existsSync(envFile)) {
  console.error(".env already exists. Refusing to overwrite existing keys.");
  process.exitCode = 1;
} else {
  const sellerKey = generatePrivateKey();
  const buyerKey = generatePrivateKey();
  const seller = privateKeyToAccount(sellerKey);
  const buyer = privateKeyToAccount(buyerKey);
  const env = [
    "# Testnet-only wallets generated locally. Never use these keys for real funds.",
    "# This file is excluded by .gitignore.",
    "PORT=4021",
    "HOST=127.0.0.1",
    "API_URL=http://127.0.0.1:4021/api/hello",
    "FACILITATOR_URL=https://x402.org/facilitator",
    "BASE_SEPOLIA_RPC_URL=https://sepolia.base.org",
    `SELLER_ADDRESS=${seller.address}`,
    `SELLER_PRIVATE_KEY=${sellerKey}`,
    `BUYER_PRIVATE_KEY=${buyerKey}`,
    "",
  ].join("\n");

  writeFileSync(envFile, env, { flag: "wx", mode: 0o600 });
  console.log("Created local .env; private keys are NOT printed.");
  console.log(`BUYER  address (fund with Base Sepolia test USDC): ${buyer.address}`);
  console.log(`SELLER address (receives test USDC):             ${seller.address}`);
  console.log("Do NOT transfer real funds to these keys or upload .env to GitHub.");
}
