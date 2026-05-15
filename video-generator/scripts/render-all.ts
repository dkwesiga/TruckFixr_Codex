import "dotenv/config";
import {bundle} from "@remotion/bundler";
import {getCompositions, renderMedia} from "@remotion/renderer";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {generateAllCaptionFiles} from "./generate-captions";
import {getCompositionId} from "../src/script";
import {ensureDir, outputRoot, parseArg, projectRoot, resolveStaticAudio, syncStaticAssets, writeJson} from "./utils";
import type {AspectRatio, AudioProfile, DurationKey} from "../src/types";

const durations: DurationKey[] = ["30", "60", "90"];
const aspects: AspectRatio[] = ["landscape", "vertical"];

function resolveRequestedDurations() {
  const requested = parseArg("duration", "all");
  return requested === "all" ? durations : durations.filter((entry) => entry === requested);
}

function resolveRequestedAspects() {
  const requested = parseArg("aspect", "all");
  return requested === "all" ? aspects : aspects.filter((entry) => entry === requested);
}

function resolveAudioProfile(
  duration: DurationKey,
  preferred?: string
): {audioProfile: AudioProfile; voiceoverSrc: string | null; musicSrc: string | null} {
  const {voiceoverSrc, musicSrc} = resolveStaticAudio(duration);
  if (preferred === "voiceover" || preferred === "autoplay" || preferred === "silent") {
    return {audioProfile: preferred, voiceoverSrc, musicSrc};
  }

  if (voiceoverSrc) {
    return {audioProfile: "voiceover", voiceoverSrc, musicSrc};
  }

  if (musicSrc) {
    return {audioProfile: "autoplay", voiceoverSrc: null, musicSrc};
  }

  return {audioProfile: "silent", voiceoverSrc: null, musicSrc: null};
}

async function main() {
  await syncStaticAssets();
  await generateAllCaptionFiles();

  const renderRoot = join(outputRoot, "renders");
  await ensureDir(renderRoot);

  const preferredAudio = parseArg("audio-profile");
  const bundleLocation = await bundle({
    entryPoint: resolve(projectRoot, "src", "index.ts"),
  });

  const report: Array<Record<string, unknown>> = [];

  for (const duration of resolveRequestedDurations()) {
    for (const aspect of resolveRequestedAspects()) {
      const audio = resolveAudioProfile(duration, preferredAudio);
      const compositionId = getCompositionId(duration, aspect);
      const inputProps = {
        aspect,
        audioProfile: audio.audioProfile,
        voiceoverSrc: audio.voiceoverSrc,
        musicSrc: audio.musicSrc,
        showCaptions: true,
      };

      const compositions = await getCompositions(bundleLocation, {inputProps});
      const composition = compositions.find((entry) => entry.id === compositionId);
      if (!composition) {
        throw new Error(`Composition ${compositionId} was not found.`);
      }

      const targetDir = join(renderRoot, aspect);
      await ensureDir(targetDir);
      const outputLocation = join(
        targetDir,
        `truckfixr-explainer-${duration}-${aspect}.mp4`
      );

      console.log(
        `Rendering ${compositionId} -> ${outputLocation} using ${audio.audioProfile} audio profile`
      );

      await renderMedia({
        composition,
        serveUrl: bundleLocation,
        codec: "h264",
        outputLocation,
        inputProps,
        imageFormat: "jpeg",
        crf: 18,
        pixelFormat: "yuv420p",
        concurrency: 4,
      });

      console.log(`Finished ${compositionId}`);

      report.push({
        compositionId,
        duration,
        aspect,
        audioProfile: audio.audioProfile,
        outputLocation,
      });
    }
  }

  await writeJson(join(outputRoot, "reports", "render-report.json"), report);
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
