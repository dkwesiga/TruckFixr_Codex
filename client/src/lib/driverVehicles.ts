export type DriverVehicleRecord = {
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

const DRIVER_VEHICLES_KEY = "truckfixr:driver-vehicles";
const MAX_SAFE_TEMP_VEHICLE_ID = 2_000_000_000;

const DEFAULT_DRIVER_VEHICLES = [
  {
    id: 42,
    fleetId: 1,
    label: "Unit 487964",
    vin: "1XPWD49X91D487964",
    licensePlate: "ABC-1234",
    make: "Peterbilt",
    engineMake: "PACCAR",
    model: "579",
    year: 2022,
    mileage: 245320,
    status: "Operational" as const,
  },
] satisfies DriverVehicleRecord[];

function canUseStorage() {
  return typeof window !== "undefined" && typeof window.localStorage !== "undefined";
}

export function createTemporaryDriverVehicleId(seed = Date.now()) {
  const normalizedSeed = Number.isFinite(seed) ? Math.trunc(seed) : Date.now();
  const boundedSeed =
    Math.abs(normalizedSeed % (MAX_SAFE_TEMP_VEHICLE_ID - 1)) || 1;

  return -boundedSeed;
}

function normalizeDriverVehicleId(value: unknown, fallbackSeed: number) {
  if (typeof value === "string" && value.length > 0) {
    return value;
  }

  if (
    typeof value === "number" &&
    Number.isInteger(value) &&
    Math.abs(value) <= MAX_SAFE_TEMP_VEHICLE_ID
  ) {
    return value;
  }

  return createTemporaryDriverVehicleId(fallbackSeed);
}

export function loadDriverVehicles(): DriverVehicleRecord[] {
  if (!canUseStorage()) return DEFAULT_DRIVER_VEHICLES;

  const raw = window.localStorage.getItem(DRIVER_VEHICLES_KEY);
  if (!raw) return DEFAULT_DRIVER_VEHICLES;

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return DEFAULT_DRIVER_VEHICLES;

    const normalized: DriverVehicleRecord[] = parsed
      .filter((item): item is Partial<DriverVehicleRecord> => Boolean(item && typeof item === "object"))
      .map((item, index) => ({
        id: normalizeDriverVehicleId(item.id, Date.now() + index),
        fleetId: typeof item.fleetId === "number" ? item.fleetId : 1,
        label: typeof item.label === "string" ? item.label : "Assigned vehicle",
        vin: typeof item.vin === "string" ? item.vin : "",
        licensePlate: typeof item.licensePlate === "string" ? item.licensePlate : "",
        make: typeof item.make === "string" ? item.make : "",
        engineMake: typeof item.engineMake === "string" ? item.engineMake : "",
        model: typeof item.model === "string" ? item.model : "",
        year: typeof item.year === "number" ? item.year : null,
        mileage: typeof item.mileage === "number" ? item.mileage : 0,
        assetType:
          item.assetType === "straight_truck" ||
          item.assetType === "trailer" ||
          item.assetType === "other"
            ? item.assetType
            : ("tractor" as const),
        status:
          item.status === "Needs Review"
            ? ("Needs Review" as const)
            : ("Operational" as const),
      }))
      .filter((item) => item.vin.trim().length > 0);

    if (normalized.length > 0) {
      window.localStorage.setItem(DRIVER_VEHICLES_KEY, JSON.stringify(normalized));
      return normalized;
    }

    return DEFAULT_DRIVER_VEHICLES;
  } catch {
    return DEFAULT_DRIVER_VEHICLES;
  }
}

export function saveDriverVehicles(vehicles: DriverVehicleRecord[]) {
  if (!canUseStorage()) return;
  window.localStorage.setItem(DRIVER_VEHICLES_KEY, JSON.stringify(vehicles));
}
