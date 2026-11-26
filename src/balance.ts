import { createPublicClient, erc20Abi, formatUnits, http } from "viem";
import { privateKeyToAccount } from "viem/accounts";
import { baseSepolia } from "viem/chains";
import { buyerPrivateKey, rpcUrl, sellerAddress } from "./config.js";
import { BASE_SEPOLIA_USDC, USDC_DECIMALS } from "./constants.js";

async function main() {
  const client = createPublicClient({ chain: baseSepolia, transport: http(rpcUrl()) });
  const buyer = privateKeyToAccount(buyerPrivateKey()).address;
  const seller = sellerAddress();

  for (const [name, address] of [["BUYER", buyer], ["SELLER", seller]] as const) {
    const balance = await client.readContract({
      address: BASE_SEPOLIA_USDC,
      abi: erc20Abi,
      functionName: "balanceOf",
      args: [address],
    });
    console.log(`${name}  ${address}: ${formatUnits(balance, USDC_DECIMALS)} test USDC`);
  }
  console.log("Network: Base Sepolia; these test tokens have no monetary value.");
}

main().catch((error: unknown) => {
  console.error("Balance query failed:", error);
  process.exitCode = 1;
});
