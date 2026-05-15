export function formatInspectionMileage(value: number) {
  return value.toLocaleString("en-CA");
}

export function getInspectionOdometerRevisionMessage(input: {
  enteredOdometer: number;
  currentMileage: number;
}) {
  return `The odometer reading you entered (${formatInspectionMileage(input.enteredOdometer)} km) is lower than the current vehicle mileage on file (${formatInspectionMileage(input.currentMileage)} km). Please revise it so TruckFixr does not move maintenance tracking backward.`;
}

export function validateInspectionOdometer(input: {
  isTrailer: boolean;
  enteredOdometer: number | null;
  currentMileage?: number | null;
}) {
  if (input.isTrailer) {
    return { normalizedOdometer: null as number | null };
  }

  if (input.enteredOdometer == null || !Number.isFinite(input.enteredOdometer)) {
    throw new Error("Add the odometer reading before submitting this inspection.");
  }

  if (
    typeof input.currentMileage === "number" &&
    Number.isFinite(input.currentMileage) &&
    input.enteredOdometer < input.currentMileage
  ) {
    throw new Error(
      getInspectionOdometerRevisionMessage({
        enteredOdometer: input.enteredOdometer,
        currentMileage: input.currentMileage,
      })
    );
  }

  return { normalizedOdometer: input.enteredOdometer };
}
