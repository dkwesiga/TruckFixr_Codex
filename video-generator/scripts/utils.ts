import "dotenv/config";
import {createHash} from "node:crypto";
import {existsSync} from "node:fs";
import {cp, mkdir, readFile, rm, stat, writeFile} from "node:fs/promises";
import {resolve, dirname, join} from "node:path";
import {fileURLToPath} from "node:url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

export const projectRoot = resolve(__dirname, "..");
export const assetsRoot = resolve(projectRoot, "assets");
export const publicRoot = resolve(projectRoot, "public");
export const outputRoot = resolve(projectRoot, "output");

export async function ensureDir(path: string) {
  await mkdir(path, {recursive: true});
}

export async function emptyDir(path: string) {
  await rm(path, {recursive: true, force: true});
  await ensureDir(path);
}

export async function writeJson(path: string, value: unknown) {
  await ensureDir(dirname(path));
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

export function parseArg(name: string, defaultValue?: string) {
  const match = process.argv.find((entry) => entry.startsWith(`--${name}=`));
  if (!match) return defaultValue;
  return match.slice(name.length + 3);
}

export function isLocalUrl(url: string) {
  try {
    const parsed = new URL(url);
    return ["localhost", "127.0.0.1", "::1"].includes(parsed.hostname);
  } catch {
    return false;
  }
}

export async function assertAppUrl() {
  const appUrl = process.env.TRUCKFIXR_APP_URL?.trim();
  if (!appUrl) {
    throw new Error(
      "TRUCKFIXR_APP_URL is required. Add it to video-generator/.env before capturing screenshots."
    );
  }

  try {
    const response = await fetch(appUrl, {method: "GET"});
    if (!response.ok && response.status >= 500) {
      throw new Error(`Received ${response.status} from ${appUrl}`);
    }
  } catch (error) {
    if (isLocalUrl(appUrl)) {
      throw new Error(
        `Could not reach ${appUrl}. Start the TruckFixr app first, then rerun npm run capture:screenshots.`
      );
    }

    throw new Error(
      `Could not reach TRUCKFIXR_APP_URL (${appUrl}). ${error instanceof Error ? error.message : String(error)}`
    );
  }

  return appUrl.replace(/\/+$/, "");
}

export function requireDemoCredentials() {
  const email = process.env.TRUCKFIXR_DEMO_EMAIL?.trim();
  const password = process.env.TRUCKFIXR_DEMO_PASSWORD?.trim();

  if (!email || !password) {
    throw new Error(
      "TRUCKFIXR_DEMO_EMAIL and TRUCKFIXR_DEMO_PASSWORD are required for live screenshot capture."
    );
  }

  return {email, password};
}

export function getBrowserExecutablePath() {
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

export async function syncStaticAssets() {
  const pairs = [
    [resolve(assetsRoot, "brand"), resolve(publicRoot, "brand")],
    [resolve(assetsRoot, "screenshots"), resolve(publicRoot, "screenshots")],
    [resolve(assetsRoot, "voiceover"), resolve(publicRoot, "voiceover")],
    [resolve(assetsRoot, "music"), resolve(publicRoot, "music")],
  ] as const;

  for (const [source, target] of pairs) {
    await rm(target, {recursive: true, force: true});
    if (existsSync(source)) {
      await ensureDir(dirname(target));
      await cp(source, target, {recursive: true});
    }
  }
}

export function resolveStaticAudio(duration: "30" | "60" | "90") {
  const voiceoverRelative = `voiceover/truckfixr-explainer-${duration}.mp3`;
  const voiceoverAbsolute = resolve(publicRoot, voiceoverRelative);
  const musicRelative = "music/background.mp3";
  const musicAbsolute = resolve(publicRoot, musicRelative);

  return {
    voiceoverSrc: existsSync(voiceoverAbsolute) ? voiceoverRelative : null,
    musicSrc: existsSync(musicAbsolute) ? musicRelative : null,
  };
}

export async function hashFile(path: string) {
  const buffer = await readFile(path);
  return createHash("sha1").update(buffer).digest("hex");
}

export async function fileExists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}
