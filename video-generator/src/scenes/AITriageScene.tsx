import React from "react";
import {AbsoluteFill} from "remotion";
import {Callout} from "../components/Callout";
import {ScreenshotFrame} from "../components/ScreenshotFrame";
import {theme} from "../theme";
import type {BaseSceneProps} from "../sceneTypes";

export const AITriageScene: React.FC<BaseSceneProps> = ({
  aspect,
  headline,
  body,
  visuals,
}) => {
  return (
    <AbsoluteFill style={{padding: aspect === "landscape" ? 72 : 52}}>
      <div
        style={{
          display: "flex",
          flexDirection: "column",
          gap: 26,
          height: "100%",
        }}
      >
        <div style={{maxWidth: aspect === "landscape" ? 860 : 940}}>
          <div
            style={{
              color: theme.colors.red,
              fontFamily: theme.fonts.body,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            AI triage
          </div>
          <div
            style={{
              color: theme.colors.ink,
              fontFamily: theme.fonts.headline,
              fontSize: aspect === "landscape" ? 64 : 78,
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: -1.8,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              marginTop: 18,
              color: theme.colors.inkSoft,
              fontFamily: theme.fonts.body,
              fontSize: aspect === "landscape" ? 28 : 32,
              lineHeight: 1.46,
            }}
          >
            {body}
          </div>
        </div>
        <div style={{position: "relative", flex: 1}}>
          <div style={{position: "absolute", inset: 0}}>
            <ScreenshotFrame
              source={visuals[0]?.source ?? "screenshots/desktop/08-ai-diagnosis-result.png"}
              alt={visuals[0]?.alt ?? "AI diagnosis result"}
              label="AI diagnosis result"
            />
          </div>
          <Callout
            title="Symptoms"
            detail="Driver observations stay attached to the issue."
            x={aspect === "landscape" ? 64 : 48}
            y={aspect === "landscape" ? 110 : 120}
            accent="navy"
            delay={8}
          />
          <Callout
            title="Fault codes"
            detail="Technical signals stay visible for triage."
            x={aspect === "landscape" ? 1190 : 580}
            y={aspect === "landscape" ? 120 : 220}
            accent="amber"
            delay={14}
          />
          <Callout
            title="History"
            detail="Previous inspections and repair context support the next decision."
            x={aspect === "landscape" ? 1010 : 380}
            y={aspect === "landscape" ? 540 : 1030}
            width={aspect === "landscape" ? 380 : 520}
            accent="green"
            delay={20}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
