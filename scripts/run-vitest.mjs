import childProcess from "node:child_process";
import path from "node:path";

const root = path.resolve(import.meta.dirname, "..");
const cliFilters = process.argv.slice(2);

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

function patchWindowsViteExecProbe() {
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

    return Array.isArray(args)
      ? originalExecFile(file, args, ...rest)
      : originalExecFile(file, args, ...rest);
  };

  childProcess.spawn = (command, args = [], options) => {
    if (isWindowsNetUseProbe(command, args)) {
      return createFakeChild();
    }

    return originalSpawn(command, args, options);
  };
}

patchWindowsViteExecProbe();

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
      ],
    },
  }
);

const failedTests = ctx?.state.getCountOfFailedTests() ?? 0;
const unhandledErrors = ctx?.state.getUnhandledErrors().length ?? 0;
await ctx?.close();

if (failedTests > 0 || unhandledErrors > 0) {
  process.exit(1);
}
