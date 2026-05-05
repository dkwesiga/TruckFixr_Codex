import "dotenv/config";
import { chromium, type Page } from "playwright-core";
import { createRequire } from "node:module";
import { mkdir, rm, writeFile, cp, readdir } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { pathToFileURL } from "node:url";
import {
  DEMO_FLEET_SEED,
  assertSafeDemoMode,
  getDemoBaseUrl,
  resolveDemoCaptureEnvironment,
} from "../../shared/demoAssets";
import {
  ensureDemoWorkflowReady,
  getOutputRoot,
  getPublicDemoRoot,
  seedDemoData,
  type DemoManifest,
} from "./demo-workflow";

const require = createRequire(import.meta.url);
const archiver = require("archiver");
const ffmpegPath: string | null = require("ffmpeg-static");

const execFileAsync = promisify(execFile);
type CaptureStatus = "captured" | "skipped" | "failed";

type MetadataEntry = {
  screenName: string;
  route: string;
  viewport: string;
  filePath: string;
  capturedAt: string;
  userRole: string;
  environment: string;
  status: CaptureStatus;
  errorMessage?: string;
};

type CaptureContext = {
  baseUrl: string;
  outputRoot: string;
  environment: string;
  manifest: DemoManifest;
};

function screenshotPath(outputRoot: string, bucket: "desktop" | "mobile" | "extra-routes", fileName: string) {
  return join(outputRoot, bucket, fileName);
}

function normalizeText(value: string) {
  return value.toLowerCase().replace(/\s+/g, " ").trim();
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
    "/usr/bin/google-chrome",
    "/usr/bin/google-chrome-stable",
    "/usr/bin/chromium",
    "/usr/bin/chromium-browser",
    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome",
    "/Applications/Microsoft Edge.app/Contents/MacOS/Microsoft Edge",
  ].filter(Boolean) as string[];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }

  throw new Error(
    "No Chrome or Chromium executable was found. Set CHROME_PATH, GOOGLE_CHROME_PATH, or PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH."
  );
}

async function ensurePlaceholderImage(path: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="900" viewBox="0 0 1200 900">
    <rect width="1200" height="900" fill="#f8fafc"/>
    <rect x="70" y="70" width="1060" height="760" rx="40" fill="#ffffff" stroke="#cbd5e1" stroke-width="8"/>
    <text x="600" y="410" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="56" font-weight="700" fill="#0f172a">TruckFixr demo image</text>
    <text x="600" y="480" text-anchor="middle" font-family="Arial, Helvetica, sans-serif" font-size="28" fill="#475569">Screenshot capture proof</text>
  </svg>`;
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, svg, "utf8");
}

async function launchBrowser() {
  return chromium.launch({
    executablePath: getBrowserExecutablePath(),
    headless: true,
    args: ["--disable-dev-shm-usage", "--disable-gpu"],
  });
}

async function signIn(page: Page, baseUrl: string, email: string) {
  await page.goto(`${baseUrl}/auth/email`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(DEMO_FLEET_SEED.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(800);
}

async function maybeWaitForText(page: Page, text: string) {
  try {
    await page.getByText(text, { exact: false }).first().waitFor({ state: "visible", timeout: 8000 });
  } catch {
    // ignore; screenshots can still be captured if the page is loaded
  }
}

async function captureShot(
  page: Page,
  context: CaptureContext,
  bucket: "desktop" | "mobile" | "extra-routes",
  screenName: string,
  route: string,
  fileName: string,
  userRole: string,
  options: {
    action?: (page: Page) => Promise<void>;
    waitForText?: string;
    fullPage?: boolean;
  } = {}
): Promise<MetadataEntry> {
  const outputPath = screenshotPath(context.outputRoot, bucket, fileName);
  const entryBase = {
    screenName,
    route,
    viewport: bucket === "mobile" ? "390x844" : "1440x900",
    filePath: outputPath,
    userRole,
    environment: context.environment,
  };

  try {
    await page.goto(route.startsWith("http") ? route : `${context.baseUrl}${route}`, {
      waitUntil: "domcontentloaded",
    });
    await page.waitForLoadState("networkidle").catch(() => {});
    await page.waitForTimeout(700);
    if (options.waitForText) {
      await maybeWaitForText(page, options.waitForText);
    }
    if (options.action) {
      await options.action(page);
      await page.waitForTimeout(700);
    }
    await page.screenshot({ path: outputPath, fullPage: options.fullPage ?? true });
    return { ...entryBase, capturedAt: new Date().toISOString(), status: "captured" };
  } catch (error) {
    return {
      ...entryBase,
      capturedAt: new Date().toISOString(),
      status: "failed",
      errorMessage: error instanceof Error ? error.message : String(error),
    };
  }
}

async function createGalleryHtml(context: CaptureContext, metadata: MetadataEntry[]) {
  const rows = metadata
    .map((entry) => {
      const relative = entry.filePath
        .replace(context.outputRoot + "\\", "")
        .replace(context.outputRoot + "/", "")
        .replace(/\\/g, "/");
      const videoRelative = "truckfixr-demo-video.mp4";
      const captionsRelative = "captions.srt";
      const zipRelative = "truckfixr-demo-assets.zip";
      return `
        <article class="card">
          <h2>${entry.screenName}</h2>
          <p><strong>Environment:</strong> ${entry.environment}</p>
          <p><strong>Viewport:</strong> ${entry.viewport}</p>
          <p><strong>Route:</strong> <code>${entry.route}</code></p>
          <p><strong>Status:</strong> ${entry.status}</p>
          ${entry.errorMessage ? `<p class="error">${entry.errorMessage}</p>` : ""}
          <a href="${relative}" target="_blank" rel="noreferrer">
            <img src="${relative}" alt="${entry.screenName}" />
          </a>
          <div class="links">
            <a href="${relative}" target="_blank" rel="noreferrer">Open PNG</a>
            <a href="${videoRelative}" target="_blank" rel="noreferrer">Video</a>
            <a href="${captionsRelative}" target="_blank" rel="noreferrer">Captions</a>
            <a href="${zipRelative}" target="_blank" rel="noreferrer">ZIP</a>
          </div>
          <p class="muted">${entry.capturedAt}</p>
        </article>
      `;
    })
    .join("\n");

  const html = `<!doctype html>
  <html lang="en">
    <head>
      <meta charset="utf-8" />
      <meta name="viewport" content="width=device-width, initial-scale=1" />
      <title>TruckFixr Demo Assets</title>
      <style>
        :root { color-scheme: light; }
        body { font-family: Inter, Arial, sans-serif; margin: 0; background: #f6f8fc; color: #0f172a; }
        header { background: #0b3c5d; color: white; padding: 32px 24px; }
        main { max-width: 1400px; margin: 0 auto; padding: 24px; }
        .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(320px, 1fr)); gap: 20px; }
        .card { background: white; border: 1px solid #d7e0eb; border-radius: 20px; padding: 16px; box-shadow: 0 8px 24px rgba(15, 23, 42, 0.06); }
        .card img { width: 100%; aspect-ratio: 16 / 10; object-fit: cover; border-radius: 14px; border: 1px solid #e2e8f0; margin-top: 8px; }
        .links { display: flex; flex-wrap: wrap; gap: 12px; margin-top: 12px; }
        .links a { color: #e32636; text-decoration: none; font-weight: 600; }
        .muted { color: #64748b; font-size: 12px; }
        .error { color: #b91c1c; font-weight: 600; }
        code { background: #eef2ff; padding: 2px 6px; border-radius: 999px; }
      </style>
    </head>
    <body>
      <header>
        <h1>TruckFixr Demo Assets</h1>
        <p>Environment: ${context.environment} | Captured: ${context.manifest.capturedAt}</p>
      </header>
      <main>
        <section>
          <h2>Approved presentation captures</h2>
          <div class="grid">${rows}</div>
        </section>
      </main>
    </body>
  </html>`;

  await writeFile(join(context.outputRoot, "screenshot-gallery.html"), html, "utf8");
}

async function createCaptions(context: CaptureContext) {
  const captions = [
    "TruckFixr Fleet AI helps fleets reduce preventable downtime.",
    "Brampton Transit Inc. manages 55 vehicles across three locations.",
    "The dashboard highlights vehicles needing attention before breakdowns happen.",
    "Drivers complete daily inspections from mobile or desktop.",
    "Critical defects are flagged immediately for maintenance review.",
    "TADIS analyzes symptoms, inspection data, and vehicle history.",
    "The system recommends whether to monitor, repair, or remove from service.",
    "Managers can see maintenance history and compliance risk in one place.",
    "TruckFixr turns daily fleet data into actionable maintenance decisions.",
  ];

  const srt = captions
    .map((text, index) => {
      const startSeconds = index * 4;
      const endSeconds = startSeconds + 3;
      const format = (seconds: number) => {
        const hours = Math.floor(seconds / 3600);
        const minutes = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(secs).padStart(2, "0")},000`;
      };
      return `${index + 1}\n${format(startSeconds)} --> ${format(endSeconds)}\n${text}\n`;
    })
    .join("\n");

  await writeFile(join(context.outputRoot, "captions.srt"), srt, "utf8");
}

async function createDemoScript(context: CaptureContext) {
  const content = `TruckFixr Fleet AI demo capture script

Environment: ${context.environment}
Fleet: ${context.manifest.fleet.name}
Users:
- Owner/Admin: ${DEMO_FLEET_SEED.ownerEmail}
- Fleet Manager: ${DEMO_FLEET_SEED.managerEmail}
- Driver: ${DEMO_FLEET_SEED.driverEmail}

Flow:
1. Landing page
2. Login
3. Fleet dashboard
4. Vehicle profile
5. Daily inspection issue
6. AI diagnostic result
7. Recommended action / triage
8. Maintenance history
9. Compliance dashboard
10. Pricing / subscription
`;
  await writeFile(join(context.outputRoot, "demo-script.md"), content, "utf8");
}

async function createVideoFromRecording(recordingDir: string, outputMp4: string) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide a binary path.");
  }

  const entries = (await readdir(recordingDir)).filter((file) => file.endsWith(".webm"));
  if (entries.length === 0) {
    throw new Error("No Playwright video recording was created.");
  }

  const input = join(recordingDir, entries[0]);
  await execFileAsync(ffmpegPath, [
    "-y",
    "-i",
    input,
    "-c:v",
    "libx264",
    "-pix_fmt",
    "yuv420p",
    "-movflags",
    "+faststart",
    outputMp4,
  ]);
}

async function zipDirectory(sourceDir: string, outputZip: string) {
  await new Promise<void>((resolve, reject) => {
    const output = require("node:fs").createWriteStream(outputZip);
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.directory(sourceDir, false, (entry: { name: string }) => {
      if (normalizeText(entry.name) === normalizeText("truckfixr-demo-assets.zip")) {
        return false;
      }
      return entry;
    });
    archive.finalize();
  });
}

async function copyOutputsToPublic(outputRoot: string) {
  const publicRoot = getPublicDemoRoot();
  await rm(publicRoot, { recursive: true, force: true });
  await mkdir(dirname(publicRoot), { recursive: true });
  await cp(outputRoot, publicRoot, { recursive: true });
}

async function runScreenshotCapture(manifest: DemoManifest, context: CaptureContext) {
  const browser = await launchBrowser();
  const metadata: MetadataEntry[] = [];

  const publicPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await publicPage.emulateMedia({ media: "screen" });
  metadata.push(
    await captureShot(publicPage, context, "desktop", "Landing page", "/", "01-landing-page.png", "public")
  );
  metadata.push(
    await captureShot(publicPage, context, "desktop", "Login", "/auth/email", "02-login.png", "public")
  );
  metadata.push(
    await captureShot(publicPage, context, "desktop", "Signup", "/signup", "03-signup.png", "public")
  );
  metadata.push(
    await captureShot(publicPage, context, "desktop", "Pricing", "/pricing", "04-pricing.png", "public")
  );
  await publicPage.close();

  const ownerPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await ownerPage.emulateMedia({ media: "screen" });
  await signIn(ownerPage, context.baseUrl, DEMO_FLEET_SEED.ownerEmail);

  metadata.push(
    await captureShot(ownerPage, context, "desktop", "Owner dashboard", "/manager", "05-owner-dashboard.png", "owner", {
      waitForText: "Fleet operations center",
    })
  );
  metadata.push(
    await captureShot(ownerPage, context, "desktop", "Fleet health overview", "/manager", "06-fleet-health-overview.png", "owner", {
      action: async (page) => {
        await page.getByText("Daily vehicle health", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
      },
    })
  );
  metadata.push(
    await captureShot(ownerPage, context, "desktop", "Vehicle list", "/manager", "07-vehicle-list.png", "owner", {
      action: async (page) => {
        await page.getByText("Vehicles in fleet", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
      },
    })
  );
  metadata.push(
    await captureShot(ownerPage, context, "desktop", "Add vehicle", "/manager", "08-add-vehicle.png", "owner", {
      action: async (page) => {
        const button = page.getByRole("button", { name: /add vehicle/i }).first();
        if (await button.count()) {
          await button.click().catch(() => {});
          await page.waitForTimeout(900);
        }
      },
    })
  );
  metadata.push(
    await captureShot(
      ownerPage,
      context,
      "desktop",
      "Vehicle profile",
      `/truck/${manifest.vehicles.primaryPoweredVehicleId}`,
      "09-vehicle-profile.png",
      "owner"
    )
  );
  metadata.push(
    await captureShot(ownerPage, context, "desktop", "Driver assignment", "/manager", "10-driver-assignment.png", "owner", {
      action: async (page) => {
        const target = page.getByRole("button", { name: /assign driver|vehicle access/i }).first();
        if (await target.count()) {
          await target.click().catch(() => {});
          await page.waitForTimeout(1000);
        }
      },
    })
  );
  metadata.push(
    await captureShot(ownerPage, context, "desktop", "Maintenance history", `/truck/${manifest.vehicles.maintenanceHistoryVehicleId}`, "16-maintenance-history.png", "owner")
  );
  metadata.push(
    await captureShot(ownerPage, context, "desktop", "Compliance dashboard", "/manager", "17-compliance-dashboard.png", "owner", {
      action: async (page) => {
        await page.getByText("Inspection integrity alerts", { exact: false }).first().scrollIntoViewIfNeeded().catch(() => {});
      },
    })
  );
  metadata.push(
    await captureShot(ownerPage, context, "desktop", "Settings / subscription", "/profile", "18-settings-subscription.png", "owner")
  );
  await ownerPage.close();

  const driverPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await driverPage.emulateMedia({ media: "screen" });
  await signIn(driverPage, context.baseUrl, DEMO_FLEET_SEED.driverEmail);
  metadata.push(
    await captureShot(
      driverPage,
      context,
      "desktop",
      "Daily inspection",
      `/inspection?vehicle=${encodeURIComponent(manifest.vehicles.primaryPoweredVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&mode=daily`,
      "11-daily-inspection.png",
      "driver",
      {
        action: async (page) => {
          const start = page.getByRole("button", { name: /start today's inspection/i }).first();
          if (await start.count()) {
            await start.click().catch(() => {});
            await page.waitForTimeout(1000);
          }
        },
      }
    )
  );
  metadata.push(
    await captureShot(
      driverPage,
      context,
      "desktop",
      "Defect flagged / inspection issue",
      `/defect/${manifest.defects.absDefectId}`,
      "12-defect-flagged.png",
      "driver"
    )
  );
  metadata.push(
    await captureShot(
      driverPage,
      context,
      "desktop",
      "AI diagnostic intake",
      `/diagnosis?vehicle=${encodeURIComponent(manifest.vehicles.primaryPoweredVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&label=${encodeURIComponent("Unit BRM-001")}&vin=${encodeURIComponent("1HGBH41JXMN000001")}&demoCase=abs_warning`,
      "13-ai-diagnostic-intake.png",
      "driver",
      {
        action: async (page) => {
          await page.getByLabel("Primary Symptom").fill("ABS warning light stays on after start-up");
          await page.getByLabel("Fault Code").fill("C1234");
          await page.getByLabel("Driver Notes").fill("Demo intake for the presentation deck.");
          await page.getByLabel("Operating Conditions").fill("After start-up");
        },
      }
    )
  );
  metadata.push(
    await captureShot(
      driverPage,
      context,
      "desktop",
      "AI diagnostic result",
      `/diagnosis?vehicle=${encodeURIComponent(manifest.vehicles.primaryPoweredVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&label=${encodeURIComponent("Unit BRM-001")}&vin=${encodeURIComponent("1HGBH41JXMN000001")}&demoCase=abs_warning`,
      "14-ai-diagnostic-result.png",
      "driver",
      {
        action: async (page) => {
          const button = page.getByRole("button", { name: /generate diagnosis|run diagnosis/i }).first();
          if (await button.count()) {
            await button.click().catch(() => {});
            await page.waitForTimeout(1800);
          }
        },
      }
    )
  );
  metadata.push(
    await captureShot(
      driverPage,
      context,
      "desktop",
      "Recommended action / triage",
      `/diagnosis?vehicle=${encodeURIComponent(manifest.vehicles.airLeakVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&label=${encodeURIComponent("Unit BRM-003")}&vin=${encodeURIComponent("1HGBH41JXMN000003")}&demoCase=air_leak`,
      "15-recommended-action-triage.png",
      "driver",
      {
        action: async (page) => {
          const button = page.getByRole("button", { name: /generate diagnosis|run diagnosis/i }).first();
          if (await button.count()) {
            await button.click().catch(() => {});
            await page.waitForTimeout(1800);
          }
        },
      }
    )
  );
  await driverPage.close();

  const extraPage = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  await extraPage.emulateMedia({ media: "screen" });
  metadata.push(
    await captureShot(extraPage, context, "extra-routes", "Onboarding", "/onboarding", "01-onboarding.png", "public")
  );
  metadata.push(
    await captureShot(extraPage, context, "extra-routes", "Admin billing", "/admin/billing", "02-admin-billing.png", "owner")
  );
  await extraPage.close();

  await browser.close();

  return metadata;
}

async function runMobileCapture(manifest: DemoManifest, context: CaptureContext) {
  const browser = await launchBrowser();
  const metadata: MetadataEntry[] = [];
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    hasTouch: true,
    isMobile: true,
  });
  await page.emulateMedia({ media: "screen" });
  await signIn(page, context.baseUrl, DEMO_FLEET_SEED.driverEmail);

  metadata.push(
    await captureShot(page, context, "mobile", "Driver login", "/auth/email", "01-driver-login.png", "driver", {
      action: async (mobilePage) => {
        await mobilePage.goto(`${context.baseUrl}/auth/email`, { waitUntil: "domcontentloaded" });
        await mobilePage.getByLabel("Email").fill(DEMO_FLEET_SEED.driverEmail);
        await mobilePage.getByLabel("Password").fill(DEMO_FLEET_SEED.password);
      },
    })
  );
  metadata.push(
    await captureShot(page, context, "mobile", "Assigned vehicle", "/driver", "02-assigned-vehicle.png", "driver")
  );
  metadata.push(
    await captureShot(
      page,
      context,
      "mobile",
      "Daily inspection",
      `/inspection?vehicle=${encodeURIComponent(manifest.vehicles.primaryPoweredVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&mode=daily`,
      "03-daily-inspection.png",
      "driver",
      {
        action: async (mobilePage) => {
          const start = mobilePage.getByRole("button", { name: /start today's inspection/i }).first();
          if (await start.count()) {
            await start.click().catch(() => {});
            await mobilePage.waitForTimeout(1000);
          }
        },
      }
    )
  );

  const tempFile = join(context.outputRoot, "_tmp", "demo-proof.svg");
  await ensurePlaceholderImage(tempFile);

  metadata.push(
    await captureShot(
      page,
      context,
      "mobile",
      "Defect reporting",
      `/inspection?vehicle=${encodeURIComponent(manifest.vehicles.primaryPoweredVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&mode=daily`,
      "04-defect-reporting.png",
      "driver",
      {
        action: async (mobilePage) => {
          const start = mobilePage.getByRole("button", { name: /start today's inspection/i }).first();
          if (await start.count()) {
            await start.click().catch(() => {});
            await mobilePage.waitForTimeout(1000);
          }
          const issueButton = mobilePage.getByRole("button", { name: /^Issue$/i }).first();
          if (await issueButton.count()) {
            await issueButton.click().catch(() => {});
            await mobilePage.waitForTimeout(400);
          }
          const firstTextArea = mobilePage.getByPlaceholder("Describe the defect").first();
          if (await firstTextArea.count()) {
            await firstTextArea.fill("Right front tire sidewall wear noticed during the demo walkaround.");
          }
          const severity = mobilePage.locator("select").first();
          if (await severity.count()) {
            await severity.selectOption("moderate").catch(() => {});
          }
          const fileInputs = mobilePage.locator('input[type="file"]');
          if (await fileInputs.count()) {
            await fileInputs.first().setInputFiles(tempFile).catch(() => {});
          }
        },
      }
    )
  );
  metadata.push(
    await captureShot(
      page,
      context,
      "mobile",
      "AI diagnostic intake",
      `/diagnosis?vehicle=${encodeURIComponent(manifest.vehicles.airLeakVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&label=${encodeURIComponent("Unit BRM-003")}&vin=${encodeURIComponent("1HGBH41JXMN000003")}&demoCase=air_leak`,
      "05-ai-diagnostic-intake.png",
      "driver",
      {
        action: async (mobilePage) => {
          await mobilePage.getByLabel("Primary Symptom").fill("Air pressure drops too quickly after shutdown");
          await mobilePage.getByLabel("Fault Code").fill("B1000");
          await mobilePage.getByLabel("Driver Notes").fill("Demo safety alert.");
          await mobilePage.getByLabel("Operating Conditions").fill("After shutdown");
        },
      }
    )
  );
  metadata.push(
    await captureShot(
      page,
      context,
      "mobile",
      "Safety warning / stop-driving alert",
      `/diagnosis?vehicle=${encodeURIComponent(manifest.vehicles.airLeakVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&label=${encodeURIComponent("Unit BRM-003")}&vin=${encodeURIComponent("1HGBH41JXMN000003")}&demoCase=air_leak`,
      "06-safety-warning.png",
      "driver",
      {
        action: async (mobilePage) => {
          const button = mobilePage.getByRole("button", { name: /generate diagnosis|run diagnosis/i }).first();
          if (await button.count()) {
            await button.click().catch(() => {});
            await mobilePage.waitForTimeout(1800);
          }
        },
      }
    )
  );
  metadata.push(
    await captureShot(
      page,
      context,
      "mobile",
      "Diagnostic result summary",
      `/diagnosis?vehicle=${encodeURIComponent(manifest.vehicles.defVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&label=${encodeURIComponent("Unit BRM-002")}&vin=${encodeURIComponent("1HGBH41JXMN000002")}&demoCase=def_derate`,
      "07-diagnostic-result-summary.png",
      "driver",
      {
        action: async (mobilePage) => {
          const button = mobilePage.getByRole("button", { name: /generate diagnosis|run diagnosis/i }).first();
          if (await button.count()) {
            await button.click().catch(() => {});
            await mobilePage.waitForTimeout(1800);
          }
        },
      }
    )
  );

  await browser.close();
  return metadata;
}

async function buildVideo(manifest: DemoManifest, context: CaptureContext) {
  const videoDir = join(context.outputRoot, "_video");
  await rm(videoDir, { recursive: true, force: true });
  await mkdir(videoDir, { recursive: true });

  const browser = await launchBrowser();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 900 },
    recordVideo: {
      dir: videoDir,
      size: { width: 1440, height: 900 },
    },
  });
  await page.emulateMedia({ media: "screen" });

  await page.goto(`${context.baseUrl}/`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1800);
  await page.goto(`${context.baseUrl}/auth/email`, { waitUntil: "domcontentloaded" });
  await page.getByLabel("Email").fill(DEMO_FLEET_SEED.ownerEmail);
  await page.getByLabel("Password").fill(DEMO_FLEET_SEED.password);
  await page.getByRole("button", { name: /sign in/i }).click();
  await page.waitForLoadState("networkidle").catch(() => {});
  await page.waitForTimeout(1500);
  await page.goto(`${context.baseUrl}/manager`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.goto(`${context.baseUrl}/truck/${manifest.vehicles.primaryPoweredVehicleId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.goto(
    `${context.baseUrl}/inspection?vehicle=${encodeURIComponent(manifest.vehicles.primaryPoweredVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&mode=daily`,
    { waitUntil: "domcontentloaded" }
  );
  await page.getByRole("button", { name: /start today's inspection/i }).click().catch(() => {});
  await page.waitForTimeout(1500);
  await page.goto(
    `${context.baseUrl}/diagnosis?vehicle=${encodeURIComponent(manifest.vehicles.primaryPoweredVehicleId)}&fleet=${encodeURIComponent(String(manifest.fleet.id))}&label=${encodeURIComponent("Unit BRM-001")}&vin=${encodeURIComponent("1HGBH41JXMN000001")}&demoCase=abs_warning`,
    { waitUntil: "domcontentloaded" }
  );
  await page.getByRole("button", { name: /generate diagnosis|run diagnosis/i }).click().catch(() => {});
  await page.waitForTimeout(2200);
  await page.goto(`${context.baseUrl}/truck/${manifest.vehicles.maintenanceHistoryVehicleId}`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.goto(`${context.baseUrl}/manager`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1200);
  await page.goto(`${context.baseUrl}/pricing`, { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(1500);

  const video = page.video();
  await page.close();
  await browser.close();

  if (!video) {
    throw new Error("Playwright video capture did not produce a recording.");
  }

  const mp4Path = join(context.outputRoot, "truckfixr-demo-video.mp4");
  await createVideoFromRecording(videoDir, mp4Path);
}

async function writeMetadata(context: CaptureContext, entries: MetadataEntry[]) {
  await writeFile(
    join(context.outputRoot, "demo-metadata.json"),
    `${JSON.stringify(
      {
        capturedAt: context.manifest.capturedAt,
        environment: context.environment,
        fleet: context.manifest.fleet,
        entries,
      },
      null,
      2
    )}\n`,
    "utf8"
  );
}

async function writeCaptions(context: CaptureContext) {
  const captions = [
    "TruckFixr Fleet AI helps fleets reduce preventable downtime.",
    "Brampton Transit Inc. manages 55 vehicles across three locations.",
    "The dashboard highlights vehicles needing attention before breakdowns happen.",
    "Drivers complete daily inspections from mobile or desktop.",
    "Critical defects are flagged immediately for maintenance review.",
    "TADIS analyzes symptoms, inspection data, and vehicle history.",
    "The system recommends whether to monitor, repair, or remove from service.",
    "Managers can see maintenance history and compliance risk in one place.",
    "TruckFixr turns daily fleet data into actionable maintenance decisions.",
  ];

  const srt = captions
    .map((caption, index) => {
      const start = index * 4;
      const end = start + 3;
      const toTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = seconds % 60;
        return `${String(hrs).padStart(2, "0")}:${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")},000`;
      };
      return `${index + 1}\n${toTime(start)} --> ${toTime(end)}\n${caption}\n`;
    })
    .join("\n");

  await writeFile(join(context.outputRoot, "captions.srt"), srt, "utf8");
}

async function writeDemoScript(context: CaptureContext) {
  await writeFile(
    join(context.outputRoot, "demo-script.md"),
    `# TruckFixr Fleet AI Demo Script

Environment: ${context.environment}
Fleet: ${context.manifest.fleet.name}

1. Landing page
2. Login
3. Fleet dashboard
4. Vehicle profile
5. Daily inspection issue
6. AI diagnostic result
7. Recommended action / triage
8. Maintenance history
9. Compliance dashboard
10. Pricing / subscription
`,
    "utf8"
  );
}

async function zipOutputBundle(outputRoot: string) {
  await new Promise<void>((resolve, reject) => {
    const output = require("node:fs").createWriteStream(join(outputRoot, "truckfixr-demo-assets.zip"));
    const archive = archiver("zip", { zlib: { level: 9 } });
    output.on("close", () => resolve());
    output.on("error", reject);
    archive.on("error", reject);
    archive.pipe(output);
    archive.glob("**/*", {
      cwd: outputRoot,
      dot: true,
      ignore: ["truckfixr-demo-assets.zip"],
    });
    archive.finalize();
  });
}

async function main() {
  const mode = process.argv.includes("--video")
    ? "video"
    : process.argv.includes("--screenshots")
      ? "screenshots"
      : "all";

  assertSafeDemoMode();
  await ensureDemoWorkflowReady();
  const manifest = await seedDemoData();
  const environment = resolveDemoCaptureEnvironment();
  const outputRoot = getOutputRoot();
  const baseUrl = getDemoBaseUrl();
  const placeholderImagePath = join(outputRoot, "_tmp", "demo-placeholder.svg");
  await ensurePlaceholderImage(placeholderImagePath);

  const context: CaptureContext = {
    baseUrl,
    outputRoot,
    environment,
    manifest,
  };

  const metadata: MetadataEntry[] = [];
  if (mode === "screenshots" || mode === "all") {
    metadata.push(...(await runScreenshotCapture(manifest, context)));
    metadata.push(...(await runMobileCapture(manifest, context)));
    await writeMetadata(context, metadata);
    await createGalleryHtml(context, metadata);
    await writeCaptions(context);
    await writeDemoScript(context);
  }

  if (mode === "video" || mode === "all") {
    await writeCaptions(context);
    await writeDemoScript(context);
    await buildVideo(manifest, context);
  }

  await zipOutputBundle(outputRoot);
  await copyOutputsToPublic(outputRoot);

  console.log(
    JSON.stringify(
      {
        ok: true,
        mode,
        environment,
        outputRoot,
        publicRoot: getPublicDemoRoot(),
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
  void main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
