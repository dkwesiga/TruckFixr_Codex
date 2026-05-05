export type DriverVehicleContext = {
  id: number | string;
  fleetId: number;
  label: string;
  vin: string;
  licensePlate: string;
  make: string;
  engineMake: string;
  model: string;
  year: number | null;
  mileage: number;
  assetType?: "tractor" | "straight_truck" | "trailer" | "other";
  status: "Operational" | "Needs Review";
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
      mileage: typeof vehicle.mileage === "number" ? vehicle.mileage : 0,
      assetType: vehicle.assetType ?? "other",
      status: vehicle.status ?? "Operational",
    })
  );
}

export function loadLastDriverVehicleContext(): DriverVehicleContext | null {
  if (!canUseStorage()) return null;

  const raw = window.localStorage.getItem(LAST_DRIVER_VEHICLE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<DriverVehicleContext>;

    if (typeof parsed.id !== "number" && typeof parsed.id !== "string") {
      return null;
    }

    return {
      id: parsed.id,
      fleetId:
        typeof parsed.fleetId === "number" && Number.isFinite(parsed.fleetId)
          ? parsed.fleetId
          : 1,
      label: typeof parsed.label === "string" ? parsed.label : "",
      vin: typeof parsed.vin === "string" ? parsed.vin : "",
      licensePlate: typeof parsed.licensePlate === "string" ? parsed.licensePlate : "",
      make: typeof parsed.make === "string" ? parsed.make : "",
      model: typeof parsed.model === "string" ? parsed.model : "",
      year: typeof parsed.year === "number" ? parsed.year : null,
      engineMake: typeof parsed.engineMake === "string" ? parsed.engineMake : "",
      mileage: typeof parsed.mileage === "number" ? parsed.mileage : 0,
      assetType: parsed.assetType === "tractor" || parsed.assetType === "straight_truck" || parsed.assetType === "trailer" ? parsed.assetType : "other",
      status: parsed.status === "Needs Review" ? "Needs Review" : "Operational",
    };
  } catch {
    return null;
  }
}
