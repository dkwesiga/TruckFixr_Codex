import "dotenv/config";
import { canSpawnChildProcess } from "../lib/spawn-env.mjs";
import { finishVerification } from "../lib/verify-report.mjs";

async function main() {
  const spawnOk = canSpawnChildProcess();

  if (!spawnOk) {
    process.exit(
      finishVerification({
        check: "verify:browser-smoke",
        mode: "lite",
        status: "skipped",
        reason:
          "spawn restricted (EPERM); Playwright/Chrome cannot launch. Run full verify:browser-smoke in an environment that allows spawning browsers.",
      })
    );
  }

  // browser-smoke-lite is a spawn-capability probe/placeholder: a successful
  // probe means the host CAN launch browsers, but the real route smoke still
  // runs via the full verify:browser-smoke harness.
  process.exit(
    finishVerification({
      check: "verify:browser-smoke",
      mode: "lite",
      status: "passed",
      reason: "spawn-capability probe passed; run full verify:browser-smoke for real route coverage",
    })
  );
}

await main();

