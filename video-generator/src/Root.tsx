import React from "react";
import {Composition} from "remotion";
import {Explainer30} from "./compositions/Explainer30";
import {Explainer60} from "./compositions/Explainer60";
import {Explainer90} from "./compositions/Explainer90";
import {getCompositionId, getTotalFrames} from "./script";

const baseDefaults = {
  audioProfile: "silent" as const,
  voiceoverSrc: null,
  musicSrc: null,
  showCaptions: true,
};

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id={getCompositionId("30", "landscape")}
        component={Explainer30}
        durationInFrames={getTotalFrames("30")}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{...baseDefaults, aspect: "landscape"}}
      />
      <Composition
        id={getCompositionId("60", "landscape")}
        component={Explainer60}
        durationInFrames={getTotalFrames("60")}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{...baseDefaults, aspect: "landscape"}}
      />
      <Composition
        id={getCompositionId("90", "landscape")}
        component={Explainer90}
        durationInFrames={getTotalFrames("90")}
        fps={30}
        width={1920}
        height={1080}
        defaultProps={{...baseDefaults, aspect: "landscape"}}
      />
      <Composition
        id={getCompositionId("30", "vertical")}
        component={Explainer30}
        durationInFrames={getTotalFrames("30")}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{...baseDefaults, aspect: "vertical"}}
      />
      <Composition
        id={getCompositionId("60", "vertical")}
        component={Explainer60}
        durationInFrames={getTotalFrames("60")}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{...baseDefaults, aspect: "vertical"}}
      />
      <Composition
        id={getCompositionId("90", "vertical")}
        component={Explainer90}
        durationInFrames={getTotalFrames("90")}
        fps={30}
        width={1080}
        height={1920}
        defaultProps={{...baseDefaults, aspect: "vertical"}}
      />
    </>
  );
};

export default RemotionRoot;
