import React from "react";
import {Img, interpolate, spring, staticFile, useCurrentFrame} from "remotion";
import {brandAssets, brandNarrative} from "../script";
import {theme} from "../theme";

type LogoIntroProps = {
  delay?: number;
};

export const LogoIntro: React.FC<LogoIntroProps> = ({delay = 0}) => {
  const frame = useCurrentFrame();
  const entrance = spring({
    fps: 30,
    frame: Math.max(0, frame - delay),
    config: {damping: 16, stiffness: 110},
  });
  const opacity = interpolate(entrance, [0, 1], [0, 1]);
  const translateY = interpolate(entrance, [0, 1], [20, 0]);

  return (
    <div
      style={{
        opacity,
        transform: `translateY(${translateY}px)`,
        display: "flex",
        alignItems: "center",
        gap: 22,
      }}
    >
      <div
        style={{
          width: 92,
          height: 92,
          borderRadius: 26,
          background: "rgba(255,255,255,0.94)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          boxShadow: theme.shadows.glow,
          border: `1px solid ${theme.colors.line}`,
        }}
      >
        <Img
          src={staticFile(brandAssets.logoSquare)}
          alt="TruckFixr logo"
          style={{
            width: 68,
            height: 68,
            objectFit: "contain",
          }}
        />
      </div>
      <div style={{display: "flex", flexDirection: "column", gap: 8}}>
        <div
          style={{
            color: theme.colors.white,
            fontFamily: theme.fonts.headline,
            fontSize: 54,
            fontWeight: 800,
            letterSpacing: -1.4,
          }}
        >
          TruckFixr Fleet AI
        </div>
        <div
          style={{
            color: "rgba(255,255,255,0.82)",
            fontFamily: theme.fonts.body,
            fontSize: 24,
            lineHeight: 1.45,
            maxWidth: 720,
          }}
        >
          {brandNarrative.subtitle}
        </div>
      </div>
    </div>
  );
};
