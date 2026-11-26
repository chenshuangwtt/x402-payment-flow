/** The lab is deliberately locked to the Base Sepolia test network. */
export const NETWORK = "eip155:84532" as const;
export const CHAIN_ID = 84532;
export const PRICE = "$0.01" as const;
export const USDC_DECIMALS = 6;
export const PRICE_ATOMIC = 10_000n; // 0.01 * 10^6 test USDC
export const BASE_SEPOLIA_USDC =
  "0x036CbD53842c5426634e7929541eC2318f3dCF7e" as const;
export const DEFAULT_API_URL = "http://127.0.0.1:4021/api/hello";
export const DEFAULT_FACILITATOR_URL = "https://x402.org/facilitator";
export const DEFAULT_RPC_URL = "https://sepolia.base.org";
