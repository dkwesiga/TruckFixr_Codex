import React from "react";
import {
  AbsoluteFill,
  Audio,
  Sequence,
  staticFile,
  useCurrentFrame,
  useVideoConfig,
} from "remotion";
import {Caption} from "../components/Caption";
import {ProgressBar} from "../components/ProgressBar";
import {getCaptionForTime} from "../captions";
import {brandNarrative, getScenePlan, sceneShotPreferences, screenshotLibrary} from "../script";
import {CTAScene} from "../scenes/CTAScene";
import {DriverWorkflowScene} from "../scenes/DriverWorkflowScene";
import {ManagerVisibilityScene} from "../scenes/ManagerVisibilityScene";
import {OutcomeScene} from "../scenes/OutcomeScene";
import {ProblemScene} from "../scenes/ProblemScene";
import {ProductIntroScene} from "../scenes/ProductIntroScene";
import {AITriageScene} from "../scenes/AITriageScene";
import {theme} from "../theme";
import type {BaseSceneProps, SceneVisual} from "../sceneTypes";
import type {SceneKey, VideoCompositionProps} from "../types";

const sceneMap: Record<SceneKey, React.FC<BaseSceneProps>> = {
  problem: ProblemScene,
  productIntro: ProductIntroScene,
  driverWorkflow: DriverWorkflowScene,
  aiTriage: AITriageScene,
  managerVisibility: ManagerVisibilityScene,
  outcome: OutcomeScene,
  cta: CTAScene,
};

function buildVisuals(key: SceneKey, aspect: VideoCompositionProps["aspect"]): SceneVisual[] {
  const assets = sceneShotPreferences[key][aspect];
  return assets.map((asset) => ({
    source: screenshotLibrary[asset],
    alt: asset,
    label: asset,
  }));
}

export const ExplainerShell: React.FC<VideoCompositionProps> = ({
  aspect,
  durationKey,
  audioProfile = "silent",
  voiceoverSrc = null,
  musicSrc = null,
  showCaptions = true,
}) => {
  const frame = useCurrentFrame();
  const {durationInFrames, fps} = useVideoConfig();
  const scenes = getScenePlan(durationKey);
  const activeCaption = getCaptionForTime(durationKey, Math.round((frame / fps) * 1000));

  const shouldPlayVoiceover =
    audioProfile === "voiceover" && voiceoverSrc;
  const shouldPlayMusic =
    audioProfile !== "silent" && musicSrc;

  return (
    <AbsoluteFill
      style={{
        background: theme.gradients.bg,
        fontFamily: theme.fonts.body,
      }}
    >
      <AbsoluteFill
        style={{
          backgroundImage: theme.gradients.hero,
          opacity: 1,
        }}
      />
      <div
        style={{
          position: "absolute",
          top: aspect === "landscape" ? 34 : 40,
          left: aspect === "landscape" ? 72 : 52,
          color: theme.colors.navy,
          fontSize: aspect === "landscape" ? 18 : 20,
          fontWeight: 800,
          letterSpacing: 1.1,
          textTransform: "uppercase",
        }}
      >
        TruckFixr Fleet AI
      </div>
      <div
        style={{
          position: "absolute",
          top: aspect === "landscape" ? 34 : 40,
          right: aspect === "landscape" ? 72 : 52,
          color: theme.colors.inkSoft,
          fontSize: aspect === "landscape" ? 17 : 19,
          fontWeight: 700,
        }}
      >
        {brandNarrative.subtitle}
      </div>
      <ProgressBar progress={frame / durationInFrames} />

      {scenes.map((scene) => {
        const SceneComponent = sceneMap[scene.key];
        return (
          <Sequence
            key={scene.key}
            from={scene.startFrame}
            durationInFrames={scene.durationInFrames}
          >
            <SceneComponent
              aspect={aspect}
              durationInFrames={scene.durationInFrames}
              headline={scene.headline}
              body={scene.body}
              progress={frame / durationInFrames}
              visuals={buildVisuals(scene.key, aspect)}
            />
          </Sequence>
        );
      })}

      {showCaptions && activeCaption ? (
        <Caption text={activeCaption.text} aspect={aspect} />
      ) : null}

      {shouldPlayVoiceover ? (
        <Audio src={staticFile(voiceoverSrc)} volume={1} />
      ) : null}
      {shouldPlayMusic ? (
        <Audio
          src={staticFile(musicSrc)}
          volume={audioProfile === "voiceover" ? 0.1 : 0.24}
        />
      ) : null}
    </AbsoluteFill>
  );
};
