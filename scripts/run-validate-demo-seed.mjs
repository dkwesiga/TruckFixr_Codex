import { spawnSync } from "node:child_process";

function canSpawnChildProcess() {
  const probe = spawnSync("cmd.exe", ["/c", "echo", "ok"], { encoding: "utf8" });
  if (probe.error?.code === "EPERM") return false;
  return probe.status === 0;
}

async function main() {
  const spawnOk = canSpawnChildProcess();

  if (!spawnOk) {
    console.warn(
      "[truckfixr] SKIP: `pnpm validate:demo-seed` requires child-process spawning (tsx/esbuild) but this environment returns EPERM on spawn."
    );
    console.warn(
      "[truckfixr] Run demo seed validation in a non-restricted shell/host, or allow child-process spawning for Node."
    );
    if (process.env.CI || process.env.TFX_REQUIRE_SPAWN === "true") {
      process.exit(1);
    }
    process.exit(0);
  }

  const result = spawnSync(
    "pnpm",
    ["exec", "tsx", "scripts/validate-demo-seed.ts"],
    { stdio: "inherit", shell: process.platform === "win32" }
  );

  process.exit(result.status ?? 1);
}

await main();
