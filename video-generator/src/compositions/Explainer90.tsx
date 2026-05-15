import React from "react";
import {ExplainerShell} from "./ExplainerShell";
import type {VideoCompositionProps} from "../types";

export const Explainer90: React.FC<Omit<VideoCompositionProps, "durationKey">> = (props) => {
  return <ExplainerShell {...props} durationKey="90" />;
};
