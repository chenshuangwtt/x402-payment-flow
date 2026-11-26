import assert from "node:assert/strict";
import test from "node:test";
import { PAID_RESOURCES, publicCatalog, sampleAnalysis } from "../src/catalog.js";

test("all prices are small Base Sepolia test-USDC amounts", () => {
  for (const resource of Object.values(PAID_RESOURCES)) {
    assert.ok(resource.atomicAmount > 0n);
    assert.ok(resource.atomicAmount <= 50_000n);
  }
  assert.equal(publicCatalog().network, "eip155:84532");
});

test("sample paid analysis is deterministic and checks invalid rows", () => {
  const report = sampleAnalysis();
  assert.equal(report.rowCount, 5);
  assert.equal(report.paidTotal, 260);
  assert.deepEqual(report.invalidAmountOrders, ["A-104"]);
});
