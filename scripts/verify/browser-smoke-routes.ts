import { chromium } from "playwright-core";

const baseUrl = process.env.BROWSER_SMOKE_BASE_URL?.replace(/\/$/, "") ?? "http://127.0.0.1:3000";
const routes = ["/", "/signup", "/pricing", "/diagnosis", "/inspection", "/dashboard"];
const viewports = [
  { name: "mobile", width: 390, height: 844 },
  { name: "tablet", width: 768, height: 1024 },
  { name: "desktop", width: 1440, height: 900 },
];

async function main() {
  let browser;
  try {
    browser = await chromium.launch({ headless: true });
  } catch (error) {
    console.log(JSON.stringify({ status: "skipped", reason: "Chromium unavailable", detail: String(error) }));
    return;
  }

  const failures: string[] = [];
  try {
    for (const viewport of viewports) {
      const page = await browser.newPage({ viewport });
      page.on("console", (message) => {
        if (message.type() === "error") failures.push(`${viewport.name}:console:${message.text()}`);
      });
      page.on("pageerror", (error) => failures.push(`${viewport.name}:pageerror:${error.message}`));

      for (const route of routes) {
        const response = await page.goto(`${baseUrl}${route}`, { waitUntil: "domcontentloaded", timeout: 15_000 }).catch(() => null);
        if (!response || response.status() >= 500) failures.push(`${viewport.name}:${route}:http_${response?.status() ?? "unreachable"}`);
        const overflow = await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth + 1);
        if (overflow) failures.push(`${viewport.name}:${route}:horizontal_overflow`);
      }
      await page.close();
    }
  } finally {
    await browser.close();
  }

  console.log(JSON.stringify({ status: failures.length ? "failed" : "passed", baseUrl, routes, viewports, failures }, null, 2));
  if (failures.length) process.exitCode = 1;
}

await main();
