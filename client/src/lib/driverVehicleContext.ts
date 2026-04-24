export type DriverVehicleContext = {
  id: number;
  fleetId?: number;
  label?: string;
  vin?: string;
  licensePlate?: string;
  make?: string;
  model?: string;
  year?: number | null;
  engineMake?: string;
};

const LAST_DRIVER_VEHICLE_KEY = "truckfixr:last-driver-vehicle";

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function saveLastDriverVehicleContext(vehicle: DriverVehicleContext) {
  if (!canUseStorage()) return;

  window.localStorage.setItem(
    LAST_DRIVER_VEHICLE_KEY,
    JSON.stringify({
      id: vehicle.id,
      fleetId: vehicle.fleetId ?? 1,
      label: vehicle.label ?? "",
      vin: vehicle.vin ?? "",
      licensePlate: vehicle.licensePlate ?? "",
      make: vehicle.make ?? "",
      model: vehicle.model ?? "",
      year: typeof vehicle.year === "number" ? vehicle.year : null,
      engineMake: vehicle.engineMake ?? "",
    })
  );
}

export function loadLastDriverVehicleContext(): DriverVehicleContext | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(LAST_DRIVER_VEHICLE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<DriverVehicleContext>;

    if (typeof parsed.id !== "number" || !Number.isFinite(parsed.id)) {
      return null;
    }

    return {
      id: parsed.id,
      fleetId:
        typeof parsed.fleetId === "number" && Number.isFinite(parsed.fleetId)
          ? parsed.fleetId
          : 1,
      label: typeof parsed.label === "string" ? parsed.label : undefined,
      vin: typeof parsed.vin === "string" ? parsed.vin : undefined,
      licensePlate:
        typeof parsed.licensePlate === "string" ? parsed.licensePlate : undefined,
      make: typeof parsed.make === "string" ? parsed.make : undefined,
      model: typeof parsed.model === "string" ? parsed.model : undefined,
      year: typeof parsed.year === "number" ? parsed.year : null,
      engineMake:
        typeof parsed.engineMake === "string" ? parsed.engineMake : undefined,
    };
  } catch {
    return null;
  }
}
