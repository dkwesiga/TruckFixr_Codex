import "dotenv/config";
import {execFile} from "node:child_process";
import {readFile, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {promisify} from "node:util";
import {ensureDir, outputRoot, writeJson} from "./utils";

const require = createRequire(import.meta.url);
const ffmpegPath: string | null = require("ffmpeg-static");
const execFileAsync = promisify(execFile);

type RenderEntry = {
  duration: "30" | "60" | "90";
  aspect: "landscape" | "vertical";
  outputLocation: string;
};

function getWebTargets(entry: RenderEntry) {
  const dir = join(outputRoot, "web", entry.aspect);
  const base = `truckfixr-explainer-${entry.duration}-${entry.aspect}`;
  return {
    dir,
    mp4: join(dir, `${base}-web.mp4`),
    webm: join(dir, `${base}.webm`),
    poster: join(dir, `${base}-poster.png`),
  };
}

function buildEmbedSnippet(
  primary: {
    mp4: string;
    webm: string;
    poster: string;
    duration: string;
  }
) {
  const mp4Relative = `../web/landscape/${primary.mp4}`;
  const webmRelative = `../web/landscape/${primary.webm}`;
  const posterRelative = `../web/landscape/${primary.poster}`;
  const captionRelative = `../captions/truckfixr-explainer-${primary.duration}.vtt`;

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>TruckFixr video embed</title>
    <style>
      .truckfixr-video-shell { max-width: 1120px; margin: 0 auto; }
      .truckfixr-video-frame { position: relative; width: 100%; aspect-ratio: 16 / 9; overflow: hidden; border-radius: 24px; background: #0b1c30; box-shadow: 0 24px 60px rgba(11, 60, 93, 0.18); }
      .truckfixr-video-frame video { width: 100%; height: 100%; display: block; object-fit: cover; }
      .truckfixr-video-copy { margin-top: 14px; font: 500 16px/1.5 Inter, Arial, sans-serif; color: #425267; }
    </style>
  </head>
  <body>
    <section class="truckfixr-video-shell" aria-labelledby="truckfixr-video-title">
      <h2 id="truckfixr-video-title">TruckFixr Fleet AI explainer video</h2>
      <p id="truckfixr-video-description" class="truckfixr-video-copy">
        Product explainer video showing TruckFixr Fleet AI workflows for inspections, AI triage, manager visibility, and maintenance decision support.
      </p>

      <div class="truckfixr-video-frame">
        <video
          muted
          autoplay
          loop
          playsinline
          preload="metadata"
          poster="${posterRelative}"
          aria-describedby="truckfixr-video-description"
        >
          <source src="${webmRelative}" type="video/webm" />
          <source src="${mp4Relative}" type="video/mp4" />
          <track
            kind="captions"
            src="${captionRelative}"
            srclang="en"
            label="English captions"
            default
          />
        </video>
      </div>

      <div class="truckfixr-video-frame" style="margin-top: 28px;">
        <video
          controls
          playsinline
          preload="none"
          poster="${posterRelative}"
          aria-describedby="truckfixr-video-description"
        >
          <source src="${webmRelative}" type="video/webm" />
          <source src="${mp4Relative}" type="video/mp4" />
          <track
            kind="captions"
            src="${captionRelative}"
            srclang="en"
            label="English captions"
            default
          />
        </video>
      </div>
    </section>
  </body>
</html>
`;
}

async function main() {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide a binary path.");
  }

  const renderReportPath = join(outputRoot, "reports", "render-report.json");
  const renderReport = JSON.parse(
    await readFile(renderReportPath, "utf8")
  ) as RenderEntry[];

  const compressed: Array<Record<string, string>> = [];

  for (const entry of renderReport) {
    const targets = getWebTargets(entry);
    await ensureDir(targets.dir);

    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      entry.outputLocation,
      "-c:v",
      "libx264",
      "-preset",
      "slow",
      "-crf",
      process.env.TRUCKFIXR_WEB_MP4_CRF ?? "24",
      "-movflags",
      "+faststart",
      "-c:a",
      "aac",
      "-b:a",
      "160k",
      targets.mp4,
    ]);

    await execFileAsync(ffmpegPath, [
      "-y",
      "-i",
      entry.outputLocation,
      "-c:v",
      "libvpx-vp9",
      "-b:v",
      "0",
      "-crf",
      process.env.TRUCKFIXR_WEB_WEBM_CRF ?? "33",
      "-c:a",
      "libopus",
      "-b:a",
      "96k",
      targets.webm,
    ]);

    await execFileAsync(ffmpegPath, [
      "-y",
      "-ss",
      process.env.TRUCKFIXR_POSTER_TIME ?? "00:00:05",
      "-i",
      entry.outputLocation,
      "-frames:v",
      "1",
      targets.poster,
    ]);

    compressed.push({
      duration: entry.duration,
      aspect: entry.aspect,
      input: entry.outputLocation,
      mp4: targets.mp4,
      webm: targets.webm,
      poster: targets.poster,
    });
  }

  const landscapePrimary =
    compressed.find((entry) => entry.aspect === "landscape" && entry.duration === "60") ??
    compressed.find((entry) => entry.aspect === "landscape" && entry.duration === "30") ??
    compressed.find((entry) => entry.aspect === "landscape");

  if (!landscapePrimary) {
    throw new Error("No landscape output was available to build the embed snippet.");
  }

  const embedDir = join(outputRoot, "embed");
  await ensureDir(embedDir);
  await writeFile(
    join(embedDir, "truckfixr-video-embed.html"),
    buildEmbedSnippet({
      duration: landscapePrimary.duration,
      mp4: landscapePrimary.mp4.split("\\").pop() ?? landscapePrimary.mp4,
      webm: landscapePrimary.webm.split("\\").pop() ?? landscapePrimary.webm,
      poster: landscapePrimary.poster.split("\\").pop() ?? landscapePrimary.poster,
    }),
    "utf8"
  );

  await writeJson(join(outputRoot, "reports", "compression-report.json"), compressed);
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (executedDirectly) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
