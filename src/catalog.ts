import { NETWORK } from "./constants.js";

export const PAID_RESOURCES = {
  "/api/analysis": {
    title: "Sales data quality report",
    price: "$0.01",
    atomicAmount: 10_000n,
    access: "per-request",
    mimeType: "application/json",
  },
  "/api/files/guide.md": {
    title: "Downloadable Markdown field guide",
    price: "$0.02",
    atomicAmount: 20_000n,
    access: "permanent",
    mimeType: "text/markdown",
  },
  "/api/pass/24h": {
    title: "Premium report with 24-hour access",
    price: "$0.05",
    atomicAmount: 50_000n,
    access: "24-hours",
    mimeType: "application/json",
  },
} as const;

export type PaidPath = keyof typeof PAID_RESOURCES;

export function isPaidPath(path: string): path is PaidPath {
  return Object.prototype.hasOwnProperty.call(PAID_RESOURCES, path);
}

export function publicCatalog() {
  return {
    network: NETWORK,
    currency: "Base Sepolia test USDC",
    routes: Object.entries(PAID_RESOURCES).map(([path, meta]) => ({
      path,
      title: meta.title,
      price: meta.price,
      access: meta.access,
      mimeType: meta.mimeType,
    })),
  };
}

/** Small deterministic dataset. No personal or external API data. */
export function sampleAnalysis() {
  const rows = [
    { order: "A-100", amount: 120.5, status: "paid" },
    { order: "A-101", amount: 50.0, status: "paid" },
    { order: "A-102", amount: 0.0, status: "refunded" },
    { order: "A-103", amount: 89.5, status: "paid" },
    { order: "A-104", amount: -5.0, status: "invalid" },
  ];
  const valid = rows.filter((r) => r.status === "paid" && r.amount > 0);
  const invalid = rows.filter((r) => r.amount < 0);
  return {
    source: "bundled sample orders (not live financial data)",
    rowCount: rows.length,
    paidOrders: valid.length,
    paidTotal: Number(valid.reduce((total, r) => total + r.amount, 0).toFixed(2)),
    invalidAmountOrders: invalid.map((r) => r.order),
    note: "One successful x402 payment purchases one analysis response.",
  };
}
