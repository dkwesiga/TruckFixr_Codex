import "dotenv/config";
import { spawnSync } from "node:child_process";

function canSpawnChildProcess() {
  const probe = spawnSync("cmd.exe", ["/c", "echo", "ok"], { encoding: "utf8" });
  if (probe.error?.code === "EPERM") return false;
  return probe.status === 0;
}

async function main() {
  const spawnOk = canSpawnChildProcess();

  const result = {
    ok: spawnOk,
    skipped: !spawnOk,
    reason: spawnOk
      ? null
      : "This environment blocks Node child-process spawning (EPERM), so Playwright/Chrome cannot be launched for browser smoke.",
    note:
      "browser-smoke-lite is a spawn-capability probe and placeholder; run full `verify:browser-smoke` in an environment that allows spawning browsers.",
  };

  // eslint-disable-next-line no-console
  console.log(JSON.stringify(result, null, 2));

  if (!spawnOk) {
    if (process.env.CI || process.env.TFX_REQUIRE_SPAWN === "true") {
      process.exit(1);
    }
  }
}

await main();

