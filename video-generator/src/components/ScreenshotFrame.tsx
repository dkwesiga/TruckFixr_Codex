import React from "react";
import {AbsoluteFill, Img, interpolate, spring, staticFile, useCurrentFrame} from "remotion";
import {theme} from "../theme";

type ScreenshotFrameProps = {
  source: string;
  alt: string;
  label?: string;
  width?: string | number;
  height?: string | number;
  delay?: number;
  scaleFrom?: number;
  rotate?: number;
  align?: "left" | "center" | "right";
};

export const ScreenshotFrame: React.FC<ScreenshotFrameProps> = ({
  source,
  alt,
  label,
  width = "100%",
  height = "100%",
  delay = 0,
  scaleFrom = 0.92,
  rotate = 0,
  align = "center",
}) => {
  const frame = useCurrentFrame();
  const entrance = spring({
    fps: 30,
    frame: Math.max(0, frame - delay),
    config: {
      damping: 18,
      stiffness: 120,
      mass: 0.8,
    },
  });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const scale = interpolate(entrance, [0, 1], [scaleFrom, 1]);
  const translateY = interpolate(entrance, [0, 1], [28, 0]);

  return (
    <div
      style={{
        width,
        height,
        opacity,
        transform: `translateY(${translateY}px) scale(${scale}) rotate(${rotate}deg)`,
        alignSelf:
          align === "left" ? "flex-start" : align === "right" ? "flex-end" : "center",
      }}
    >
      <AbsoluteFill
        style={{
          borderRadius: theme.radii.panel,
          overflow: "hidden",
          boxShadow: theme.shadows.panel,
          border: `1px solid ${theme.colors.line}`,
          background: theme.colors.surfaceHigh,
        }}
      >
        <AbsoluteFill
          style={{
            height: 44,
            flexDirection: "row",
            alignItems: "center",
            gap: 8,
            padding: "0 16px",
            background: "linear-gradient(180deg, rgba(255,255,255,0.98), rgba(239,244,255,0.98))",
            borderBottom: `1px solid ${theme.colors.line}`,
          }}
        >
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#ff5f57",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#ffbd2e",
            }}
          />
          <div
            style={{
              width: 10,
              height: 10,
              borderRadius: 999,
              background: "#28c840",
            }}
          />
          {label ? (
            <div
              style={{
                marginLeft: 12,
                padding: "6px 12px",
                borderRadius: theme.radii.pill,
                background: theme.colors.surfaceLow,
                color: theme.colors.navy,
                fontFamily: theme.fonts.body,
                fontSize: 16,
                fontWeight: 700,
                letterSpacing: 0.2,
              }}
            >
              {label}
            </div>
          ) : null}
        </AbsoluteFill>
        <AbsoluteFill
          style={{
            top: 44,
            background: "#dfe9f8",
          }}
        >
          <Img
            src={staticFile(source)}
            alt={alt}
            style={{
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
        </AbsoluteFill>
      </AbsoluteFill>
    </div>
  );
};
