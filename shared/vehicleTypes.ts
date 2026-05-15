export const VEHICLE_TYPE_VALUES = [
  "tractor",
  "straight_truck",
  "trailer",
  "bus",
  "van",
  "reefer_trailer",
  "flatbed_trailer",
  "dry_van_trailer",
  "other",
] as const;

export type VehicleTypeValue = (typeof VEHICLE_TYPE_VALUES)[number];

export const VEHICLE_TYPE_OPTIONS: Array<{ value: VehicleTypeValue; label: string }> = [
  { value: "tractor", label: "Tractor" },
  { value: "straight_truck", label: "Straight Truck" },
  { value: "trailer", label: "Trailer" },
  { value: "bus", label: "Bus" },
  { value: "van", label: "Van" },
  { value: "reefer_trailer", label: "Reefer Trailer" },
  { value: "flatbed_trailer", label: "Flatbed Trailer" },
  { value: "dry_van_trailer", label: "Dry Van Trailer" },
  { value: "other", label: "Other" },
];

export function getVehicleTypeLabel(vehicleType: VehicleTypeValue) {
  return VEHICLE_TYPE_OPTIONS.find((option) => option.value === vehicleType)?.label ?? "Other";
}

