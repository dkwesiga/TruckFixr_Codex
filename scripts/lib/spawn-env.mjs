/**
 * Shared spawn-environment detection for verification scripts (TFX-CR-0023).
 *
 * Previously this logic was duplicated across run-vitest.mjs and
 * run-build-client.mjs (the Windows `net use` probe patch) and a separate,
 * non-portable `cmd.exe` probe lived in the demo-seed / browser-smoke wrappers.
 * Centralizing it removes drift and fixes the cmd.exe probe, which returned
 * ENOENT (treated as "cannot spawn") on non-Windows CI hosts.
 */

import childProcess from "node:child_process";

function isWindowsNetUseProbe(command, args = []) {
  if (typeof command !== "string") {
    return false;
  }

  if (/^\s*net\s+use\s*$/i.test(command)) {
    return true;
  }

  if (!/cmd(.exe)?$/i.test(command)) {
    return false;
  }

  const joinedArgs = args.filter((value) => typeof value === "string").join(" ");
  return /\bnet\s+use\b/i.test(joinedArgs);
}

function createFakeChild() {
  return {
    pid: 0,
    kill: () => false,
    on() {
      return this;
    },
    once(event, callback) {
      if (event === "exit" || event === "close") {
        queueMicrotask(() => callback?.(1));
      }
      return this;
    },
    stdout: null,
    stderr: null,
  };
}

/**
 * Vite's dev/build path on Windows probes for mapped network drives via
 * `net use`, which throws EPERM in restricted shells and aborts the build.
 * Intercept that single probe so the real build can proceed.
 */
export function patchWindowsViteExecProbe() {
  if (process.platform !== "win32") {
    return;
  }

  if (childProcess.exec.__truckfixrPatched) {
    return;
  }

  const originalExec = childProcess.exec.bind(childProcess);
  const originalExecFile = childProcess.execFile.bind(childProcess);
  const originalSpawn = childProcess.spawn.bind(childProcess);

  childProcess.exec = Object.assign((command, ...args) => {
    if (isWindowsNetUseProbe(command)) {
      const callback = [...args].reverse().find((value) => typeof value === "function");
      queueMicrotask(() => {
        callback?.(Object.assign(new Error("Skipped Windows network drive probe"), { code: "EPERM" }), "", "");
      });
      return createFakeChild();
    }

    return originalExec(command, ...args);
  }, { __truckfixrPatched: true });

  childProcess.execFile = (file, args, ...rest) => {
    const normalizedArgs = Array.isArray(args) ? args : [];
    const remaining = Array.isArray(args) ? rest : [args, ...rest];
    if (isWindowsNetUseProbe(file, normalizedArgs)) {
      const callback = [...remaining].reverse().find((value) => typeof value === "function");
      queueMicrotask(() => {
        callback?.(Object.assign(new Error("Skipped Windows network drive probe"), { code: "EPERM" }), "", "");
      });
      return createFakeChild();
    }

    return originalExecFile(file, args, ...rest);
  };

  childProcess.spawn = (command, args = [], options) => {
    if (isWindowsNetUseProbe(command, args)) {
      return createFakeChild();
    }

    return originalSpawn(command, args, options);
  };
}

/**
 * True when the toolchain that needs child-process spawning (esbuild/Vite)
 * cannot run here because the environment returns EPERM on spawn.
 */
export async function isSpawnRestricted() {
  try {
    const esbuild = await import("esbuild");
    await esbuild.transform("const x: number = 1", { loader: "ts" });
    return false;
  } catch (error) {
    const code = error?.code || error?.cause?.code;
    return code === "EPERM";
  }
}

/**
 * Portable spawn-capability probe. Uses the current Node binary (which exists on
 * every platform) instead of the old Windows-only `cmd.exe`, so it reports the
 * truth on Linux/macOS CI as well as in restricted Windows shells.
 */
export function canSpawnChildProcess() {
  const probe = childProcess.spawnSync(process.execPath, ["-e", "process.exit(0)"], {
    encoding: "utf8",
  });
  if (probe.error) {
    return false;
  }
  return probe.status === 0;
}
