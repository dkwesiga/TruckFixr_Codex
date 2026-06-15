import path from "node:path";
import { isSpawnRestricted, patchWindowsViteExecProbe } from "./lib/spawn-env.mjs";
import { finishVerification } from "./lib/verify-report.mjs";

process.env.NODE_ENV = process.env.NODE_ENV || "production";

const root = path.resolve(import.meta.dirname, "..");

patchWindowsViteExecProbe();

if (await isSpawnRestricted()) {
  process.exit(
    finishVerification({
      check: "build:client",
      mode: "full",
      status: "skipped",
      reason: "spawn restricted (esbuild/Vite returns EPERM); run the client build in a non-restricted shell/host",
    })
  );
}

const [{ build }, { default: viteConfig }] = await Promise.all([
  import("vite"),
  import("../vite.config.mjs"),
]);

await build({
  ...viteConfig,
  root: viteConfig.root ?? path.resolve(root, "client"),
  configFile: false,
  mode: "production",
});

process.exit(finishVerification({ check: "build:client", mode: "full", status: "passed" }));
