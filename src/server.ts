import { resolve } from "node:path";
import express from "express";
import { paymentMiddleware, x402ResourceServer } from "@x402/express";
import { HTTPFacilitatorClient } from "@x402/core/server";
import { ExactEvmScheme } from "@x402/evm/exact/server";
import {
  declareSIWxExtension,
  createSIWxResourceServerExtension,
} from "@x402/extensions/sign-in-with-x";
import {
  PAYMENT_IDENTIFIER,
  declarePaymentIdentifierExtension,
  extractPaymentIdentifier,
} from "@x402/extensions/payment-identifier";
import { facilitatorUrl, serverConfig } from "./config.js";
import { NETWORK, PRICE } from "./constants.js";
import { PAID_RESOURCES, publicCatalog, sampleAnalysis } from "./catalog.js";
import { FileSIWxStorage, paymentRequestScope } from "./entitlements.js";

// Preserve the original env, payee wallet, facilitator and /api/hello behavior.
const { port, host, payTo } = serverConfig();
const facilitator = new HTTPFacilitatorClient({ url: facilitatorUrl() });
const entitlements = new FileSIWxStorage();

const resourceServer = new x402ResourceServer(facilitator)
  .register(NETWORK, new ExactEvmScheme())
  .registerExtension(createSIWxResourceServerExtension({
    storage: entitlements,
    origin: `http://${host}:${port}`,
  }))
  .onAfterSettle(async ({ paymentPayload }) => {
    // Diagnostic correlation only. Never grant access from an untrusted ID.
    try {
      // The SDK hook returns a deeply readonly payload, while the extension's
      // public input type models resource.tags as a mutable string[]; make a
      // local shallow copy of that array rather than casting away the type.
      const paymentId = extractPaymentIdentifier({
        ...paymentPayload,
        resource: paymentPayload.resource
          ? {
              ...paymentPayload.resource,
              tags: paymentPayload.resource.tags
                ? [...paymentPayload.resource.tags]
                : undefined,
            }
          : undefined,
      });
      if (paymentId) console.log(`[x402] Settled payment-id: ${paymentId}`);
    } catch (error) {
      // Never fail a settlement because optional diagnostic logging failed.
      console.warn("Payment-ID diagnostic unavailable:", error);
    }
  });

const accepts = (price: "$0.01" | "$0.02" | "$0.05") => [
  { scheme: "exact" as const, price, network: NETWORK, payTo },
];
const idExtension = () => ({
  [PAYMENT_IDENTIFIER]: declarePaymentIdentifierExtension(false),
});
const boughtContentExtensions = (statement: string) => ({
  ...declareSIWxExtension({ statement, expirationSeconds: 300 }),
  ...idExtension(),
});

const app = express();
app.disable("x-powered-by");

// Security: bind settlement hooks to the route actually matched by Express.
// Some historical SIWX hooks used a payer-controlled resource URL instead.
app.use((req, _res, next) => {
  paymentRequestScope.run({ method: req.method, path: req.path }, next);
});

app.get("/health", (_req, res) => {
  res.json({ ok: true, network: NETWORK, service: "x402-payment-flow" });
});

app.get("/api/catalog", (_req, res) => {
  res.setHeader("Cache-Control", "no-store");
  res.json(publicCatalog());
});

app.use(
  paymentMiddleware(
    {
      // Original route retained unchanged so npm run probe/pay still work.
      "GET /api/hello": {
        accepts: accepts(PRICE),
        description: "A paid hello message from the local x402 test server",
        mimeType: "application/json",
      },
      "GET /api/analysis": {
        accepts: accepts(PAID_RESOURCES["/api/analysis"].price),
        description: "One paid sample sales data quality analysis",
        mimeType: "application/json",
        extensions: idExtension(),
      },
      "GET /api/files/guide.md": {
        accepts: accepts(PAID_RESOURCES["/api/files/guide.md"].price),
        description: "Download a Markdown guide; paid wallet may re-download",
        mimeType: "text/markdown",
        extensions: boughtContentExtensions("Sign in to access your purchased guide"),
      },
      "GET /api/pass/24h": {
        accepts: accepts(PAID_RESOURCES["/api/pass/24h"].price),
        description: "Premium sample report with 24-hour wallet access",
        mimeType: "application/json",
        extensions: boughtContentExtensions("Sign in to access your 24-hour report"),
      },
    },
    resourceServer,
  ),
);

app.get("/api/hello", (_req, res) => {
  res.json({ message: "Hello x402!", paid: true, network: NETWORK });
});

app.get("/api/analysis", (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json(sampleAnalysis());
});

app.get("/api/files/guide.md", (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.attachment("x402-field-guide.md");
  res.sendFile(resolve(process.cwd(), "assets", "field-guide.md"));
});

app.get("/api/pass/24h", (_req, res) => {
  res.setHeader("Cache-Control", "private, no-store");
  res.json({
    title: "Premium sample report",
    accessPolicy: "24 hours from the most recent successful settlement",
    message: "This response can be read again with a fresh SIWX wallet signature.",
    network: NETWORK,
  });
});

app.listen(port, host, () => {
  console.log(`x402 test server: http://${host}:${port}`);
  console.log(`Free endpoint:    http://${host}:${port}/health`);
  console.log(`Catalog:          http://${host}:${port}/api/catalog`);
  console.log(`Original paid:    http://${host}:${port}/api/hello`);
  console.log(`Paid analysis:    http://${host}:${port}/api/analysis`);
  console.log(`Paid download:    http://${host}:${port}/api/files/guide.md`);
  console.log(`Paid 24-hour:     http://${host}:${port}/api/pass/24h`);
  console.log(`Network: ${NETWORK} (Base Sepolia ONLY)`);
  console.log(`Receiver: ${payTo}`);
  console.log(`Facilitator: ${facilitatorUrl()}`);
  console.log(`SIWX entitlements: data/siwx-entitlements.json (local, private)`);
});
