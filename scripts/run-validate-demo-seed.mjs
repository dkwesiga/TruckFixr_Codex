import { spawnSync } from "node:child_process";
import { canSpawnChildProcess } from "./lib/spawn-env.mjs";
import { finishVerification } from "./lib/verify-report.mjs";

async function main() {
  if (!canSpawnChildProcess()) {
    process.exit(
      finishVerification({
        check: "validate:demo-seed",
        mode: "full",
        status: "skipped",
        reason: "spawn restricted (tsx/esbuild EPERM); run demo seed validation in a non-restricted shell/host",
      })
    );
  }

  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/validate-demo-seed.ts"],
    { stdio: "inherit", shell: process.platform === "win32" }
  );

  process.exit(
    finishVerification({
      check: "validate:demo-seed",
      mode: "full",
      status: result.status === 0 ? "passed" : "failed",
      reason: result.status === 0 ? null : `validate-demo-seed exited ${result.status ?? "with no status"}`,
    })
  );
}

await main();
