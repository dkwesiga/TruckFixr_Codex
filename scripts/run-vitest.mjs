import path from "node:path";
import { isSpawnRestricted, patchWindowsViteExecProbe } from "./lib/spawn-env.mjs";
import { finishVerification, requireFullVerification } from "./lib/verify-report.mjs";

const root = path.resolve(import.meta.dirname, "..");
const cliFilters = process.argv.slice(2);

patchWindowsViteExecProbe();

if (await isSpawnRestricted()) {
  console.warn(
    "[truckfixr] `pnpm test` needs child-process spawning (esbuild/Vite) but this environment returns EPERM on spawn."
  );

  // CI (or an explicit requirement) must run the real suite — a lite pass is
  // not an acceptable substitute there, so report a skip and fail.
  if (requireFullVerification()) {
    process.exit(
      finishVerification({
        check: "test",
        mode: "full",
        status: "skipped",
        reason: "spawn restricted; full Vitest is required in CI/TFX_REQUIRE_SPAWN",
      })
    );
  }

  console.warn("[truckfixr] Falling back to spawn-safe lite tests (no Vite/Vitest).");
  // run-tests-lite.mjs exits 1 itself if any lite check fails, so reaching the
  // next line means the lite suite passed.
  await import("./run-tests-lite.mjs");
  process.exit(
    finishVerification({
      check: "test",
      mode: "lite",
      status: "passed",
      reason: "full Vitest skipped (spawn restricted); spawn-safe lite checks passed",
    })
  );
}

const { startVitest } = await import("vitest/node");

const ctx = await startVitest(
  "test",
  cliFilters,
  {
    root,
    watch: false,
    run: true,
    config: false,
  },
  {
    resolve: {
      alias: {
        "@": path.resolve(root, "client", "src"),
        "@shared": path.resolve(root, "shared"),
        "@assets": path.resolve(root, "attached_assets"),
      },
    },
    test: {
      environment: "node",
      pool: "threads",
      fileParallelism: false,
      isolate: true,
      include: [
        "server/**/*.test.ts",
        "server/**/*.spec.ts",
        "client/**/*.test.ts",
        "client/**/*.spec.ts",
        "shared/**/*.test.ts",
        "shared/**/*.spec.ts",
      ],
    },
  }
);

const failedTests = ctx?.state.getCountOfFailedTests() ?? 0;
const unhandledErrors = ctx?.state.getUnhandledErrors().length ?? 0;
await ctx?.close();

if (failedTests > 0 || unhandledErrors > 0) {
  process.exit(
    finishVerification({
      check: "test",
      mode: "full",
      status: "failed",
      reason: `${failedTests} failed test(s), ${unhandledErrors} unhandled error(s)`,
    })
  );
}

process.exit(finishVerification({ check: "test", mode: "full", status: "passed" }));
