import { jsxLocPlugin } from "@builder.io/vite-plugin-jsx-loc";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";
import { gzipSync } from "node:zlib";
import { defineConfig } from "vite";
import { vitePluginManusRuntime } from "vite-plugin-manus-runtime";

const PROJECT_ROOT = import.meta.dirname;
const LOG_DIR = path.join(PROJECT_ROOT, ".manus-logs");
const MAX_LOG_SIZE_BYTES = 1 * 1024 * 1024;
const TRIM_TARGET_BYTES = Math.floor(MAX_LOG_SIZE_BYTES * 0.6);
const enableManusRuntime = process.env.ENABLE_MANUS_RUNTIME === "true";

const DEFAULT_BUNDLE_LIMITS = {
  maxJsChunkGzipBytes: 130 * 1024,
  maxStaticAssetBytes: 260 * 1024,
};

function readBundleLimits() {
  const jsBudget = Number.parseInt(process.env.MAX_JS_CHUNK_GZIP_BYTES ?? "", 10);
  const assetBudget = Number.parseInt(process.env.MAX_STATIC_ASSET_BYTES ?? "", 10);

  return {
    maxJsChunkGzipBytes: Number.isFinite(jsBudget) ? jsBudget : DEFAULT_BUNDLE_LIMITS.maxJsChunkGzipBytes,
    maxStaticAssetBytes: Number.isFinite(assetBudget) ? assetBudget : DEFAULT_BUNDLE_LIMITS.maxStaticAssetBytes,
  };
}

function ensureLogDir() {
  if (!fs.existsSync(LOG_DIR)) {
    fs.mkdirSync(LOG_DIR, { recursive: true });
  }
}

function trimLogFile(logPath, maxSize) {
  try {
    if (!fs.existsSync(logPath) || fs.statSync(logPath).size <= maxSize) {
      return;
    }

    const lines = fs.readFileSync(logPath, "utf-8").split("\n");
    const keptLines = [];
    let keptBytes = 0;

    for (let index = lines.length - 1; index >= 0; index -= 1) {
      const lineBytes = Buffer.byteLength(`${lines[index]}\n`, "utf-8");
      if (keptBytes + lineBytes > TRIM_TARGET_BYTES) break;
      keptLines.unshift(lines[index]);
      keptBytes += lineBytes;
    }

    fs.writeFileSync(logPath, keptLines.join("\n"), "utf-8");
  } catch {
    // Ignore best-effort log trimming failures.
  }
}

function writeToLogFile(source, entries) {
  if (!entries.length) return;

  ensureLogDir();
  const logPath = path.join(LOG_DIR, `${source}.log`);
  const lines = entries.map((entry) => `[${new Date().toISOString()}] ${JSON.stringify(entry)}`);
  fs.appendFileSync(logPath, `${lines.join("\n")}\n`, "utf-8");
  trimLogFile(logPath, MAX_LOG_SIZE_BYTES);
}

function vitePluginManusDebugCollector() {
  return {
    name: "manus-debug-collector",

    transformIndexHtml(html) {
      if (process.env.NODE_ENV === "production") {
        return html;
      }

      return {
        html,
        tags: [
          {
            tag: "script",
            attrs: {
              src: "/__manus__/debug-collector.js",
              defer: true,
            },
            injectTo: "head",
          },
        ],
      };
    },

    configureServer(server) {
      server.middlewares.use("/__manus__/logs", (req, res, next) => {
        if (req.method !== "POST") {
          return next();
        }

        const handlePayload = (payload) => {
          if (payload.consoleLogs?.length > 0) {
            writeToLogFile("browserConsole", payload.consoleLogs);
          }
          if (payload.networkRequests?.length > 0) {
            writeToLogFile("networkRequests", payload.networkRequests);
          }
          if (payload.sessionEvents?.length > 0) {
            writeToLogFile("sessionReplay", payload.sessionEvents);
          }

          res.writeHead(200, { "Content-Type": "application/json" });
          res.end(JSON.stringify({ success: true }));
        };

        const reqBody = req.body;
        if (reqBody && typeof reqBody === "object") {
          try {
            handlePayload(reqBody);
          } catch (error) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(error) }));
          }
          return;
        }

        let body = "";
        req.on("data", (chunk) => {
          body += chunk.toString();
        });

        req.on("end", () => {
          try {
            handlePayload(JSON.parse(body));
          } catch (error) {
            res.writeHead(400, { "Content-Type": "application/json" });
            res.end(JSON.stringify({ success: false, error: String(error) }));
          }
        });
      });
    },
  };
}

function vitePluginTypeScriptWithoutEsbuild() {
  return {
    name: "typescript-without-esbuild",
    enforce: "pre",
    transform(code, id) {
      const [filePath] = id.split("?", 1);
      if (!filePath || filePath.includes("/node_modules/") || filePath.endsWith(".d.ts")) {
        return null;
      }

      if (!/\.(ts|tsx|mts|cts)$/.test(filePath)) {
        return null;
      }

      const result = ts.transpileModule(code, {
        fileName: filePath,
        compilerOptions: {
          module: ts.ModuleKind.ESNext,
          moduleResolution: ts.ModuleResolutionKind.Bundler,
          target: ts.ScriptTarget.ES2022,
          jsx: ts.JsxEmit.ReactJSX,
          allowImportingTsExtensions: true,
          esModuleInterop: true,
          sourceMap: true,
          inlineSources: true,
          verbatimModuleSyntax: true,
          useDefineForClassFields: true,
        },
      });

      return {
        code: result.outputText,
        map: result.sourceMapText ? JSON.parse(result.sourceMapText) : null,
      };
    },
  };
}

function bundleBudgetPlugin() {
  const limits = readBundleLimits();
  const failOnBudget =
    process.env.STRICT_BUNDLE_BUDGETS === "true" || process.env.CI === "true";

  return {
    name: "truckfixr-bundle-budget",
    generateBundle(_options, bundle) {
      const findings = [];

      for (const artifact of Object.values(bundle)) {
        if (artifact.type !== "asset" && artifact.type !== "chunk") {
          continue;
        }

        if (artifact.type === "chunk" && artifact.fileName.endsWith(".js")) {
          const gzipBytes = gzipSync(artifact.code).length;
          if (gzipBytes > limits.maxJsChunkGzipBytes) {
            findings.push(
              `${artifact.fileName} gzip size ${gzipBytes} exceeds ${limits.maxJsChunkGzipBytes} bytes`
            );
          }
          continue;
        }

        if (artifact.type === "asset" && typeof artifact.source !== "undefined") {
          const sourceBuffer = Buffer.isBuffer(artifact.source)
            ? artifact.source
            : Buffer.from(String(artifact.source));
          if (sourceBuffer.length > limits.maxStaticAssetBytes) {
            findings.push(
              `${artifact.fileName} size ${sourceBuffer.length} exceeds ${limits.maxStaticAssetBytes} bytes`
            );
          }
        }
      }

      if (!findings.length) {
        return;
      }

      const message = `[BundleBudget] ${findings.join("; ")}`;
      if (failOnBudget) {
        throw new Error(message);
      }

      this.warn(message);
    },
  };
}

const plugins = [
  vitePluginTypeScriptWithoutEsbuild(),
  react(),
  tailwindcss(),
  jsxLocPlugin(),
  ...(enableManusRuntime ? [vitePluginManusRuntime()] : []),
  vitePluginManusDebugCollector(),
  bundleBudgetPlugin(),
];

export default defineConfig({
  base: "/",
  plugins,
  esbuild: false,
  resolve: {
    alias: {
      "@": path.resolve(import.meta.dirname, "client", "src"),
      "@shared": path.resolve(import.meta.dirname, "shared"),
      "@assets": path.resolve(import.meta.dirname, "attached_assets"),
      "use-sync-external-store/shim": path.resolve(
        import.meta.dirname,
        "client",
        "src",
        "vendor",
        "useSyncExternalStoreShim.ts"
      ),
      "use-sync-external-store/shim/index.js": path.resolve(
        import.meta.dirname,
        "client",
        "src",
        "vendor",
        "useSyncExternalStoreShim.ts"
      ),
    },
  },
  envDir: path.resolve(import.meta.dirname),
  root: path.resolve(import.meta.dirname, "client"),
  publicDir: path.resolve(import.meta.dirname, "client", "public"),
  build: {
    outDir: path.resolve(import.meta.dirname, "dist/public"),
    emptyOutDir: true,
    chunkSizeWarningLimit: 400,
    rollupOptions: {
      output: {
        manualChunks(id) {
          if (!id.includes("node_modules")) return undefined;
          if (id.includes("/wouter/")) return "vendor-router";
          if (
            id.includes("/sonner/") ||
            id.includes("/cmdk/") ||
            id.includes("/vaul/") ||
            id.includes("/input-otp/") ||
            id.includes("/embla-carousel")
          ) {
            return "vendor-ui";
          }
          if (
            id.includes("/@floating-ui/") ||
            id.includes("/react-remove-scroll") ||
            id.includes("/react-style-singleton/") ||
            id.includes("/use-callback-ref/") ||
            id.includes("/use-sidecar/")
          ) {
            return "vendor-overlay";
          }
          if (
            id.includes("/clsx/") ||
            id.includes("/tailwind-merge/") ||
            id.includes("/class-variance-authority/")
          ) {
            return "vendor-style";
          }
          if (id.includes("@aws-sdk")) return "vendor-aws";
          if (id.includes("@radix-ui")) return "vendor-radix";
          if (id.includes("jose")) return "vendor-auth";
          if (id.includes("date-fns") || id.includes("react-day-picker")) return "vendor-dates";
          if (id.includes("react-hook-form") || id.includes("@hookform")) return "vendor-forms";
          if (id.includes("lucide-react")) return "vendor-icons";
          if (id.includes("framer-motion")) return "vendor-motion";
          if (id.includes("recharts")) return "vendor-charts";
          if (id.includes("@tanstack") || id.includes("@trpc") || id.includes("superjson")) {
            return "vendor-data";
          }
          if (id.includes("zod")) return "vendor-validate";
          if (id.includes("streamdown")) return "vendor-markdown";
          return "vendor-shared";
        },
      },
    },
  },
  optimizeDeps: {
    noDiscovery: true,
    include: ["react", "react/jsx-runtime", "react-dom", "react-dom/client", "wouter"],
    needsInterop: ["react-dom", "react-dom/client"],
  },
  server: {
    host: true,
    allowedHosts: [
      ".manuspre.computer",
      ".manus.computer",
      ".manus-asia.computer",
      ".manuscomputer.ai",
      ".manusvm.computer",
      "localhost",
      "127.0.0.1",
    ],
    fs: {
      strict: true,
      deny: ["**/.*"],
    },
  },
});
