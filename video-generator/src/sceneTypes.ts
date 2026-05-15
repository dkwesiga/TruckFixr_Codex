import type {AspectRatio} from "./types";

export type SceneVisual = {
  source: string;
  alt: string;
  label?: string;
};

export type BaseSceneProps = {
  aspect: AspectRatio;
  durationInFrames: number;
  headline: string;
  body: string;
  progress: number;
  visuals: SceneVisual[];
};
