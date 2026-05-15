import {writeFile} from "node:fs/promises";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {getCaptionCues, toSrt, toVtt} from "../src/captions";
import {writeJson, ensureDir, outputRoot} from "./utils";
import type {DurationKey} from "../src/types";

const durations: DurationKey[] = ["30", "60", "90"];

export async function generateAllCaptionFiles() {
  const captionsDir = join(outputRoot, "captions");
  await ensureDir(captionsDir);

  const manifest: Record<string, {srt: string; vtt: string; cueCount: number}> = {};

  for (const duration of durations) {
    const cues = getCaptionCues(duration);
    const srtPath = join(captionsDir, `truckfixr-explainer-${duration}.srt`);
    const vttPath = join(captionsDir, `truckfixr-explainer-${duration}.vtt`);

    await writeFile(srtPath, toSrt(cues), "utf8");
    await writeFile(vttPath, toVtt(cues), "utf8");

    manifest[duration] = {
      srt: srtPath,
      vtt: vttPath,
      cueCount: cues.length,
    };
  }

  await writeJson(join(outputRoot, "reports", "caption-report.json"), manifest);
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (executedDirectly) {
  generateAllCaptionFiles().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}
