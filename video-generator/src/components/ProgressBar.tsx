import React from "react";
import {theme} from "../theme";

type ProgressBarProps = {
  progress: number;
};

export const ProgressBar: React.FC<ProgressBarProps> = ({progress}) => {
  return (
    <div
      style={{
        position: "absolute",
        left: 0,
        right: 0,
        top: 0,
        height: 8,
        background: "rgba(127, 167, 205, 0.16)",
      }}
    >
      <div
        style={{
          width: `${Math.max(0, Math.min(100, progress * 100))}%`,
          height: "100%",
          background: `linear-gradient(90deg, ${theme.colors.red}, ${theme.colors.sky}, ${theme.colors.navy})`,
          boxShadow: "0 8px 20px rgba(227, 38, 54, 0.25)",
        }}
      />
    </div>
  );
};
