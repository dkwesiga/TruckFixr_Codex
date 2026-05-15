import React from "react";
import {AbsoluteFill} from "remotion";
import {Callout} from "../components/Callout";
import {ScreenshotFrame} from "../components/ScreenshotFrame";
import {theme} from "../theme";
import type {BaseSceneProps} from "../sceneTypes";

export const ProblemScene: React.FC<BaseSceneProps> = ({
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
          flexDirection: aspect === "landscape" ? "row" : "column",
          gap: 36,
          height: "100%",
        }}
      >
        <div style={{flex: 1.02, display: "flex", flexDirection: "column", justifyContent: "center"}}>
          <div
            style={{
              color: theme.colors.red,
              fontFamily: theme.fonts.body,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
              marginBottom: 18,
            }}
          >
            Maintenance friction
          </div>
          <div
            style={{
              color: theme.colors.ink,
              fontFamily: theme.fonts.headline,
              fontSize: aspect === "landscape" ? 72 : 86,
              fontWeight: 800,
              lineHeight: 1.02,
              letterSpacing: -2.2,
              maxWidth: aspect === "landscape" ? 660 : 860,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              marginTop: 24,
              color: theme.colors.inkSoft,
              fontFamily: theme.fonts.body,
              fontSize: aspect === "landscape" ? 30 : 34,
              lineHeight: 1.45,
              maxWidth: aspect === "landscape" ? 620 : 860,
            }}
          >
            {body}
          </div>
        </div>
        <div
          style={{
            flex: 0.98,
            position: "relative",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            minHeight: 0,
          }}
        >
          <div
            style={{
              position: "relative",
              width: "100%",
              height: "100%",
            }}
          >
            {visuals[0] ? (
              <div style={{position: "absolute", left: 0, top: aspect === "landscape" ? 60 : 120, width: aspect === "landscape" ? "76%" : "88%", height: aspect === "landscape" ? "54%" : "42%"}}>
                <ScreenshotFrame {...visuals[0]} label="Login + Intake" rotate={-4} />
              </div>
            ) : null}
            {visuals[1] ? (
              <div style={{position: "absolute", right: 0, bottom: aspect === "landscape" ? 64 : 180, width: aspect === "landscape" ? "70%" : "82%", height: aspect === "landscape" ? "48%" : "38%"}}>
                <ScreenshotFrame {...visuals[1]} label="Issue Queue" delay={6} rotate={3} />
              </div>
            ) : null}
            {visuals[2] ? (
              <div style={{position: "absolute", left: aspect === "landscape" ? 140 : 90, bottom: 0, width: aspect === "landscape" ? "62%" : "78%", height: aspect === "landscape" ? "38%" : "30%"}}>
                <ScreenshotFrame {...visuals[2]} label="Priority View" delay={12} />
              </div>
            ) : null}
            <Callout
              title="Common pain"
              detail="Maintenance signals are often scattered across drivers, dispatch, and repair follow-up."
              x={aspect === "landscape" ? 42 : 34}
              y={aspect === "landscape" ? 10 : 18}
              width={aspect === "landscape" ? 320 : 420}
              accent="red"
              delay={10}
            />
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
