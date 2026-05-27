type ErrorPresentation = {
  toast: string;
  inline: string;
  field?: {
    name: "vin";
    message: string;
  };
};

function normalizeMessage(error: unknown) {
  return String(error instanceof Error ? error.message : error ?? "").trim();
}

function includesAny(haystack: string, needles: string[]) {
  return needles.some((needle) => haystack.includes(needle));
}

export function getVehicleCreateErrorPresentation(error: unknown): ErrorPresentation {
  const raw = normalizeMessage(error);
  const message = raw.toLowerCase();

  if (
    includesAny(message, [
      "ix_vehicles_vin",
      "duplicate key",
      "unique",
      "vin already",
      "this vin is already on file",
    ]) &&
    message.includes("vin")
  ) {
    const userMessage =
      "This VIN is already on file. Search your fleet before adding it again. If you believe it was added incorrectly, contact support.";
    return {
      toast: "This VIN is already on file.",
      inline: userMessage,
      field: {
        name: "vin",
        message: "This VIN is already on file.",
      },
    };
  }

  if (includesAny(message, ["do not have permission", "forbidden", "only fleet owners and managers can create vehicles"])) {
    const userMessage =
      "You do not have access to add a vehicle for this fleet. Contact your fleet owner or manager. If your access looks wrong, contact TruckFixr support.";
    return {
      toast: "You do not have access to add a vehicle for this fleet.",
      inline: userMessage,
    };
  }

  if (includesAny(message, ["fleet is still loading", "could not determine your fleet", "database not available"])) {
    const userMessage =
      "TruckFixr could not reach the fleet record needed to save this vehicle right now. Refresh and try again. If it keeps happening, contact support.";
    return {
      toast: "TruckFixr could not reach your fleet right now.",
      inline: userMessage,
    };
  }

  return {
    toast: "We couldn't save this vehicle right now.",
    inline:
      "We couldn't save this vehicle right now. Please review the details and try again. If it keeps happening, contact support.",
  };
}

export function getInspectionErrorPresentation(error: unknown): ErrorPresentation {
  const raw = normalizeMessage(error);
  const message = raw.toLowerCase();

  if (includesAny(message, ["select or join a company fleet", "fleet before starting", "fleet is required"])) {
    const userMessage =
      "TruckFixr needs a fleet selection before this inspection can continue. Select the correct fleet and try again.";
    return {
      toast: "Select a fleet before continuing this inspection.",
      inline: userMessage,
    };
  }

  if (
    includesAny(message, [
      "do not have access to inspect this vehicle",
      "do not have access to submit this inspection",
      "do not have access to this vehicle",
      "forbidden",
    ])
  ) {
    const userMessage =
      "You do not have access to complete this inspection for the selected vehicle. Contact your fleet owner or manager. If your access looks wrong, contact TruckFixr support.";
    return {
      toast: "You do not have access to complete this inspection.",
      inline: userMessage,
    };
  }

  if (includesAny(message, ["inspection not found"])) {
    const userMessage =
      "TruckFixr could not find this inspection session anymore. Start a new inspection and try again.";
    return {
      toast: "This inspection session could not be found.",
      inline: userMessage,
    };
  }

  if (
    includesAny(message, [
      "already submitted",
      "already exists",
      "session",
    ]) &&
    message.includes("inspection")
  ) {
    const userMessage =
      "This inspection looks like it may already have been submitted. Check the vehicle history before trying again.";
    return {
      toast: "This inspection may already have been submitted.",
      inline: userMessage,
    };
  }

  if (includesAny(message, ["fetch failed", "network", "failed to fetch"])) {
    const userMessage =
      "TruckFixr could not reach the server to save this inspection. Check your connection and try again. If the issue continues, contact support.";
    return {
      toast: "TruckFixr could not reach the server to save this inspection.",
      inline: userMessage,
    };
  }

  return {
    toast: "We couldn't save this inspection right now.",
    inline:
      "We couldn't save this inspection right now. Please try again. If it keeps happening, contact support.",
  };
}
