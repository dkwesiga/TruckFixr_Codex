import "dotenv/config";
import { chromium, type Page } from "playwright-core";
import { existsSync } from "node:fs";
import { DEMO_FLEET_SEED, getDemoBaseUrl } from "../../shared/demoAssets";
import { ensureDemoWorkflowReady, seedDemoData } from "../demo/demo-workflow";

type NavigationMetrics = {
  url: string;
  status: number | null;
  domContentLoadedMs: number | null;
  loadMs: number | null;
  totalDurationMs: number;
  usableMs: number | null;
};

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) {
    throw new Error(message);
  }
}

function getBrowserExecutablePath() {
  const candidates = [
    process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
    process.env.CHROME_PATH,
    process.env.GOOGLE_CHROME_PATH,
    process.env.CHROMIUM_PATH,
    "C:/Program Files/Google/Chrome/Application/chrome.exe",
    "C:/Program Files (x86)/Google/Chrome/Application/chrome.exe",
    "C:/Program Files/Microsoft/Edge/Application/msedge.exe",
    "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (candidate && existsSync(candidate)) return candidate;
  }

  throw new Error(
    "No Chrome or Chromium executable was found. Set CHROME_PATH or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH."
  );
}

async function collectMetrics(
  page: Page,
  routeUrl: string,
  options?: {
    action?: (page: Page) => Promise<void>;
    readySelector?: string;
  }
) {
  const startedAt = Date.now();
  const response = await page.goto(routeUrl, { waitUntil: "domcontentloaded" });
  if (options?.readySelector) {
    await page.locator(options.readySelector).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
  } else {
    await page.waitForLoadState("networkidle").catch(() => undefined);
  }

  const usableAfterInitialLoadMs = Date.now() - startedAt;

  if (options?.action) {
    await options.action(page);
    if (options.readySelector) {
      await page.locator(options.readySelector).first().waitFor({ state: "visible", timeout: 20_000 }).catch(() => undefined);
    } else {
      await page.waitForLoadState("networkidle").catch(() => undefined);
    }
  }

  const navigation = await page.evaluate(() => {
    const [entry] = performance.getEntriesByType("navigation") as PerformanceNavigationTiming[];
    if (!entry) {
      return null;
    }

    return {
      domContentLoadedMs: Math.round(entry.domContentLoadedEventEnd),
      loadMs: Math.round(entry.loadEventEnd),
    };
  });

  return {
    url: routeUrl,
    status: response?.status() ?? null,
    domContentLoadedMs: navigation?.domContentLoadedMs ?? null,
    loadMs: navigation?.loadMs ?? null,
    totalDurationMs: Date.now() - startedAt,
    usableMs: usableAfterInitialLoadMs,
  } satisfies NavigationMetrics;
}

function scoreMetric(value: number | null) {
  if (value == null) return "unknown";
  if (value <= 1_800) return "green";
  if (value <= 3_000) return "yellow";
  return "red";
}

async function signIn(page: Page, baseUrl: string, email: string) {
  await page.goto(`${baseUrl}/auth/email`, { waitUntil: "domcontentloaded" });
  const emailInput = page.locator('input[type="email"], input[name="email"], #email').first();
  const passwordInput = page.locator('input[type="password"], input[name="password"], #password').first();

  const emailReady = await emailInput
    .waitFor({ state: "visible", timeout: 15_000 })
    .then(() => true)
    .catch(() => false);

  if (!emailReady) {
    const gatewaySignInButton = page.getByRole("button", { name: /^sign in$/i }).first();
    if (await gatewaySignInButton.count()) {
      await gatewaySignInButton.click().catch(() => undefined);
    } else {
      await page.goto(`${baseUrl}/access`, { waitUntil: "domcontentloaded" });
      const accessSignInButton = page.getByRole("button", { name: /^sign in$/i }).first();
      if (await accessSignInButton.count()) {
        await accessSignInButton.click().catch(() => undefined);
      }
    }

    await emailInput.waitFor({ state: "visible", timeout: 30_000 });
  }

  await emailInput.fill(email);
  await passwordInput.waitFor({ state: "visible", timeout: 30_000 });
  await passwordInput.fill(DEMO_FLEET_SEED.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => undefined);
}

async function main() {
  process.env.DEMO_CAPTURE_ENV = process.env.DEMO_CAPTURE_ENV || "local";
  process.env.ALLOW_DEMO_SEED = process.env.ALLOW_DEMO_SEED || "true";
  process.env.ALLOW_DEMO_REMOTE_SEED = process.env.ALLOW_DEMO_REMOTE_SEED || "true";

  await ensureDemoWorkflowReady();
  const manifest = await seedDemoData();
  const baseUrl = getDemoBaseUrl();

  const browser = await chromium.launch({
    executablePath: getBrowserExecutablePath(),
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-gpu"],
  });

  const publicPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const mobilePage = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });

  const pageErrors: string[] = [];
  for (const page of [publicPage, mobilePage]) {
    page.on("pageerror", (error) => {
      pageErrors.push(error.message);
    });
  }

  try {
    const landing = await collectMetrics(publicPage, `${baseUrl}/`, {
      readySelector: "main, [data-testid='landing-hero'], h1",
    });
    const pricing = await collectMetrics(publicPage, `${baseUrl}/pricing`, {
      readySelector: "main h1, [data-testid='pricing-page'], [data-testid='pricing-card']",
    });

    await signIn(mobilePage, baseUrl, DEMO_FLEET_SEED.driverEmail);
    const driverHome = await collectMetrics(mobilePage, `${baseUrl}/driver`, {
      readySelector: "main h2, [data-testid='driver-dashboard'], button",
    });
    const inspection = await collectMetrics(mobilePage, `${baseUrl}${manifest.routes.mobileInspection}`, {
      readySelector: "main h1, main h2, [data-testid='inspection-form'], button",
      action: async (page) => {
        const startButton = page.getByRole("button", { name: /start today's inspection/i }).first();
        if (await startButton.count()) {
          await startButton.click().catch(() => undefined);
        }
      },
    });
    const diagnosis = await collectMetrics(mobilePage, `${baseUrl}${manifest.routes.mobileDiagnosticResult}`, {
      readySelector: "main h1, [data-testid='diagnosis-summary'], text=/Diagnosis Summary|Compliance warning|Likely causes/i",
      action: async (page) => {
        const generateButton = page.getByRole("button", { name: /generate diagnosis|run diagnosis/i }).first();
        if (await generateButton.count()) {
          await generateButton.click().catch(() => undefined);
        }
      },
    });

    const metrics = [landing, pricing, driverHome, inspection, diagnosis];
    for (const metric of metrics) {
      assert(metric.status && metric.status < 400, `Expected ${metric.url} to return a successful response.`);
    }

    console.log(
      JSON.stringify(
        {
          ok: pageErrors.length === 0,
          baseUrl,
          pageErrors,
          metrics: metrics.map((metric) => ({
            ...metric,
            score: scoreMetric(metric.domContentLoadedMs ?? metric.totalDurationMs),
          })),
        },
        null,
        2
      )
    );
  } finally {
    await publicPage.close();
    await mobilePage.close();
    await browser.close();
  }
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
