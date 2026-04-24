import { trpc } from "@/lib/trpc";
import { UNAUTHED_ERR_MSG } from '@shared/const';
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { httpBatchLink, TRPCClientError } from "@trpc/client";
import { createRoot } from "react-dom/client";
import superjson from "superjson";
import App from "./App";
import { getLoginUrl } from "./const";
import { getApiUrl } from "./lib/api";
import { initializeAnalytics } from "./lib/analytics";
import "./index.css";

function renderBootError(message: string) {
  const root = document.getElementById("root");
  if (!root) return;

  root.innerHTML = `
    <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px;background:linear-gradient(180deg,#f8fafc 0%,#eef3f8 100%);font-family:Inter,Segoe UI,Arial,sans-serif;">
      <div style="max-width:640px;width:100%;border:1px solid #e2e8f0;border-radius:24px;background:#ffffff;box-shadow:0 18px 48px -32px rgba(15,23,42,.35);padding:32px;">
        <p style="margin:0 0 8px;font-size:12px;font-weight:700;letter-spacing:.12em;text-transform:uppercase;color:#64748b;">TruckFixr</p>
        <h1 style="margin:0 0 12px;font-size:28px;line-height:1.2;color:#0f172a;">The app hit a startup error.</h1>
        <p style="margin:0 0 18px;font-size:14px;line-height:1.6;color:#475569;">Reload the page to try again. If it keeps happening, this message helps us avoid a blank screen while we trace the failing module.</p>
        <pre style="margin:0;overflow:auto;border-radius:16px;background:#f8fafc;padding:16px;font-size:12px;line-height:1.5;color:#334155;white-space:pre-wrap;">${message}</pre>
      </div>
    </div>
  `;
}

try {
  initializeAnalytics();
} catch (error) {
  console.error("[Bootstrap] Analytics initialization failed", error);
}

const queryClient = new QueryClient();

const redirectToLoginIfUnauthorized = (error: unknown) => {
  if (!(error instanceof TRPCClientError)) return;
  if (typeof window === "undefined") return;

  const isUnauthorized = error.message === UNAUTHED_ERR_MSG;

  if (!isUnauthorized) return;

  window.location.href = getLoginUrl();
};

queryClient.getQueryCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.query.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Query Error]", error);
  }
});

queryClient.getMutationCache().subscribe(event => {
  if (event.type === "updated" && event.action.type === "error") {
    const error = event.mutation.state.error;
    redirectToLoginIfUnauthorized(error);
    console.error("[API Mutation Error]", error);
  }
});

try {
  const trpcClient = trpc.createClient({
    links: [
      httpBatchLink({
        url: getApiUrl("/api/trpc"),
        transformer: superjson,
        fetch(input, init) {
          return globalThis.fetch(input, {
            ...(init ?? {}),
            credentials: "include",
          });
        },
      }),
    ],
  });

  const rootElement = document.getElementById("root");
  if (!rootElement) {
    throw new Error("Root element #root was not found.");
  }

  createRoot(rootElement).render(
    <trpc.Provider client={trpcClient} queryClient={queryClient}>
      <QueryClientProvider client={queryClient}>
        <App />
      </QueryClientProvider>
    </trpc.Provider>
  );
} catch (error) {
  console.error("[Bootstrap] Failed to render app", error);
  const message = error instanceof Error ? error.stack || error.message : String(error);
  renderBootError(message);
}
