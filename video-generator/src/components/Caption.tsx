import React from "react";
import {theme} from "../theme";
import type {AspectRatio} from "../types";

type CaptionProps = {
  text: string;
  aspect: AspectRatio;
};

export const Caption: React.FC<CaptionProps> = ({text, aspect}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: aspect === "landscape" ? 72 : 44,
        right: aspect === "landscape" ? 72 : 44,
        bottom: aspect === "landscape" ? 42 : 56,
        display: "flex",
        justifyContent: "center",
        pointerEvents: "none",
      }}
    >
      <div
        style={{
          maxWidth: aspect === "landscape" ? 980 : 900,
          padding: aspect === "landscape" ? "16px 24px" : "20px 24px",
          borderRadius: 26,
          background: "rgba(5, 21, 36, 0.84)",
          color: theme.colors.white,
          fontFamily: theme.fonts.body,
          fontSize: aspect === "landscape" ? 28 : 32,
          fontWeight: 700,
          lineHeight: 1.3,
          textAlign: "center",
          whiteSpace: "pre-line",
          boxShadow: "0 20px 56px rgba(5, 21, 36, 0.28)",
        }}
      >
        {text}
      </div>
    </div>
  );
};
