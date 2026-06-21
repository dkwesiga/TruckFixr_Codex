// 360px horizontal-overflow guard for public routes + the downtime calculator
// modal. This is the automatable slice of docs/MOBILE_TEST_CHECKLIST.md — it
// catches the most common mobile regression (horizontal scrolling) and
// layout-breaking console errors without real-device hardware.
//
// It does NOT replace the real-device matrix: authenticated flows (dashboard,
// diagnosis, inspection) and true Android Chrome/Brave/WebView behaviour still
// require a human pass. Run that matrix and fill in the checklist.
//
// Usage:
//   pnpm dev                       # in one terminal (or point BASE_URL elsewhere)
//   pnpm check:mobile-overflow     # in another
//
// Env:
//   BASE_URL  default http://localhost:3000
//   CHROME_PATH / GOOGLE_CHROME_PATH / PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH
//             override the auto-detected browser binary.

import { existsSync } from "node:fs";
import { chromium } from "playwright-core";

const BASE_URL = (process.env.BASE_URL || "http://localhost:3000").replace(/\/$/, "");
const VIEWPORT = { width: 360, height: 800 };
const OVERFLOW_TOLERANCE_PX = 1; // sub-pixel rounding noise

// Public routes only — authenticated flows need a session and stay on the
// manual matrix.
const ROUTES = ["/", "/fleet-downtime-cost-calculator", "/pricing", "/access", "/signup"];

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
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
  ].filter(Boolean);

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  throw new Error(
    "No Chrome/Chromium found. Set CHROME_PATH or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH."
  );
}

async function measureOverflow(page) {
  return page.evaluate(() => {
    const doc = document.documentElement;
    return {
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
    };
  });
}

async function checkPage(page, label, consoleErrors) {
  const { scrollWidth, innerWidth } = await measureOverflow(page);
  const overflow = scrollWidth - innerWidth;
  const hasOverflow = overflow > OVERFLOW_TOLERANCE_PX;
  const errors = consoleErrors.splice(0);
  const ok = !hasOverflow && errors.length === 0;
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${label}  (scrollWidth=${scrollWidth} innerWidth=${innerWidth}` +
      `${hasOverflow ? ` overflow=${overflow}px` : ""}${errors.length ? ` errors=${errors.length}` : ""})`
  );
  for (const e of errors) console.log(`        console.error: ${e}`);
  return ok;
}

async function main() {
  const browser = await chromium.launch({
    executablePath: getBrowserExecutablePath(),
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-gpu"],
  });
  const context = await browser.newContext({ viewport: VIEWPORT });
  const page = await context.newPage();

  const consoleErrors = [];
  page.on("console", (msg) => {
    if (msg.type() === "error") consoleErrors.push(msg.text());
  });

  let allOk = true;
  for (const route of ROUTES) {
    consoleErrors.splice(0);
    await page.goto(`${BASE_URL}${route}`, { waitUntil: "networkidle" });
    allOk = (await checkPage(page, route, consoleErrors)) && allOk;
  }

  // Open the downtime calculator modal from the landing hero and re-check.
  try {
    consoleErrors.splice(0);
    await page.goto(`${BASE_URL}/`, { waitUntil: "networkidle" });
    await page.getByRole("button", { name: /calculate downtime cost/i }).first().click();
    await page.getByRole("dialog").waitFor({ state: "visible", timeout: 5000 });
    allOk = (await checkPage(page, "/ (calculator modal open)", consoleErrors)) && allOk;
  } catch (error) {
    console.log(`FAIL  / (calculator modal open)  could not open modal: ${error.message}`);
    allOk = false;
  }

  await browser.close();

  if (!allOk) {
    console.error("\nMobile overflow guard FAILED — see rows above.");
    process.exit(1);
  }
  console.log("\nAll checked routes passed the 360px overflow guard.");
}

main().catch((error) => {
  console.error("ERROR:", error.message);
  process.exit(1);
});
