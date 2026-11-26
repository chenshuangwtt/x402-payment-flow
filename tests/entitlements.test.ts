import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import { FileSIWxStorage, paymentRequestScope } from "../src/entitlements.js";

const address = "0x1111111111111111111111111111111111111111";
const otherAddress = "0x2222222222222222222222222222222222222222";
const record = (store: FileSIWxStorage, path: string, address = addressDefault) =>
  paymentRequestScope.run({ method: "GET", path }, () => store.recordPayment(path, address));
const addressDefault = address;

function withFile(run: (file: string) => void): void {
  const dir = mkdtempSync(join(tmpdir(), "x402-siwx-"));
  try { run(join(dir, "entitlements.json")); }
  finally { rmSync(dir, { recursive: true, force: true }); }
}

test("file purchased once can be read again across restart", () => {
  withFile((file) => {
    let now = 1_900_000_000_000;
    const first = new FileSIWxStorage(file, () => now);
    assert.equal(first.hasPaid("/api/files/guide.md", address), false);
    paymentRequestScope.run({ method: "GET", path: "/api/files/guide.md" }, () =>
      first.recordPayment("http://127.0.0.1:4021/api/files/guide.md", address));
    const restarted = new FileSIWxStorage(file, () => now);
    assert.equal(restarted.hasPaid("/api/files/guide.md", address), true);
    assert.equal(restarted.hasPaid("/api/files/guide.md", otherAddress), false);
    now += 10 * 86_400_000;
    assert.equal(restarted.hasPaid("/api/files/guide.md", address), true);
  });
});

test("24h paid access expires and can be renewed", () => {
  withFile((file) => {
    let now = 1_900_000_000_000;
    const store = new FileSIWxStorage(file, () => now);
    record(store, "/api/pass/24h");
    now += 86_400_000 - 1;
    assert.equal(store.hasPaid("/api/pass/24h", address), true);
    now += 1;
    assert.equal(store.hasPaid("/api/pass/24h", address), false);
    record(store, "/api/pass/24h");
    assert.equal(new FileSIWxStorage(file, () => now).hasPaid("/api/pass/24h", address), true);
  });
});

test("unknown routes cannot obtain a paid access grant", () => {
  withFile((file) => {
    const store = new FileSIWxStorage(file);
    assert.equal(store.hasPaid("/api/hello", address), false);
    assert.equal(store.hasPaid("/api/files/guide.md?other=1", address), false);
    assert.throws(() => record(store, "/api/hello"));
    assert.throws(() => record(store, "/api/pass/24h", "bad-address"));
  });
});

test("reject client-controlled resource URL that targets a different paid route", () => {
  withFile((file) => {
    const store = new FileSIWxStorage(file);
    paymentRequestScope.run({ method: "GET", path: "/api/files/guide.md" }, () => {
      assert.throws(() => store.recordPayment("/api/pass/24h", address));
    });
    assert.equal(store.hasPaid("/api/pass/24h", address), false);
    assert.throws(() => store.recordPayment("/api/files/guide.md", address));
  });
});

test("used SIWX nonce is persisted and refuses reuse", () => {
  withFile((file) => {
    const store = new FileSIWxStorage(file);
    store.recordNonce("nonce-test-12345");
    assert.equal(new FileSIWxStorage(file).hasUsedNonce("nonce-test-12345"), true);
    assert.throws(() => store.recordNonce("nonce-test-12345"));
  });
});

test("corrupt entitlement state must fail closed without being overwritten", () => {
  withFile((file) => {
    writeFileSync(file, '{"version":1,"grants":', "utf8");
    assert.throws(() => new FileSIWxStorage(file));
    assert.equal(readFileSync(file, "utf8"), '{"version":1,"grants":');
  });
});
