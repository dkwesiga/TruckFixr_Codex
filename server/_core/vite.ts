import express, { type Express } from "express";
import childProcess, { type ChildProcess, type ExecException } from "node:child_process";
import fs from "fs";
import { type Server } from "http";
import { syncBuiltinESMExports } from "node:module";
import path from "path";

function patchWindowsViteRealpathProbe() {
  if (process.platform !== "win32" || typeof fs.realpathSync.native !== "function") {
    return;
  }

  const realpathNative = fs.realpathSync.native as typeof fs.realpathSync.native & {
    __truckfixrPatched?: boolean;
  };

  if (realpathNative.__truckfixrPatched) {
    return;
  }

  const originalNative = fs.realpathSync.native.bind(fs.realpathSync);
  const cwdProbePath = path.resolve("./");
  const patchedNative = ((targetPath: fs.PathLike, options?: Parameters<typeof fs.realpathSync.native>[1]) => {
    const normalizedTarget = typeof targetPath === "string" ? path.resolve(targetPath) : "";
    if (normalizedTarget === cwdProbePath) {
      const error = new Error("EISDIR: illegal operation on a directory");
      (error as NodeJS.ErrnoException).code = "EISDIR";
      throw error;
    }

    return originalNative(targetPath, options as never);
  }) as typeof fs.realpathSync.native & { __truckfixrPatched?: boolean };

  patchedNative.__truckfixrPatched = true;
  fs.realpathSync.native = patchedNative;
}

function isWindowsNetUseProbe(command: unknown, args: unknown[] = []) {
  if (typeof command !== "string") {
    return false;
  }

  if (/^\s*net\s+use\s*$/i.test(command)) {
    return true;
  }

  if (!/cmd(.exe)?$/i.test(command)) {
    return false;
  }

  const joinedArgs = args.filter((value): value is string => typeof value === "string").join(" ");
  return /\bnet\s+use\b/i.test(joinedArgs);
}

function createFakeChild() {
  const fakeChild = {
    pid: 0,
    kill: () => false,
    on() {
      return fakeChild;
    },
    once(event?: string, callback?: (...args: unknown[]) => void) {
      if (event === "exit" || event === "close") {
        queueMicrotask(() => callback?.(1));
      }
      return fakeChild;
    },
    stdout: null,
    stderr: null,
  };

  return fakeChild as unknown as ChildProcess;
}

function patchWindowsViteExecProbe() {
  if (process.platform !== "win32") {
    return;
  }

  const execWithFlag = childProcess.exec as typeof childProcess.exec & {
    __truckfixrPatched?: boolean;
  };

  if (execWithFlag.__truckfixrPatched) {
    return;
  }

  const originalExec = childProcess.exec.bind(childProcess);
  const originalExecFile = childProcess.execFile.bind(childProcess);
  const originalSpawn = childProcess.spawn.bind(childProcess);

  const patchedExec = ((command: string, ...args: unknown[]) => {
    if (isWindowsNetUseProbe(command)) {
      const callback = args.findLast(
        (arg): arg is ((
          error: ExecException | null,
          stdout: string,
          stderr: string
        ) => void) => typeof arg === "function"
      );

      queueMicrotask(() => {
        callback?.(
          Object.assign(new Error("Skipped Windows network drive probe"), {
            code: "EPERM",
          }) as unknown as ExecException,
          "",
          ""
        );
      });

      return createFakeChild();
    }

    return originalExec(command, ...(args as Parameters<typeof childProcess.exec> extends [any, ...infer Rest] ? Rest : never));
  }) as typeof childProcess.exec & { __truckfixrPatched?: boolean };

  patchedExec.__truckfixrPatched = true;
  childProcess.exec = patchedExec;
  childProcess.execFile = ((file: string, args?: readonly string[] | null, ...rest: unknown[]) => {
    const normalizedArgs = Array.isArray(args) ? [...args] : [];
    const remaining = Array.isArray(args) ? rest : [args, ...rest];

    if (isWindowsNetUseProbe(file, normalizedArgs)) {
      const callback = remaining.findLast(
        (arg): arg is ((
          error: ExecException | null,
          stdout: string,
          stderr: string
        ) => void) => typeof arg === "function"
      );

      queueMicrotask(() => {
        callback?.(
          Object.assign(new Error("Skipped Windows network drive probe"), {
            code: "EPERM",
          }) as unknown as ExecException,
          "",
          ""
        );
      });

      return createFakeChild();
    }

    return Array.isArray(args)
      ? originalExecFile(file, args, ...(rest as []))
      : originalExecFile(file, args as null | undefined, ...(rest as []));
  }) as typeof childProcess.execFile;
  childProcess.spawn = ((command: string, args?: readonly string[] | null, options?: Parameters<typeof originalSpawn>[2]) => {
    if (isWindowsNetUseProbe(command, Array.isArray(args) ? [...args] : [])) {
      return createFakeChild();
    }

    if (Array.isArray(args)) {
      return (originalSpawn as typeof childProcess.spawn)(command, args, options as NonNullable<typeof options>);
    }

    return (originalSpawn as typeof childProcess.spawn)(command, [], args as Parameters<typeof originalSpawn>[2]);
  }) as typeof childProcess.spawn;
  syncBuiltinESMExports();
}

export async function setupVite(app: Express, server: Server) {
  patchWindowsViteRealpathProbe();
  patchWindowsViteExecProbe();

  const viteConfigModuleUrl = new URL("../../vite.config.mjs", import.meta.url).href;
  const [{ createServer: createViteServer }, { default: viteConfig }] = await Promise.all([
    import("vite"),
    import(viteConfigModuleUrl),
  ]);

  const serverOptions = {
    middlewareMode: true,
    hmr: {
      server,
      protocol: "ws" as const,
      clientPort: 3000,
    },
    allowedHosts: true as const,
  };

  const vite = await createViteServer({
    ...viteConfig,
    configFile: false,
    server: serverOptions,
    appType: "custom",
  });
  const htmlCache = new Map<string, { mtimeMs: number; page: string }>();

  app.use(vite.middlewares);
  app.use("*", async (req, res, next) => {
    const url = req.originalUrl;

    try {
      const clientTemplate = path.resolve(
        import.meta.dirname,
        "../..",
        "client",
        "index.html"
      );

      const { mtimeMs } = await fs.promises.stat(clientTemplate);
      const cachedPage = htmlCache.get(url);

      if (cachedPage && cachedPage.mtimeMs === mtimeMs) {
        res.status(200).set({ "Content-Type": "text/html" }).end(cachedPage.page);
        return;
      }

      // Always reload index.html from disk in case it changes, but keep the
      // entry script URL stable so the browser can reuse Vite's module cache.
      const template = await fs.promises.readFile(clientTemplate, "utf-8");
      const page = await vite.transformIndexHtml(url, template);
      htmlCache.set(url, { mtimeMs, page });
      res.status(200).set({ "Content-Type": "text/html" }).end(page);
    } catch (e) {
      vite.ssrFixStacktrace(e as Error);
      next(e);
    }
  });
}

export function serveStatic(app: Express) {
  const distPath =
    process.env.NODE_ENV === "development"
      ? path.resolve(import.meta.dirname, "../..", "dist", "public")
      : path.resolve(import.meta.dirname, "public");
  if (!fs.existsSync(distPath)) {
    console.error(
      `Could not find the build directory: ${distPath}, make sure to build the client first`
    );
  }

  app.use(express.static(distPath));

  // fall through to index.html if the file doesn't exist
  app.use("*", (_req, res) => {
    res.sendFile(path.resolve(distPath, "index.html"));
  });
}
