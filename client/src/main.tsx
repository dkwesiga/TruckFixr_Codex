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

  root.replaceChildren();

  const page = document.createElement("div");
  page.style.minHeight = "100vh";
  page.style.display = "flex";
  page.style.alignItems = "center";
  page.style.justifyContent = "center";
  page.style.padding = "24px";
  page.style.background = "linear-gradient(180deg,#f8fafc 0%,#eef3f8 100%)";
  page.style.fontFamily = "Inter,Segoe UI,Arial,sans-serif";

  const card = document.createElement("div");
  card.style.maxWidth = "640px";
  card.style.width = "100%";
  card.style.border = "1px solid #e2e8f0";
  card.style.borderRadius = "24px";
  card.style.background = "#ffffff";
  card.style.boxShadow = "0 18px 48px -32px rgba(15,23,42,.35)";
  card.style.padding = "32px";

  const eyebrow = document.createElement("p");
  eyebrow.textContent = "TruckFixr";
  eyebrow.style.margin = "0 0 8px";
  eyebrow.style.fontSize = "12px";
  eyebrow.style.fontWeight = "700";
  eyebrow.style.letterSpacing = ".12em";
  eyebrow.style.textTransform = "uppercase";
  eyebrow.style.color = "#64748b";

  const heading = document.createElement("h1");
  heading.textContent = "The app hit a startup error.";
  heading.style.margin = "0 0 12px";
  heading.style.fontSize = "28px";
  heading.style.lineHeight = "1.2";
  heading.style.color = "#0f172a";

  const description = document.createElement("p");
  description.textContent =
    "Reload the page to try again. If it keeps happening, this message helps us avoid a blank screen while we trace the failing module.";
  description.style.margin = "0 0 18px";
  description.style.fontSize = "14px";
  description.style.lineHeight = "1.6";
  description.style.color = "#475569";

  const pre = document.createElement("pre");
  pre.textContent = message;
  pre.style.margin = "0";
  pre.style.overflow = "auto";
  pre.style.borderRadius = "16px";
  pre.style.background = "#f8fafc";
  pre.style.padding = "16px";
  pre.style.fontSize = "12px";
  pre.style.lineHeight = "1.5";
  pre.style.color = "#334155";
  pre.style.whiteSpace = "pre-wrap";
  pre.style.wordBreak = "break-word";

  card.append(eyebrow, heading, description, pre);
  page.append(card);
  root.append(page);
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
