import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {fileExists, outputRoot} from "./utils";

const expectedFiles = [
  "renders/landscape/truckfixr-explainer-30-landscape.mp4",
  "renders/landscape/truckfixr-explainer-60-landscape.mp4",
  "renders/landscape/truckfixr-explainer-90-landscape.mp4",
  "renders/vertical/truckfixr-explainer-30-vertical.mp4",
  "renders/vertical/truckfixr-explainer-60-vertical.mp4",
  "renders/vertical/truckfixr-explainer-90-vertical.mp4",
  "captions/truckfixr-explainer-30.srt",
  "captions/truckfixr-explainer-30.vtt",
  "captions/truckfixr-explainer-60.srt",
  "captions/truckfixr-explainer-60.vtt",
  "captions/truckfixr-explainer-90.srt",
  "captions/truckfixr-explainer-90.vtt",
  "web/landscape/truckfixr-explainer-30-landscape-web.mp4",
  "web/landscape/truckfixr-explainer-30-landscape.webm",
  "web/landscape/truckfixr-explainer-30-landscape-poster.png",
  "web/landscape/truckfixr-explainer-60-landscape-web.mp4",
  "web/landscape/truckfixr-explainer-60-landscape.webm",
  "web/landscape/truckfixr-explainer-60-landscape-poster.png",
  "web/landscape/truckfixr-explainer-90-landscape-web.mp4",
  "web/landscape/truckfixr-explainer-90-landscape.webm",
  "web/landscape/truckfixr-explainer-90-landscape-poster.png",
  "web/vertical/truckfixr-explainer-30-vertical-web.mp4",
  "web/vertical/truckfixr-explainer-30-vertical.webm",
  "web/vertical/truckfixr-explainer-30-vertical-poster.png",
  "web/vertical/truckfixr-explainer-60-vertical-web.mp4",
  "web/vertical/truckfixr-explainer-60-vertical.webm",
  "web/vertical/truckfixr-explainer-60-vertical-poster.png",
  "web/vertical/truckfixr-explainer-90-vertical-web.mp4",
  "web/vertical/truckfixr-explainer-90-vertical.webm",
  "web/vertical/truckfixr-explainer-90-vertical-poster.png",
  "embed/truckfixr-video-embed.html",
];

async function main() {
  const missing: string[] = [];
  for (const relativePath of expectedFiles) {
    const exists = await fileExists(join(outputRoot, relativePath));
    if (!exists) {
      missing.push(relativePath);
    }
  }

  if (missing.length > 0) {
    throw new Error(`Missing expected outputs:\n- ${missing.join("\n- ")}`);
  }

  console.log(
    JSON.stringify(
      {
        ok: true,
        checked: expectedFiles.length,
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
