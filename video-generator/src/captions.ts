import {getScenePlan} from "./script";
import type {CaptionCue, DurationKey} from "./types";

function splitNarrationSentences(script: string) {
  return script
    .replace(/\s+/g, " ")
    .split(/(?<=[.!?])\s+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function splitCaption(text: string) {
  if (text.length <= 68) {
    return text;
  }

  const midpoint = Math.floor(text.length / 2);
  const breakIndex = text.lastIndexOf(" ", midpoint);
  if (breakIndex <= 0) {
    return text;
  }

  return `${text.slice(0, breakIndex).trim()}\n${text.slice(breakIndex + 1).trim()}`;
}

export function getCaptionCues(durationKey: DurationKey): CaptionCue[] {
  const scenes = getScenePlan(durationKey);
  const cues: CaptionCue[] = [];

  for (const scene of scenes) {
    const sceneStartMs = Math.round((scene.startFrame / 30) * 1000);
    const sceneEndMs = Math.round(((scene.startFrame + scene.durationInFrames) / 30) * 1000);
    const sceneSentences = splitNarrationSentences(scene.narration);

    if (sceneSentences.length === 0) {
      continue;
    }

    const weights = sceneSentences.map((sentence) => Math.max(sentence.length, 18));
    const totalWeight = weights.reduce((sum, weight) => sum + weight, 0);
    let cursor = sceneStartMs;

    sceneSentences.forEach((sentence, index) => {
      const proportionalMs = Math.round(
        ((sceneEndMs - sceneStartMs) * weights[index]) / totalWeight
      );
      const startMs = cursor;
      const endMs =
        index === sceneSentences.length - 1
          ? sceneEndMs
          : Math.min(sceneEndMs, cursor + proportionalMs);

      cursor = endMs;

      cues.push({
        startMs,
        endMs,
        text: splitCaption(sentence),
      });
    });
  }

  return cues;
}

export function formatTimestamp(ms: number, useVtt = false) {
  const totalSeconds = Math.floor(ms / 1000);
  const milliseconds = ms % 1000;
  const seconds = totalSeconds % 60;
  const minutes = Math.floor(totalSeconds / 60) % 60;
  const hours = Math.floor(totalSeconds / 3600);
  const separator = useVtt ? "." : ",";

  return `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}${separator}${String(milliseconds).padStart(3, "0")}`;
}

export function toSrt(cues: CaptionCue[]) {
  return `${cues
    .map(
      (cue, index) =>
        `${index + 1}\n${formatTimestamp(cue.startMs)} --> ${formatTimestamp(cue.endMs)}\n${cue.text}\n`
    )
    .join("\n")}\n`;
}

export function toVtt(cues: CaptionCue[]) {
  return `WEBVTT\n\n${cues
    .map(
      (cue) =>
        `${formatTimestamp(cue.startMs, true)} --> ${formatTimestamp(cue.endMs, true)}\n${cue.text}\n`
    )
    .join("\n")}`;
}

export function getCaptionForTime(durationKey: DurationKey, timeMs: number) {
  return (
    getCaptionCues(durationKey).find(
      (cue) => timeMs >= cue.startMs && timeMs <= cue.endMs
    ) ?? null
  );
}
