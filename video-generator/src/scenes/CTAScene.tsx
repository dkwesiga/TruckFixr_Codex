import React from "react";
import {AbsoluteFill, staticFile} from "remotion";
import {LogoIntro} from "../components/LogoIntro";
import {theme} from "../theme";
import type {BaseSceneProps} from "../sceneTypes";

export const CTAScene: React.FC<BaseSceneProps> = ({aspect, headline, body, visuals}) => {
  return (
    <AbsoluteFill style={{background: theme.gradients.overlay}}>
      <AbsoluteFill
        style={{
          backgroundImage: visuals[0] ? `url(${staticFile(visuals[0].source)})` : undefined,
          backgroundSize: "cover",
          backgroundPosition: "center",
          opacity: 0.14,
        }}
      />
      <AbsoluteFill
        style={{
          background: "linear-gradient(180deg, rgba(0,38,63,0.86), rgba(11,60,93,0.92))",
        }}
      />
      <AbsoluteFill
        style={{
          padding: aspect === "landscape" ? 80 : 58,
          justifyContent: "center",
          alignItems: aspect === "landscape" ? "flex-start" : "center",
        }}
      >
        <LogoIntro />
        <div
          style={{
            marginTop: 32,
            color: theme.colors.white,
            fontFamily: theme.fonts.headline,
            fontSize: aspect === "landscape" ? 70 : 82,
            fontWeight: 800,
            letterSpacing: -2,
            lineHeight: 1.02,
            maxWidth: aspect === "landscape" ? 980 : 900,
            textAlign: aspect === "landscape" ? "left" : "center",
          }}
        >
          {headline}
        </div>
        <div
          style={{
            marginTop: 18,
            color: "rgba(255,255,255,0.84)",
            fontFamily: theme.fonts.body,
            fontSize: aspect === "landscape" ? 30 : 34,
            lineHeight: 1.44,
            maxWidth: aspect === "landscape" ? 840 : 900,
            textAlign: aspect === "landscape" ? "left" : "center",
          }}
        >
          {body}
        </div>
        <div
          style={{
            marginTop: 30,
            display: "inline-flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "18px 28px",
            borderRadius: theme.radii.pill,
            background: theme.colors.red,
            color: theme.colors.white,
            fontFamily: theme.fonts.body,
            fontSize: aspect === "landscape" ? 24 : 28,
            fontWeight: 800,
            boxShadow: "0 18px 48px rgba(227, 38, 54, 0.26)",
          }}
        >
          Start a TruckFixr Fleet AI pilot
        </div>
      </AbsoluteFill>
    </AbsoluteFill>
  );
};
