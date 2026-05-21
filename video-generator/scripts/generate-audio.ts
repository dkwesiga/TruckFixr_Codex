import "dotenv/config";
import {execFile} from "node:child_process";
import {readFile, writeFile} from "node:fs/promises";
import {createRequire} from "node:module";
import {join, resolve} from "node:path";
import {pathToFileURL} from "node:url";
import {promisify} from "node:util";
import {getScenePlan} from "../src/script";
import type {DurationKey} from "../src/types";
import {assetsRoot, ensureDir, outputRoot, writeJson} from "./utils";

const require = createRequire(import.meta.url);
const ffmpegPath: string | null = require("ffmpeg-static");
const execFileAsync = promisify(execFile);
const durations: DurationKey[] = ["30", "60", "90"];
const preferredVoice = "Microsoft Zira Desktop";

function hasForceFlag() {
  return process.argv.includes("--force");
}

function voiceoverOutputPath(duration: DurationKey) {
  return resolve(assetsRoot, "voiceover", `truckfixr-explainer-${duration}.mp3`);
}

function musicOutputPath() {
  return resolve(assetsRoot, "music", "background.mp3");
}

async function assetExists(path: string) {
  try {
    await readFile(path);
    return true;
  } catch {
    return false;
  }
}

async function readWavDurationMs(path: string) {
  const buffer = await readFile(path);

  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error(`Expected a WAV file at ${path}`);
  }

  let offset = 12;
  let sampleRate = 0;
  let blockAlign = 0;
  let dataSize = 0;

  while (offset + 8 <= buffer.length) {
    const chunkId = buffer.toString("ascii", offset, offset + 4);
    const chunkSize = buffer.readUInt32LE(offset + 4);
    const chunkData = offset + 8;

    if (chunkId === "fmt ") {
      sampleRate = buffer.readUInt32LE(chunkData + 4);
      blockAlign = buffer.readUInt16LE(chunkData + 12);
    }

    if (chunkId === "data") {
      dataSize = chunkSize;
      break;
    }

    offset += 8 + chunkSize + (chunkSize % 2);
  }

  if (!sampleRate || !blockAlign || !dataSize) {
    throw new Error(`Could not parse WAV duration from ${path}`);
  }

  return Math.round((dataSize / (sampleRate * blockAlign)) * 1000);
}

function buildAtempoFilter(factor: number) {
  const chain: string[] = [];
  let remaining = factor;

  while (remaining > 2) {
    chain.push("atempo=2");
    remaining /= 2;
  }

  while (remaining < 0.5) {
    chain.push("atempo=0.5");
    remaining /= 0.5;
  }

  chain.push(`atempo=${remaining.toFixed(5)}`);
  return chain.join(",");
}

async function synthesizeSceneNarration(textPath: string, outputPath: string) {
  const command =
    `& { param([string]$textPath, [string]$outputPath); ` +
    `$ErrorActionPreference='Stop'; ` +
    `Add-Type -AssemblyName System.Speech; ` +
    `$text = [System.IO.File]::ReadAllText($textPath); ` +
    `$voiceName = '${preferredVoice}'; ` +
    `$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer; ` +
    `$available = $synth.GetInstalledVoices() | ForEach-Object { $_.VoiceInfo.Name }; ` +
    `if ($available -contains $voiceName) { $synth.SelectVoice($voiceName) }; ` +
    `$synth.Rate = 0; ` +
    `$synth.Volume = 100; ` +
    `$synth.SetOutputToWaveFile($outputPath); ` +
    `$synth.Speak($text); ` +
    `$synth.Dispose() }`;

  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-Command", command, textPath, outputPath],
    {
      windowsHide: true,
    }
  );
}

async function stretchSceneAudio(inputPath: string, outputPath: string, targetMs: number) {
  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide a binary path.");
  }

  const currentMs = await readWavDurationMs(inputPath);
  const tempoFactor = currentMs / targetMs;
  const targetSeconds = (targetMs / 1000).toFixed(3);

  await execFileAsync(ffmpegPath, [
    "-y",
    "-i",
    inputPath,
    "-filter:a",
    `${buildAtempoFilter(tempoFactor)},volume=1.35,alimiter=limit=0.92,apad=whole_dur=${targetSeconds},atrim=duration=${targetSeconds}`,
    "-ar",
    "44100",
    "-ac",
    "2",
    outputPath,
  ]);
}

async function generateVoiceover(duration: DurationKey, force: boolean) {
  const outputPath = voiceoverOutputPath(duration);
  await ensureDir(resolve(assetsRoot, "voiceover"));

  if (!force) {
    try {
      await readFile(outputPath);
      return {
        duration,
        outputPath,
        mode: "preserved-existing",
      };
    } catch {
      // Continue with generation.
    }
  }

  const tempDir = resolve(outputRoot, "audio-temp", duration);
  await ensureDir(tempDir);

  const scenePlan = getScenePlan(duration);
  const sceneFiles: string[] = [];

  for (let index = 0; index < scenePlan.length; index += 1) {
    const scene = scenePlan[index];
    const prefix = `${String(index + 1).padStart(2, "0")}-${scene.key}`;
    const textPath = join(tempDir, `${prefix}.txt`);
    const rawPath = join(tempDir, `${prefix}-raw.wav`);
    const stretchedPath = join(tempDir, `${prefix}-fit.wav`);

    await writeFile(textPath, `${scene.narration}\n`, "utf8");
    await synthesizeSceneNarration(textPath, rawPath);
    await stretchSceneAudio(
      rawPath,
      stretchedPath,
      Math.round((scene.durationInFrames / 30) * 1000)
    );
    sceneFiles.push(stretchedPath);
  }

  const concatListPath = join(tempDir, "voiceover-files.txt");
  await writeFile(
    concatListPath,
    `${sceneFiles
      .map((filePath) => `file '${filePath.replace(/'/g, "'\\''")}'`)
      .join("\n")}\n`,
    "utf8"
  );

  await execFileAsync(ffmpegPath, [
    "-y",
    "-f",
    "concat",
    "-safe",
    "0",
    "-i",
    concatListPath,
    "-c:a",
    "libmp3lame",
    "-b:a",
    "192k",
    outputPath,
  ]);

  return {
    duration,
    outputPath,
    mode: "generated",
    sceneCount: scenePlan.length,
  };
}

async function generateMusic(force: boolean) {
  const outputPath = musicOutputPath();
  await ensureDir(resolve(assetsRoot, "music"));

  if (!force) {
    try {
      await readFile(outputPath);
      return {
        outputPath,
        mode: "preserved-existing",
      };
    } catch {
      // Continue with generation.
    }
  }

  if (!ffmpegPath) {
    throw new Error("ffmpeg-static did not provide a binary path.");
  }

  await execFileAsync(ffmpegPath, [
    "-y",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=220:sample_rate=44100:duration=90",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=277.18:sample_rate=44100:duration=90",
    "-f",
    "lavfi",
    "-i",
    "sine=frequency=329.63:sample_rate=44100:duration=90",
    "-f",
    "lavfi",
    "-i",
    "anoisesrc=color=pink:sample_rate=44100:duration=90:amplitude=0.02",
    "-filter_complex",
    "[0:a]volume=0.030[a0];[1:a]volume=0.022[a1];[2:a]volume=0.018[a2];[3:a]lowpass=f=900,volume=0.010[a3];[a0][a1][a2][a3]amix=inputs=4:normalize=0,afade=t=in:st=0:d=3,afade=t=out:st=86:d=4,aecho=0.8:0.88:55:0.20,lowpass=f=1800,alimiter=limit=0.88,volume=2.1",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "160k",
    outputPath,
  ]);

  return {
    outputPath,
    mode: "generated",
    durationSeconds: 90,
  };
}

export async function ensureAudioAssets() {
  const allVoiceoversExist = (
    await Promise.all(durations.map((duration) => assetExists(voiceoverOutputPath(duration))))
  ).every(Boolean);
  const backgroundMusicExists = await assetExists(musicOutputPath());

  if (process.platform !== "win32" && (!allVoiceoversExist || !backgroundMusicExists)) {
    throw new Error(
      "Automatic narration generation currently requires Windows local speech synthesis. Add manual MP3 files under assets/voiceover and assets/music on other platforms."
    );
  }

  const force = hasForceFlag();
  const voiceovers = [];

  for (const duration of durations) {
    voiceovers.push(await generateVoiceover(duration, force));
  }

  const music = await generateMusic(force);
  const report = {
    generatedAt: new Date().toISOString(),
    force,
    voiceovers,
    music,
  };

  await writeJson(join(outputRoot, "reports", "audio-report.json"), report);
  return report;
}

const executedDirectly = process.argv[1]
  ? import.meta.url === pathToFileURL(resolve(process.argv[1])).href
  : false;

if (executedDirectly) {
  ensureAudioAssets().catch((error) => {
    console.error(error instanceof Error ? error.message : String(error));
    process.exit(1);
  });
}
