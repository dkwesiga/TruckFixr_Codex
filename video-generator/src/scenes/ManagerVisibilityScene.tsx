import React from "react";
import {AbsoluteFill} from "remotion";
import {Callout} from "../components/Callout";
import {ScreenshotFrame} from "../components/ScreenshotFrame";
import {theme} from "../theme";
import type {BaseSceneProps} from "../sceneTypes";

export const ManagerVisibilityScene: React.FC<BaseSceneProps> = ({
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
          gridTemplateColumns: aspect === "landscape" ? "1.08fr 0.92fr" : "1fr",
          gap: 34,
          height: "100%",
        }}
      >
        <div style={{position: "relative"}}>
          <div style={{position: "absolute", inset: 0}}>
            <ScreenshotFrame
              source={visuals[0]?.source ?? "screenshots/desktop/02-main-dashboard.png"}
              alt={visuals[0]?.alt ?? "Dashboard"}
              label="Manager dashboard"
            />
          </div>
          <Callout
            title="Priority"
            detail="Managers can see what looks urgent first."
            x={aspect === "landscape" ? 44 : 46}
            y={aspect === "landscape" ? 56 : 60}
            accent="red"
            delay={10}
          />
          <Callout
            title="Status"
            detail="Vehicle condition and open issues stay visible."
            x={aspect === "landscape" ? 1060 : 360}
            y={aspect === "landscape" ? 70 : 146}
            accent="navy"
            delay={16}
          />
        </div>
        <div style={{display: "flex", flexDirection: "column", gap: 20, justifyContent: "center"}}>
          <div
            style={{
              color: theme.colors.steel,
              fontFamily: theme.fonts.body,
              fontSize: 18,
              fontWeight: 800,
              letterSpacing: 1.2,
              textTransform: "uppercase",
            }}
          >
            Manager visibility
          </div>
          <div
            style={{
              color: theme.colors.ink,
              fontFamily: theme.fonts.headline,
              fontSize: aspect === "landscape" ? 60 : 76,
              fontWeight: 800,
              lineHeight: 1.05,
              letterSpacing: -1.7,
            }}
          >
            {headline}
          </div>
          <div
            style={{
              color: theme.colors.inkSoft,
              fontFamily: theme.fonts.body,
              fontSize: aspect === "landscape" ? 28 : 32,
              lineHeight: 1.44,
            }}
          >
            {body}
          </div>
          <div style={{display: "grid", gridTemplateColumns: "1fr 1fr", gap: 18, marginTop: 10}}>
            {visuals.slice(1, 3).map((visual, index) => (
              <div key={visual.source} style={{height: aspect === "landscape" ? 220 : 260}}>
                <ScreenshotFrame
                  source={visual.source}
                  alt={visual.alt}
                  label={index === 0 ? "Vehicle profile" : "Maintenance history"}
                  delay={12 + index * 6}
                />
              </div>
            ))}
          </div>
        </div>
      </div>
    </AbsoluteFill>
  );
};
