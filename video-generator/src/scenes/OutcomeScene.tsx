import React from "react";
import {AbsoluteFill} from "remotion";
import {ScreenshotFrame} from "../components/ScreenshotFrame";
import {theme} from "../theme";
import type {BaseSceneProps} from "../sceneTypes";

const outcomePills = [
  "Faster maintenance decisions",
  "Better inspection follow-up",
  "Clearer issue visibility",
];

export const OutcomeScene: React.FC<BaseSceneProps> = ({
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
          gap: 24,
          height: "100%",
        }}
      >
        <div style={{display: "flex", flexDirection: "column", gap: 16}}>
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
            Outcome
          </div>
          <div
            style={{
              color: theme.colors.ink,
              fontFamily: theme.fonts.headline,
              fontSize: aspect === "landscape" ? 62 : 76,
              fontWeight: 800,
              lineHeight: 1.04,
              letterSpacing: -1.8,
              maxWidth: 980,
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
              maxWidth: 920,
            }}
          >
            {body}
          </div>
        </div>
        <div style={{display: "flex", gap: 14, flexWrap: "wrap"}}>
          {outcomePills.map((pill) => (
            <div
              key={pill}
              style={{
                padding: "14px 20px",
                borderRadius: theme.radii.pill,
                background: theme.colors.surfaceHigh,
                border: `1px solid ${theme.colors.line}`,
                color: theme.colors.navy,
                fontFamily: theme.fonts.body,
                fontSize: aspect === "landscape" ? 22 : 24,
                fontWeight: 700,
                boxShadow: theme.shadows.card,
              }}
            >
              {pill}
            </div>
          ))}
        </div>
        <div
          style={{
            display: "grid",
            gridTemplateColumns: aspect === "landscape" ? "1.2fr 1fr 1fr" : "1fr",
            gap: 20,
            flex: 1,
          }}
        >
          {visuals.slice(0, aspect === "landscape" ? 3 : 2).map((visual, index) => (
            <div key={visual.source} style={{height: "100%"}}>
              <ScreenshotFrame
                source={visual.source}
                alt={visual.alt}
                label={index === 0 ? "Fleet dashboard" : index === 1 ? "Vehicle context" : "History"}
                delay={index * 6}
              />
            </div>
          ))}
        </div>
      </div>
    </AbsoluteFill>
  );
};
