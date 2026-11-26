import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { randomUUID } from "node:crypto";
import { AsyncLocalStorage } from "node:async_hooks";

/**
 * Local single-process storage for the official SIWX extension.
 * The extension verifies wallet signatures and calls recordPayment ONLY after settlement.
 * Our store simply assigns per-resource expiry and persists the resulting grants.
 * This is a local learning lab, not a distributed production ledger.
 */
type Grant = { paidAt: number; expiresAt: number };
type State = {
  version: 1;
  grants: Record<string, Grant>;
  usedNonces: Record<string, number>;
};

const DAY_MS = 86_400_000;
const NONCE_RETENTION_MS = DAY_MS;
const MAX_NONCES = 20_000;

// Trust the actual Express request path, never the payer-controlled
// PaymentPayload.resource.url. This prevents cross-route entitlement grants.
export const paymentRequestScope = new AsyncLocalStorage<{
  method: string;
  path: string;
}>();

export class FileSIWxStorage {
  private state: State;

  constructor(
    private readonly filename = resolve(process.cwd(), "data", "siwx-entitlements.json"),
    private readonly now: () => number = Date.now,
  ) {
    if (!existsSync(filename)) {
      this.state = { version: 1, grants: {}, usedNonces: {} };
      return;
    }
    // A damaged or unknown database fails closed; never silently erase it.
    const parsed: unknown = JSON.parse(readFileSync(filename, "utf8"));
    if (!isState(parsed)) {
      throw new Error(`Invalid entitlement store at ${filename}. Restore a backup.`);
    }
    this.state = parsed;
  }

  hasPaid(resource: string, address: string): boolean {
    const key = this.key(resource, address);
    if (!key) return false;
    const grant = this.state.grants[key];
    return !!grant && (grant.expiresAt === 0 || this.now() < grant.expiresAt);
  }

  recordPayment(resource: string, address: string): void {
    const key = this.key(resource, address);
    if (!key) {
      throw new Error("Refusing to record an entitlement for an unknown route/address.");
    }
    const path = key.split("|")[0];
    const request = paymentRequestScope.getStore();
    if (!request || request.method !== "GET" || request.path !== path) {
      throw new Error("SIWX entitlement source does not match the protected HTTP route.");
    }
    const now = this.now();
    this.state.grants[key] = {
      paidAt: now,
      expiresAt: path === "/api/pass/24h" ? now + DAY_MS : 0,
    };
    this.save();
  }

  hasUsedNonce(nonce: string): boolean {
    const timestamp = this.state.usedNonces[nonce];
    return timestamp !== undefined && this.now() - timestamp < NONCE_RETENTION_MS;
  }

  recordNonce(nonce: string): void {
    if (!nonce || nonce.length > 256) throw new Error("Invalid SIWX nonce.");
    if (this.hasUsedNonce(nonce)) throw new Error("SIWX nonce was already used.");
    this.compactNonces();
    this.state.usedNonces[nonce] = this.now();
    this.save();
  }

  private key(resource: string, address: string): string | null {
    if (!/^0x[\da-fA-F]{40}$/.test(address)) return null;
    let url: URL;
    try {
      url = new URL(resource, "http://127.0.0.1");
    } catch {
      return null;
    }
    if (url.search || url.hash) return null;
    if (url.pathname !== "/api/files/guide.md" && url.pathname !== "/api/pass/24h") {
      return null;
    }
    return `${url.pathname}|${address.toLowerCase()}`;
  }

  private compactNonces(): void {
    const threshold = this.now() - NONCE_RETENTION_MS;
    for (const [nonce, timestamp] of Object.entries(this.state.usedNonces)) {
      if (timestamp < threshold) delete this.state.usedNonces[nonce];
    }
    const entries = Object.entries(this.state.usedNonces);
    if (entries.length > MAX_NONCES) {
      entries.sort((a, b) => a[1] - b[1]);
      for (const [nonce] of entries.slice(0, entries.length - MAX_NONCES)) {
        delete this.state.usedNonces[nonce];
      }
    }
  }

  private save(): void {
    mkdirSync(dirname(this.filename), { recursive: true });
    const temporary = `${this.filename}.${randomUUID()}.tmp`;
    writeFileSync(temporary, JSON.stringify(this.state, null, 2) + "\n", { flag: "wx", mode: 0o600 });
    renameSync(temporary, this.filename);
  }
}

function isState(value: unknown): value is State {
  if (!value || typeof value !== "object") return false;
  const state = value as Partial<State>;
  if (state.version !== 1 || !isObject(state.grants) || !isObject(state.usedNonces)) {
    return false;
  }
  for (const grant of Object.values(state.grants)) {
    if (!grant || typeof grant !== "object") return false;
    const g = grant as Grant;
    if (!Number.isFinite(g.paidAt) || !Number.isFinite(g.expiresAt) || g.expiresAt < 0) return false;
  }
  for (const ts of Object.values(state.usedNonces)) {
    if (typeof ts !== "number" || !Number.isFinite(ts)) return false;
  }
  return true;
}

function isObject(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}
