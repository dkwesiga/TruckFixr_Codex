import express, { type Express } from "express";
import childProcess, { type ChildProcess, type ExecException } from "node:child_process";
import fs from "fs";
import { type Server } from "http";
import path from "path";

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

  const patchedExec = ((command: string, ...args: unknown[]) => {
    if (/^\s*net\s+use\s*$/i.test(command)) {
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

      const fakeChild = {
        pid: 0,
        kill: () => false,
        on: () => fakeChild,
        once: () => fakeChild,
        stdout: null,
        stderr: null,
      };

      return fakeChild as unknown as ChildProcess;
    }

    return originalExec(command, ...(args as Parameters<typeof childProcess.exec> extends [any, ...infer Rest] ? Rest : never));
  }) as typeof childProcess.exec & { __truckfixrPatched?: boolean };

  patchedExec.__truckfixrPatched = true;
  childProcess.exec = patchedExec;
}

export async function setupVite(app: Express, server: Server) {
  patchWindowsViteExecProbe();

  const [{ createServer: createViteServer }, { default: viteConfig }] = await Promise.all([
    import("vite"),
    import("../../vite.config"),
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
