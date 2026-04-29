export function getFallbackUnitNumber(vin?: string | null) {
  const normalizedVin = vin?.trim().toUpperCase() ?? "";
  return normalizedVin.length >= 6 ? normalizedVin.slice(-6) : "";
}

export function formatDistanceKm(distanceValue?: number | null) {
  const normalizedValue =
    typeof distanceValue === "number" && Number.isFinite(distanceValue)
      ? distanceValue
      : 0;
  const kilometers = Math.round(normalizedValue * 1.60934);
  return `${kilometers.toLocaleString()} km`;
}

export function getVehicleDisplayLabel(input: {
  label?: string | null;
  vin?: string | null;
  vehicleId?: string | number | null;
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
