import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerEmailAuthRoutes } from "./emailAuthRoutes";
import { registerStripeBillingRoutes } from "./stripeBillingRoutes";
import { registerBillingRoutes } from "./billingRoutes";
import { registerVehicleLookupRoutes } from "./vehicleLookupRoutes";
import { getAiProviderStatus, probeAiProviderStatus } from "../services/aiOrchestrator";
import { ENV } from "./env";
import { appRouter } from "../routers";
import { createContext } from "./context";

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function getAllowedOrigins() {
  const origins = new Set<string>([
    "http://localhost:3000",
    "http://127.0.0.1:3000",
    "http://localhost:5173",
    "http://127.0.0.1:5173",
    "https://truckfixr.com",
    "https://www.truckfixr.com",
  ]);

  if (ENV.appBaseUrl) {
    origins.add(ENV.appBaseUrl);
  }

  return new Set(Array.from(origins).map((origin) => normalizeOrigin(origin)));
}

function applyCors(app: express.Express) {
  const allowedOrigins = getAllowedOrigins();

  app.use((req, res, next) => {
    const requestOrigin = typeof req.headers.origin === "string" ? normalizeOrigin(req.headers.origin) : "";
    const isAllowedOrigin = requestOrigin && allowedOrigins.has(requestOrigin);

    if (isAllowedOrigin) {
      res.setHeader("Access-Control-Allow-Origin", requestOrigin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader("Vary", "Origin");
    }

    res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,PATCH,DELETE,OPTIONS");

    const requestedHeaders =
      typeof req.headers["access-control-request-headers"] === "string"
        ? req.headers["access-control-request-headers"]
        : "Content-Type, Authorization, X-Requested-With";
    res.setHeader("Access-Control-Allow-Headers", requestedHeaders);

    if (req.method === "OPTIONS") {
      res.status(204).end();
      return;
    }

    next();
  });
}

async function startServer() {
  const app = express();
  const server = createServer(app);
  const isDevelopment = process.env.NODE_ENV === "development";
  const port = Number.parseInt(process.env.PORT || "3000", 10);

  app.disable("x-powered-by");
  app.set("trust proxy", 1);

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("X-Frame-Options", "SAMEORIGIN");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=(self)");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");
    res.setHeader("Cross-Origin-Opener-Policy", "same-origin");
    res.setHeader("X-DNS-Prefetch-Control", "off");

    if (!isDevelopment) {
      res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
      res.setHeader(
        "Content-Security-Policy",
        [
          "default-src 'self'",
          "base-uri 'self'",
          "form-action 'self'",
          "frame-ancestors 'self'",
          "object-src 'none'",
          "img-src 'self' data: blob:",
          "font-src 'self' data:",
          "style-src 'self' 'unsafe-inline'",
          "script-src 'self'",
          "connect-src 'self' https://truckfixr-api.onrender.com https://truckfixr.com https://www.truckfixr.com",
        ].join("; ")
      );
    }

    next();
  });

  registerStripeBillingRoutes(app);
  registerBillingRoutes(app);
  applyCors(app);

  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  app.get("/healthz", (_req, res) => {
    res.status(200).json({
      ok: true,
      service: "truckfixr-api",
      uptimeSeconds: Math.round(process.uptime()),
      environment: process.env.NODE_ENV || "development",
    });
  });

  app.get("/api/ai/provider-status", async (req, res) => {
    if (ENV.isProduction && process.env.ENABLE_AI_PROVIDER_STATUS_ENDPOINT !== "true") {
      res.status(404).json({ error: "Not found" });
      return;
    }

    const status = getAiProviderStatus();
    const shouldProbe =
      typeof req.query.probe === "string" &&
      ["1", "true", "yes"].includes(req.query.probe.toLowerCase());

    if (!shouldProbe) {
      res.status(200).json({
        ...status,
        probed: false,
      });
      return;
    }

    const probe = await probeAiProviderStatus({
      feature: "provider_status_probe",
      timeoutMs: 8_000,
    });

    res.status(200).json({
      ...status,
      probed: true,
      probe,
    });
  });

  registerOAuthRoutes(app);
  registerEmailAuthRoutes(app);
  registerVehicleLookupRoutes(app);

  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );

  if (isDevelopment) {
    const { setupVite } = await import("./vite");
    await setupVite(app, server);
  } else {
    app.get("/", (_req, res) => {
      res.status(200).json({
        service: "TruckFixr API",
        health: "/healthz",
        trpc: "/api/trpc",
      });
    });

    app.use("/api/*", (_req, res) => {
      res.status(404).json({ error: "Not found" });
    });
  }

  server.listen(port, "0.0.0.0", () => {
    console.log(`Server running on http://localhost:${port}/`);
    console.log(`Bound to 0.0.0.0:${port} for container/proxy compatibility.`);
  });
}

startServer().catch((error) => {
  console.error("[Server] Failed to start", error);
  process.exit(1);
});
