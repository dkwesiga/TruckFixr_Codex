import React from "react";
import {AbsoluteFill} from "remotion";
import {Callout} from "../components/Callout";
import {ScreenshotFrame} from "../components/ScreenshotFrame";
import {theme} from "../theme";
import type {BaseSceneProps} from "../sceneTypes";

export const DriverWorkflowScene: React.FC<BaseSceneProps> = ({
  aspect,
  headline,
  body,
  visuals,
}) => {
  return (
    <AbsoluteFill style={{padding: aspect === "landscape" ? 72 : 52}}>
      <div
        style={{
          display: "grid",
          gridTemplateColumns: aspect === "landscape" ? "0.92fr 1.08fr" : "1fr",
          gap: 34,
          height: "100%",
        }}
      >
        <div style={{display: "flex", flexDirection: "column", justifyContent: "center"}}>
          <div
            style={{
              color: theme.colors.steel,
              fontFamily: theme.fonts.body,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 16,
            }}
          >
            Driver workflow
          </div>
          <div
            style={{
              color: theme.colors.ink,
              fontFamily: theme.fonts.headline,
              fontSize: aspect === "landscape" ? 64 : 78,
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: -1.8,
              maxWidth: 760,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              marginTop: 20,
              color: theme.colors.inkSoft,
              fontFamily: theme.fonts.body,
              fontSize: aspect === "landscape" ? 28 : 32,
              lineHeight: 1.44,
              maxWidth: 720,
            }}
          >
            {body}
          </div>
        </div>
        <div style={{position: "relative"}}>
          {visuals[0] ? (
            <div style={{position: "absolute", left: 0, top: 0, width: aspect === "landscape" ? "42%" : "46%", height: aspect === "landscape" ? "100%" : "88%"}}>
              <ScreenshotFrame {...visuals[0]} label="Driver dashboard" rotate={-2} />
            </div>
          ) : null}
          {visuals[1] ? (
            <div style={{position: "absolute", right: 0, top: aspect === "landscape" ? 34 : 46, width: aspect === "landscape" ? "52%" : "48%", height: aspect === "landscape" ? "48%" : "42%"}}>
              <ScreenshotFrame {...visuals[1]} label="Inspection" delay={6} />
            </div>
          ) : null}
          {visuals[2] ? (
            <div style={{position: "absolute", right: 0, bottom: 0, width: aspect === "landscape" ? "52%" : "48%", height: aspect === "landscape" ? "42%" : "38%"}}>
              <ScreenshotFrame {...visuals[2]} label="Issue report" delay={12} />
            </div>
          ) : null}
          <Callout
            title="Structured intake"
            detail="Photos, symptoms, and inspection context move into one maintenance record."
            x={aspect === "landscape" ? 220 : 120}
            y={aspect === "landscape" ? 40 : 28}
            width={aspect === "landscape" ? 330 : 420}
            accent="navy"
            delay={16}
          />
        </div>
      </div>
    </AbsoluteFill>
  );
};
