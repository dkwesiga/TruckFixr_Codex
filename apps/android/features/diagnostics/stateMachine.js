const initialDiagnosticsFlow = {
  state: "idle",
  context: {},
};

function transitionDiagnosticsFlow(current, event) {
  switch (event.type) {
    case "SELECT_VEHICLE":
      return {
        ...current,
        context: {
          ...current.context,
          selectedVehicle: event.vehicle,
        },
      };

    case "SUBMIT_ISSUE":
      if (!current.context.selectedVehicle) {
        throw new Error("Vehicle selection is required before diagnostics.");
      }
      return {
        state: "analyzing",
        context: {
          ...current.context,
          issueInput: event.issue,
        },
      };

    case "ANALYSIS_REQUIRES_CLARIFICATION":
      return {
        state: "clarifying_question",
        context: {
          ...current.context,
          clarifyingQuestion: event.question,
        },
      };

    case "SUBMIT_CLARIFICATION_ANSWER":
      return {
        state: "processing_answer",
        context: {
          ...current.context,
        },
      };

    case "ANALYSIS_COMPLETE":
      return {
        state: "final_result",
        context: {
          ...current.context,
          result: event.result,
        },
      };

    case "RESET":
      return {
        ...initialDiagnosticsFlow,
        context: {
          selectedVehicle: current.context.selectedVehicle,
        },
      };

    default:
      return current;
  }
}

module.exports = {
  initialDiagnosticsFlow,
  transitionDiagnosticsFlow,
};
