import "dotenv/config";
import {chromium, type Browser, type Page} from "playwright-core";
import {dirname, join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {
  assertAppUrl,
  assetsRoot,
  ensureDir,
  getBrowserExecutablePath,
  outputRoot,
  requireDemoCredentials,
  writeJson,
} from "./utils";

type CaptureResult = {
  id: string;
  viewport: "desktop" | "mobile";
  label: string;
  filePath: string;
  route: string;
  status: "captured" | "missing" | "failed";
  note?: string;
};

type CaptureContext = {
  appUrl: string;
  email: string;
  password: string;
  desktopRoot: string;
  mobileRoot: string;
};

const safeTextReplacements = [
  {pattern: /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi, replacement: "Demo Fleet Manager"},
  {pattern: /\b(?:\+?1[-.\s]?)?\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}\b/g, replacement: "555-000-0000"},
  {pattern: /\b[A-HJ-NPR-Z0-9]{17}\b/g, replacement: "VIN••••4321"},
  {pattern: /\b[A-Z]{2,4}-\d{3,4}\b/g, replacement: "UNIT-0104"},
  {pattern: /\b\d{1,5}\s+[A-Za-z0-9.\- ]+(?:Street|St|Road|Rd|Avenue|Ave|Drive|Dr|Lane|Ln|Way|Blvd)\b/gi, replacement: "Demo Fleet Address"},
];

async function applySafetyMask(page: Page) {
  await page.addStyleTag({
    content: `
      [data-truckfixr-mask="true"] {
        filter: blur(8px);
        border-radius: 10px;
      }
    `,
  }).catch(() => {});

  await page.evaluate((replacements) => {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    const nodes: Text[] = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current as Text);
      current = walker.nextNode();
    }

    const markElement = (element: HTMLElement | null) => {
      if (!element) return;
      if (element.dataset.truckfixrMask === "true") return;
      element.dataset.truckfixrMask = "true";
    };

    nodes.forEach((node) => {
      const parent = node.parentElement as HTMLElement | null;
      if (!parent) return;
      const original = node.textContent ?? "";
      let next = original;
      for (const replacement of replacements) {
        next = next.replace(new RegExp(replacement.pattern, "g"), replacement.replacement);
      }
      if (next !== original) {
        node.textContent = next;
        markElement(parent);
      }
    });

    const sensitiveLabels = [
      "email",
      "phone",
      "vin",
      "license plate",
      "licence plate",
      "address",
      "invoice",
      "repair notes",
      "customer",
    ];

    const allElements = Array.from(document.querySelectorAll<HTMLElement>("body *"));
    allElements.forEach((element) => {
      const label = `${element.getAttribute("aria-label") ?? ""} ${element.textContent ?? ""}`.toLowerCase();
      if (sensitiveLabels.some((token) => label.includes(token))) {
        markElement(element);
      }
    });
  }, safeTextReplacements.map((item) => ({pattern: item.pattern.source, replacement: item.replacement})));
}

async function signIn(page: Page, appUrl: string, email: string, password: string) {
  await page.goto(`${appUrl}/auth/email`, {waitUntil: "domcontentloaded"});
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", {name: /sign in/i}).click();
  await page.waitForLoadState("networkidle").catch(() => {});
}

async function capturePage(page: Page, destination: string, fullPage = true) {
  await ensureDir(dirname(destination));
  await applySafetyMask(page);
  await page.screenshot({path: destination, fullPage});
}

async function findHref(page: Page, fragment: string) {
  return page.evaluate((value) => {
    const links = Array.from(document.querySelectorAll<HTMLAnchorElement>("a[href]"));
    return links.find((link) => link.href.includes(value))?.href ?? null;
  }, fragment);
}

async function captureBestEffort(
  page: Page,
  result: Omit<CaptureResult, "status">,
  work: () => Promise<boolean>
) {
  try {
    const ok = await work();
    return {...result, status: ok ? "captured" : "missing"} as CaptureResult;
  } catch (error) {
    return {
      ...result,
      status: "failed",
      note: error instanceof Error ? error.message : String(error),
    } as CaptureResult;
  }
}

async function createDesktopPage(browser: Browser) {
  const page = await browser.newPage({
    viewport: {width: 1440, height: 900},
  });
  await page.emulateMedia({media: "screen"});
  return page;
}

async function createMobilePage(browser: Browser) {
  const page = await browser.newPage({
    viewport: {width: 390, height: 844},
    hasTouch: true,
    isMobile: true,
  });
  await page.emulateMedia({media: "screen"});
  return page;
}

async function runCapture(context: CaptureContext) {
  const browser = await chromium.launch({
    executablePath: getBrowserExecutablePath(),
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-gpu"],
  });

  const results: CaptureResult[] = [];

  try {
    const loginPage = await createDesktopPage(browser);
    await loginPage.goto(`${context.appUrl}/auth/email`, {waitUntil: "domcontentloaded"});
    results.push(
      await captureBestEffort(
        loginPage,
        {
          id: "desktop-login",
          viewport: "desktop",
          label: "Login screen",
          route: "/auth/email",
          filePath: join(context.desktopRoot, "01-login-screen.png"),
        },
        async () => {
          await capturePage(loginPage, join(context.desktopRoot, "01-login-screen.png"));
          return true;
        }
      )
    );
    await signIn(loginPage, context.appUrl, context.email, context.password);

    results.push(
      await captureBestEffort(
        loginPage,
        {
          id: "desktop-main-dashboard",
          viewport: "desktop",
          label: "Main dashboard",
          route: "/manager",
          filePath: join(context.desktopRoot, "02-main-dashboard.png"),
        },
        async () => {
          await loginPage.goto(`${context.appUrl}/manager`, {waitUntil: "domcontentloaded"});
          await loginPage.waitForLoadState("networkidle").catch(() => {});
          await capturePage(loginPage, join(context.desktopRoot, "02-main-dashboard.png"));
          return true;
        }
      )
    );

    results.push(
      await captureBestEffort(
        loginPage,
        {
          id: "desktop-fleet-dashboard",
          viewport: "desktop",
          label: "Fleet dashboard",
          route: "/manager",
          filePath: join(context.desktopRoot, "03-fleet-dashboard.png"),
        },
        async () => {
          await loginPage.getByText("Daily vehicle health", {exact: false}).first().scrollIntoViewIfNeeded().catch(() => {});
          await capturePage(loginPage, join(context.desktopRoot, "03-fleet-dashboard.png"));
          return true;
        }
      )
    );

    results.push(
      await captureBestEffort(
        loginPage,
        {
          id: "desktop-vehicle-list",
          viewport: "desktop",
          label: "Vehicle list",
          route: "/manager",
          filePath: join(context.desktopRoot, "04-vehicle-list.png"),
        },
        async () => {
          await loginPage.getByText("Vehicles in fleet", {exact: false}).first().scrollIntoViewIfNeeded().catch(() => {});
          await capturePage(loginPage, join(context.desktopRoot, "04-vehicle-list.png"));
          return true;
        }
      )
    );

    const truckHref = await findHref(loginPage, "/truck/");
    results.push(
      await captureBestEffort(
        loginPage,
        {
          id: "desktop-vehicle-profile",
          viewport: "desktop",
          label: "Vehicle profile",
          route: truckHref ?? "/truck/:id",
          filePath: join(context.desktopRoot, "05-vehicle-profile.png"),
        },
        async () => {
          if (!truckHref) return false;
          await loginPage.goto(truckHref, {waitUntil: "domcontentloaded"});
          await loginPage.waitForLoadState("networkidle").catch(() => {});
          await capturePage(loginPage, join(context.desktopRoot, "05-vehicle-profile.png"));
          return true;
        }
      )
    );

    results.push(
      await captureBestEffort(
        loginPage,
        {
          id: "desktop-maintenance-history",
          viewport: "desktop",
          label: "Maintenance history",
          route: truckHref ?? "/truck/:id",
          filePath: join(context.desktopRoot, "06-maintenance-history.png"),
        },
        async () => {
          if (!truckHref) return false;
          await loginPage.goto(truckHref, {waitUntil: "domcontentloaded"});
          await loginPage.getByText(/maintenance|history|service/i).first().scrollIntoViewIfNeeded().catch(() => {});
          await capturePage(loginPage, join(context.desktopRoot, "06-maintenance-history.png"));
          return true;
        }
      )
    );

    await loginPage.goto(`${context.appUrl}/manager`, {waitUntil: "domcontentloaded"});
    const defectHref = await findHref(loginPage, "/defect/");
    results.push(
      await captureBestEffort(
        loginPage,
        {
          id: "desktop-open-issues",
          viewport: "desktop",
          label: "Open issues / defects",
          route: defectHref ?? "/defect/:id",
          filePath: join(context.desktopRoot, "07-open-issues-defects.png"),
        },
        async () => {
          if (!defectHref) return false;
          await loginPage.goto(defectHref, {waitUntil: "domcontentloaded"});
          await loginPage.waitForLoadState("networkidle").catch(() => {});
          await capturePage(loginPage, join(context.desktopRoot, "07-open-issues-defects.png"));
          return true;
        }
      )
    );

    results.push(
      await captureBestEffort(
        loginPage,
        {
          id: "desktop-manager-priority",
          viewport: "desktop",
          label: "Manager action / priority view",
          route: "/manager",
          filePath: join(context.desktopRoot, "09-manager-action-priority-view.png"),
        },
        async () => {
          await loginPage.goto(`${context.appUrl}/manager`, {waitUntil: "domcontentloaded"});
          await loginPage.getByText(/priority|action|inspection integrity alerts/i).first().scrollIntoViewIfNeeded().catch(() => {});
          await capturePage(loginPage, join(context.desktopRoot, "09-manager-action-priority-view.png"));
          return true;
        }
      )
    );

    results.push(
      await captureBestEffort(
        loginPage,
        {
          id: "desktop-cta-clean",
          viewport: "desktop",
          label: "CTA dashboard background",
          route: "/manager",
          filePath: join(context.desktopRoot, "10-cta-dashboard-clean.png"),
        },
        async () => {
          await loginPage.goto(`${context.appUrl}/manager`, {waitUntil: "domcontentloaded"});
          await loginPage.evaluate(() => window.scrollTo(0, 0));
          await capturePage(loginPage, join(context.desktopRoot, "10-cta-dashboard-clean.png"), false);
          return true;
        }
      )
    );

    const mobilePage = await createMobilePage(browser);
    await signIn(mobilePage, context.appUrl, context.email, context.password);
    results.push(
      await captureBestEffort(
        mobilePage,
        {
          id: "mobile-driver-dashboard",
          viewport: "mobile",
          label: "Driver dashboard",
          route: "/driver",
          filePath: join(context.mobileRoot, "01-driver-dashboard.png"),
        },
        async () => {
          await mobilePage.goto(`${context.appUrl}/driver`, {waitUntil: "domcontentloaded"});
          await mobilePage.waitForLoadState("networkidle").catch(() => {});
          await capturePage(mobilePage, join(context.mobileRoot, "01-driver-dashboard.png"));
          return true;
        }
      )
    );

    results.push(
      await captureBestEffort(
        mobilePage,
        {
          id: "mobile-vehicle-selection",
          viewport: "mobile",
          label: "Vehicle selection",
          route: "/driver",
          filePath: join(context.mobileRoot, "02-vehicle-selection.png"),
        },
        async () => {
          await mobilePage.goto(`${context.appUrl}/driver`, {waitUntil: "domcontentloaded"});
          await mobilePage.evaluate(() => window.scrollTo(0, 480));
          await capturePage(mobilePage, join(context.mobileRoot, "02-vehicle-selection.png"));
          return true;
        }
      )
    );

    const inspectionHref = await findHref(mobilePage, "/inspection?vehicle=");
    results.push(
      await captureBestEffort(
        mobilePage,
        {
          id: "mobile-inspection",
          viewport: "mobile",
          label: "Digital inspection",
          route: inspectionHref ?? "/inspection?vehicle=:vehicle&fleet=:fleet",
          filePath: join(context.mobileRoot, "03-digital-inspection-screen.png"),
        },
        async () => {
          if (!inspectionHref) return false;
          await mobilePage.goto(inspectionHref, {waitUntil: "domcontentloaded"});
          await mobilePage.waitForLoadState("networkidle").catch(() => {});
          await capturePage(mobilePage, join(context.mobileRoot, "03-digital-inspection-screen.png"));
          return true;
        }
      )
    );

    results.push(
      await captureBestEffort(
        mobilePage,
        {
          id: "mobile-issue-report",
          viewport: "mobile",
          label: "Issue report",
          route: inspectionHref ?? "/inspection?vehicle=:vehicle&fleet=:fleet",
          filePath: join(context.mobileRoot, "04-issue-report-screen.png"),
        },
        async () => {
          if (!inspectionHref) return false;
          await mobilePage.goto(inspectionHref, {waitUntil: "domcontentloaded"});
          const start = mobilePage.getByRole("button", {name: /start today's inspection/i}).first();
          if (await start.count()) {
            await start.click().catch(() => {});
            await mobilePage.waitForTimeout(800);
          }
          const issue = mobilePage.getByRole("button", {name: /^Issue$/i}).first();
          if (await issue.count()) {
            await issue.click().catch(() => {});
          }
          await capturePage(mobilePage, join(context.mobileRoot, "04-issue-report-screen.png"));
          return true;
        }
      )
    );

    const diagnosisHref = await findHref(mobilePage, "/diagnosis?vehicle=");
    results.push(
      await captureBestEffort(
        mobilePage,
        {
          id: "mobile-symptom-entry",
          viewport: "mobile",
          label: "Symptom entry",
          route: diagnosisHref ?? "/diagnosis?vehicle=:vehicle&fleet=:fleet",
          filePath: join(context.mobileRoot, "05-symptom-entry-screen.png"),
        },
        async () => {
          if (!diagnosisHref) return false;
          await mobilePage.goto(diagnosisHref, {waitUntil: "domcontentloaded"});
          await mobilePage.getByLabel("Primary Symptom").fill("ABS warning light stays on after start-up").catch(() => {});
          await mobilePage.getByLabel("Fault Code").fill("C1234").catch(() => {});
          await mobilePage.getByLabel("Driver Notes").fill("Demo safety screening for video capture.").catch(() => {});
          await mobilePage.getByLabel("Operating Conditions").fill("After startup").catch(() => {});
          await capturePage(mobilePage, join(context.mobileRoot, "05-symptom-entry-screen.png"));
          return true;
        }
      )
    );

    results.push(
      await captureBestEffort(
        mobilePage,
        {
          id: "mobile-ai-result",
          viewport: "mobile",
          label: "AI diagnosis / triage result",
          route: diagnosisHref ?? "/diagnosis?vehicle=:vehicle&fleet=:fleet",
          filePath: join(context.mobileRoot, "06-ai-diagnosis-triage-result.png"),
        },
        async () => {
          if (!diagnosisHref) return false;
          await mobilePage.goto(diagnosisHref, {waitUntil: "domcontentloaded"});
          const button = mobilePage.getByRole("button", {name: /generate diagnosis|run diagnosis/i}).first();
          if (await button.count()) {
            await button.click().catch(() => {});
            await mobilePage.waitForTimeout(1800);
          }
          await capturePage(mobilePage, join(context.mobileRoot, "06-ai-diagnosis-triage-result.png"));
          return true;
        }
      )
    );

    results.push(
      await captureBestEffort(
        mobilePage,
        {
          id: "mobile-next-action",
          viewport: "mobile",
          label: "Recommended next action",
          route: diagnosisHref ?? "/diagnosis?vehicle=:vehicle&fleet=:fleet",
          filePath: join(context.mobileRoot, "07-recommended-next-action-screen.png"),
        },
        async () => {
          if (!diagnosisHref) return false;
          await mobilePage.goto(diagnosisHref, {waitUntil: "domcontentloaded"});
          const button = mobilePage.getByRole("button", {name: /generate diagnosis|run diagnosis/i}).first();
          if (await button.count()) {
            await button.click().catch(() => {});
            await mobilePage.waitForTimeout(1800);
          }
          await mobilePage.evaluate(() => window.scrollTo(0, 900));
          await capturePage(mobilePage, join(context.mobileRoot, "07-recommended-next-action-screen.png"));
          return true;
        }
      )
    );

    return results;
  } finally {
    await browser.close();
  }
}

async function main() {
  const appUrl = await assertAppUrl();
  const {email, password} = requireDemoCredentials();
  const desktopRoot = join(assetsRoot, "screenshots", "desktop");
  const mobileRoot = join(assetsRoot, "screenshots", "mobile");
  await ensureDir(desktopRoot);
  await ensureDir(mobileRoot);

  const results = await runCapture({
    appUrl,
    email,
    password,
    desktopRoot,
    mobileRoot,
  });

  const missing = results.filter((item) => item.status !== "captured");
  await writeJson(join(outputRoot, "reports", "screenshot-capture-report.json"), results);
  await writeJson(join(outputRoot, "reports", "missing-screenshots.json"), missing);

  console.log(
    JSON.stringify(
      {
        ok: true,
        captured: results.filter((item) => item.status === "captured").length,
        missing: missing.length,
      },
      null,
      2
    )
  );
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (executedDirectly) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
