import React from "react";
import {AbsoluteFill} from "remotion";
import {LogoIntro} from "../components/LogoIntro";
import {ScreenshotFrame} from "../components/ScreenshotFrame";
import {theme} from "../theme";
import type {BaseSceneProps} from "../sceneTypes";

export const ProductIntroScene: React.FC<BaseSceneProps> = ({
  aspect,
  headline,
  body,
  visuals,
}) => {
  return (
    <AbsoluteFill
      style={{
        background: theme.gradients.overlay,
        padding: aspect === "landscape" ? 72 : 54,
      }}
    >
      <div
        style={{
          display: "flex",
          flexDirection: aspect === "landscape" ? "row" : "column",
          gap: 40,
          height: "100%",
          alignItems: "center",
        }}
      >
        <div style={{flex: 1, display: "flex", flexDirection: "column", justifyContent: "center"}}>
          <LogoIntro />
          <div
            style={{
              marginTop: 28,
              color: theme.colors.white,
              fontFamily: theme.fonts.headline,
              fontSize: aspect === "landscape" ? 58 : 72,
              fontWeight: 800,
              letterSpacing: -1.6,
              lineHeight: 1.04,
              maxWidth: aspect === "landscape" ? 620 : 860,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              marginTop: 18,
              color: "rgba(255,255,255,0.82)",
              fontFamily: theme.fonts.body,
              fontSize: aspect === "landscape" ? 28 : 32,
              lineHeight: 1.45,
              maxWidth: aspect === "landscape" ? 620 : 860,
            }}
          >
            {body}
          </div>
        </div>
        <div style={{flex: 1, display: "flex", alignItems: "center", justifyContent: "center"}}>
          <div
            style={{
              width: aspect === "landscape" ? 860 : "100%",
              height: aspect === "landscape" ? 610 : 760,
            }}
          >
            <ScreenshotFrame
              source={visuals[0]?.source ?? visuals[1]?.source ?? "screenshots/desktop/02-main-dashboard.png"}
              alt={visuals[0]?.alt ?? "TruckFixr dashboard"}
              label="TruckFixr dashboard"
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
