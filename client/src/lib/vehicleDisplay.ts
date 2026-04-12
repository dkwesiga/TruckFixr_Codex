export function getFallbackUnitNumber(vin?: string | null) {
  const normalizedVin = vin?.trim().toUpperCase() ?? "";
  return normalizedVin.length >= 6 ? normalizedVin.slice(-6) : "";
}

export function getVehicleDisplayLabel(input: {
  label?: string | null;
  vin?: string | null;
  vehicleId?: number | null;
}) {
  const explicitLabel = input.label?.trim();
  if (explicitLabel) {
    return explicitLabel;
  }

  const fallbackUnitNumber = getFallbackUnitNumber(input.vin);
  if (fallbackUnitNumber) {
    return `Unit ${fallbackUnitNumber}`;
  }

  if (input.vehicleId) {
    return `Truck #${input.vehicleId}`;
  }

  return "Assigned vehicle";
}
