import "dotenv/config";
import express from "express";
import { createServer } from "http";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerEmailAuthRoutes } from "./emailAuthRoutes";
import { registerStripeBillingRoutes } from "./stripeBillingRoutes";
import { registerVehicleLookupRoutes } from "./vehicleLookupRoutes";
import { ENV } from "./env";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { setupVite } from "./vite";

function normalizeOrigin(value: string) {
  try {
    return new URL(value).origin;
  } catch {
    return value.replace(/\/+$/, "");
  }
}

function getAllowedOrigins() {
  return new Set(
    [
      ENV.appBaseUrl,
      "http://localhost:3000",
      "http://127.0.0.1:3000",
      "http://localhost:5173",
      "http://127.0.0.1:5173",
    ]
      .filter(Boolean)
      .map((origin) => normalizeOrigin(origin))
  );
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

  registerStripeBillingRoutes(app);
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
    console.log(`Server running on http://0.0.0.0:${port}/`);
  });
}

startServer().catch((error) => {
  console.error("[Server] Failed to start", error);
  process.exit(1);
});
