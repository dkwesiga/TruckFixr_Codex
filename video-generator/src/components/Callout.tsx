import React from "react";
import {interpolate, spring, useCurrentFrame} from "remotion";
import {theme} from "../theme";

type CalloutProps = {
  title: string;
  detail: string;
  x: number;
  y: number;
  width?: number;
  delay?: number;
  accent?: "navy" | "red" | "green" | "amber";
};

export const Callout: React.FC<CalloutProps> = ({
  title,
  detail,
  x,
  y,
  width = 300,
  delay = 0,
  accent = "navy",
}) => {
  const frame = useCurrentFrame();
  const entrance = spring({
    fps: 30,
    frame: Math.max(0, frame - delay),
    config: {
      damping: 14,
      stiffness: 120,
    },
  });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const translateY = interpolate(entrance, [0, 1], [18, 0]);

  const accentColor =
    accent === "red"
      ? theme.colors.red
      : accent === "green"
        ? theme.colors.green
        : accent === "amber"
          ? theme.colors.amber
          : theme.colors.navy;

  return (
    <div
      style={{
        position: "absolute",
        left: x,
        top: y,
        width,
        opacity,
        transform: `translateY(${translateY}px)`,
        borderRadius: theme.radii.card,
        background: "rgba(255,255,255,0.96)",
        backdropFilter: "blur(16px)",
        border: `1px solid ${theme.colors.line}`,
        boxShadow: theme.shadows.card,
        padding: "18px 18px 16px 18px",
      }}
    >
      <div
        style={{
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          marginBottom: 10,
        }}
      >
        <div
          style={{
            width: 12,
            height: 12,
            borderRadius: 999,
            background: accentColor,
            boxShadow: `0 0 0 6px ${accentColor}18`,
          }}
        />
        <div
          style={{
            color: accentColor,
            fontFamily: theme.fonts.body,
            fontSize: 15,
            fontWeight: 800,
            letterSpacing: 0.3,
            textTransform: "uppercase",
          }}
        >
          {title}
        </div>
      </div>
      <div
        style={{
          color: theme.colors.ink,
          fontFamily: theme.fonts.body,
          fontSize: 24,
          lineHeight: 1.35,
          fontWeight: 600,
        }}
      >
        {detail}
      </div>
    </div>
  );
};
