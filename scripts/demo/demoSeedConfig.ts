import type { VehicleTypeValue } from "../../shared/vehicleTypes";

export const DEMO_SEED_KEY = "truckfixr-demo-seed-v1";
export const DEMO_SHARED_PASSWORD = "DemoPass123!";
export const DEMO_EMAIL_DOMAIN = "truckfixr-demo.example.com";

export type DemoBusinessStatus =
  | "active_road_ready"
  | "maintenance_due_soon"
  | "overdue_maintenance"
  | "urgent_repair_do_not_dispatch"
  | "out_of_service"
  | "compliance_risk";

export type DemoCompanyKey = "maple" | "peel" | "northstone";

export type DemoRole = "owner" | "manager" | "driver";

export type DemoUserSeed = {
  role: DemoRole;
  name: string;
  email: string;
};

export type DemoVehicleSeed = {
  id: string;
  unitNumber: string;
  assetType: "tractor" | "straight_truck" | "trailer" | "other";
  vehicleType: VehicleTypeValue;
  businessStatus: DemoBusinessStatus;
  year: number;
  make: string;
  model: string;
  engineMake?: string | null;
  fuelLabel: string;
  vin: string;
  licensePlate: string;
  mileage?: number;
  engineHours?: number;
  linkedPoweredVehicleId?: string | null;
  primaryDriverEmail?: string | null;
  notes?: string;
  demoIssue?: string;
  bodyStyle?: string;
  cabStyle?: string;
};

export type DemoCompanySeed = {
  key: DemoCompanyKey;
  name: string;
  segment: string;
  location: string;
  companyEmail: string;
  companyPhone: string;
  address: string;
  inviteCode: string;
  planName: "small_fleet" | "fleet_growth" | "fleet_pro";
  users: DemoUserSeed[];
  vehicles: DemoVehicleSeed[];
};

export const DEMO_COMPANIES: DemoCompanySeed[] = [
  {
    key: "maple",
    name: "Maple Route Logistics Ltd.",
    segment: "General freight / tractors and trailers",
    location: "Brampton, Ontario",
    companyEmail: "ops.maple@truckfixr-demo.example.com",
    companyPhone: "905-555-0101",
    address: "1200 Dispatch Crescent, Brampton, ON D5M 0A1",
    inviteCode: "MAPLEDEMO",
    planName: "small_fleet",
    users: [
      { role: "owner", name: "Olivia Brooks", email: "owner.maple@truckfixr-demo.example.com" },
      { role: "manager", name: "Marcus Reed", email: "manager.maple@truckfixr-demo.example.com" },
      { role: "driver", name: "Daniel Mensah", email: "driver1.maple@truckfixr-demo.example.com" },
      { role: "driver", name: "Peter Collins", email: "driver2.maple@truckfixr-demo.example.com" },
    ],
    vehicles: [
      {
        id: "demo-maple-mrl-101",
        unitNumber: "MRL-101",
        assetType: "tractor",
        vehicleType: "tractor",
        businessStatus: "urgent_repair_do_not_dispatch",
        year: 2021,
        make: "Volvo",
        model: "VNL 760",
        engineMake: "Volvo D13",
        fuelLabel: "Diesel",
        vin: "4V4NC9EH1MN000101",
        licensePlate: "DEMO-M101",
        mileage: 684000,
        engineHours: 16140,
        primaryDriverEmail: "driver1.maple@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        demoIssue: "DEF/aftertreatment warning with derate risk before dispatch.",
        cabStyle: "sleeper",
      },
      {
        id: "demo-maple-mrl-102",
        unitNumber: "MRL-102",
        assetType: "tractor",
        vehicleType: "tractor",
        businessStatus: "active_road_ready",
        year: 2020,
        make: "Freightliner",
        model: "Cascadia Day Cab",
        engineMake: "Detroit DD13",
        fuelLabel: "Diesel",
        vin: "3AKJHHDR4LS000102",
        licensePlate: "DEMO-M102",
        mileage: 512000,
        engineHours: 12890,
        primaryDriverEmail: "driver2.maple@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        cabStyle: "day_cab",
      },
      {
        id: "demo-maple-mrl-t201",
        unitNumber: "MRL-T201",
        assetType: "trailer",
        vehicleType: "dry_van_trailer",
        businessStatus: "compliance_risk",
        year: 2019,
        make: "Great Dane",
        model: "53 ft Dry Van",
        fuelLabel: "Not applicable",
        vin: "1GRAA0625KW000201",
        licensePlate: "DEMO-M201",
        linkedPoweredVehicleId: "demo-maple-mrl-102",
        primaryDriverEmail: "driver2.maple@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        demoIssue: "Annual safety inspection is due and daily trip inspection completion is at risk.",
      },
      {
        id: "demo-maple-mrl-t202",
        unitNumber: "MRL-T202",
        assetType: "trailer",
        vehicleType: "reefer_trailer",
        businessStatus: "maintenance_due_soon",
        year: 2020,
        make: "Utility",
        model: "3000R Reefer",
        fuelLabel: "Diesel reefer unit",
        vin: "1UYVS2536LU000202",
        licensePlate: "DEMO-M202",
        linkedPoweredVehicleId: "demo-maple-mrl-101",
        primaryDriverEmail: "driver1.maple@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        demoIssue: "Reefer unit PM and emissions service are due soon.",
      },
    ],
  },
  {
    key: "peel",
    name: "Peel Community Transport Inc.",
    segment: "Passenger transport / buses",
    location: "Mississauga, Ontario",
    companyEmail: "ops.peel@truckfixr-demo.example.com",
    companyPhone: "905-555-0202",
    address: "88 Community Shuttle Drive, Mississauga, ON P5L 0E2",
    inviteCode: "PEELDEMO",
    planName: "small_fleet",
    users: [
      { role: "owner", name: "Aisha Patel", email: "owner.peel@truckfixr-demo.example.com" },
      { role: "manager", name: "Samuel Thompson", email: "manager.peel@truckfixr-demo.example.com" },
      { role: "driver", name: "Grace Williams", email: "driver1.peel@truckfixr-demo.example.com" },
      { role: "driver", name: "Kevin Brown", email: "driver2.peel@truckfixr-demo.example.com" },
    ],
    vehicles: [
      {
        id: "demo-peel-pct-b301",
        unitNumber: "PCT-B301",
        assetType: "straight_truck",
        vehicleType: "bus",
        businessStatus: "maintenance_due_soon",
        year: 2021,
        make: "Blue Bird",
        model: "Vision Diesel",
        engineMake: "Cummins B6.7",
        fuelLabel: "Diesel",
        vin: "1BAKGCPA5MF000301",
        licensePlate: "DEMO-P301",
        mileage: 238000,
        engineHours: 7420,
        primaryDriverEmail: "driver1.peel@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        demoIssue: "Repeated brake and air system daily inspection defects need maintenance planning.",
        bodyStyle: "school_bus",
      },
      {
        id: "demo-peel-pct-b302",
        unitNumber: "PCT-B302",
        assetType: "straight_truck",
        vehicleType: "bus",
        businessStatus: "active_road_ready",
        year: 2022,
        make: "Thomas Built",
        model: "Saf-T-Liner C2",
        engineMake: "Cummins B6.7",
        fuelLabel: "Diesel",
        vin: "4UZAB2DC8NC000302",
        licensePlate: "DEMO-P302",
        mileage: 184000,
        engineHours: 6150,
        primaryDriverEmail: "driver2.peel@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        bodyStyle: "school_bus",
      },
      {
        id: "demo-peel-pct-401",
        unitNumber: "PCT-401",
        assetType: "straight_truck",
        vehicleType: "straight_truck",
        businessStatus: "active_road_ready",
        year: 2020,
        make: "Hino",
        model: "268",
        engineMake: "Hino J08E",
        fuelLabel: "Diesel",
        vin: "5PVNJ8JV7L4000401",
        licensePlate: "DEMO-P401",
        mileage: 321000,
        engineHours: 9680,
        primaryDriverEmail: "driver1.peel@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
      },
      {
        id: "demo-peel-pct-402",
        unitNumber: "PCT-402",
        assetType: "straight_truck",
        vehicleType: "straight_truck",
        businessStatus: "overdue_maintenance",
        year: 2019,
        make: "International",
        model: "MV607 Box Truck",
        engineMake: "Cummins B6.7",
        fuelLabel: "Diesel",
        vin: "3HAMMMMLXKL000402",
        licensePlate: "DEMO-P402",
        mileage: 276000,
        engineHours: 8610,
        primaryDriverEmail: "driver2.peel@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        demoIssue: "Preventive maintenance interval is overdue.",
        bodyStyle: "box_truck",
      },
      {
        id: "demo-peel-pct-t501",
        unitNumber: "PCT-T501",
        assetType: "trailer",
        vehicleType: "dry_van_trailer",
        businessStatus: "active_road_ready",
        year: 2018,
        make: "Wabash",
        model: "53 ft Dry Van",
        fuelLabel: "Not applicable",
        vin: "1JJV532W7JL000501",
        licensePlate: "DEMO-P501",
        linkedPoweredVehicleId: "demo-peel-pct-401",
        primaryDriverEmail: "driver2.peel@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
      },
      {
        id: "demo-peel-pct-t502",
        unitNumber: "PCT-T502",
        assetType: "trailer",
        vehicleType: "reefer_trailer",
        businessStatus: "active_road_ready",
        year: 2021,
        make: "Hyundai Translead",
        model: "Reefer Trailer",
        fuelLabel: "Diesel reefer unit",
        vin: "3H3V532C2MT000502",
        licensePlate: "DEMO-P502",
        linkedPoweredVehicleId: "demo-peel-pct-402",
        primaryDriverEmail: "driver2.peel@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
      },
    ],
  },
  {
    key: "northstone",
    name: "NorthStone Construction Fleet Ltd.",
    segment: "Construction fleet / dump, straight truck, day cab, service truck",
    location: "Vaughan, Ontario",
    companyEmail: "ops.northstone@truckfixr-demo.example.com",
    companyPhone: "905-555-0303",
    address: "405 Quarry Line, Vaughan, ON N5R 0K3",
    inviteCode: "NORTHDEMO",
    planName: "fleet_growth",
    users: [
      { role: "owner", name: "Michael Chen", email: "owner.northstone@truckfixr-demo.example.com" },
      { role: "manager", name: "Elena Rodriguez", email: "manager.northstone@truckfixr-demo.example.com" },
      { role: "driver", name: "Robert Singh", email: "driver1.northstone@truckfixr-demo.example.com" },
      { role: "driver", name: "James Walker", email: "driver2.northstone@truckfixr-demo.example.com" },
    ],
    vehicles: [
      {
        id: "demo-northstone-nsf-601",
        unitNumber: "NSF-601",
        assetType: "straight_truck",
        vehicleType: "straight_truck",
        businessStatus: "maintenance_due_soon",
        year: 2020,
        make: "Mack",
        model: "Granite",
        engineMake: "Mack MP7",
        fuelLabel: "Diesel",
        vin: "1M2GR4GC5LM000601",
        licensePlate: "DEMO-N601",
        mileage: 198000,
        engineHours: 6880,
        primaryDriverEmail: "driver1.northstone@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        demoIssue: "Hydraulic leak and PTO hesitation need attention before heavy site work.",
        bodyStyle: "dump_truck",
      },
      {
        id: "demo-northstone-nsf-602",
        unitNumber: "NSF-602",
        assetType: "tractor",
        vehicleType: "tractor",
        businessStatus: "active_road_ready",
        year: 2021,
        make: "Peterbilt",
        model: "579 Day Cab",
        engineMake: "PACCAR MX-13",
        fuelLabel: "Diesel",
        vin: "1XPBDP9X1MD000602",
        licensePlate: "DEMO-N602",
        mileage: 403000,
        engineHours: 11920,
        primaryDriverEmail: "driver1.northstone@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        cabStyle: "day_cab",
      },
      {
        id: "demo-northstone-nsf-603",
        unitNumber: "NSF-603",
        assetType: "tractor",
        vehicleType: "tractor",
        businessStatus: "active_road_ready",
        year: 2019,
        make: "Kenworth",
        model: "T680 Day Cab",
        engineMake: "PACCAR MX-13",
        fuelLabel: "Diesel",
        vin: "1XKYDP9X5KJ000603",
        licensePlate: "DEMO-N603",
        mileage: 487000,
        engineHours: 14260,
        primaryDriverEmail: "driver2.northstone@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        cabStyle: "day_cab",
      },
      {
        id: "demo-northstone-nsf-604",
        unitNumber: "NSF-604",
        assetType: "tractor",
        vehicleType: "tractor",
        businessStatus: "active_road_ready",
        year: 2022,
        make: "International",
        model: "LT625",
        engineMake: "Cummins X15",
        fuelLabel: "Diesel",
        vin: "3HSDZAPR5NN000604",
        licensePlate: "DEMO-N604",
        mileage: 355000,
        engineHours: 10880,
        primaryDriverEmail: "driver2.northstone@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        cabStyle: "sleeper",
      },
      {
        id: "demo-northstone-nsf-605",
        unitNumber: "NSF-605",
        assetType: "straight_truck",
        vehicleType: "straight_truck",
        businessStatus: "overdue_maintenance",
        year: 2018,
        make: "Freightliner",
        model: "M2 106",
        engineMake: "Cummins B6.7",
        fuelLabel: "Diesel",
        vin: "1FVACWFC8JH000605",
        licensePlate: "DEMO-N605",
        mileage: 439000,
        engineHours: 13150,
        primaryDriverEmail: "driver2.northstone@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        demoIssue: "Recurring no-start and charging-system complaints with overdue PM.",
      },
      {
        id: "demo-northstone-nsf-606",
        unitNumber: "NSF-606",
        assetType: "straight_truck",
        vehicleType: "straight_truck",
        businessStatus: "active_road_ready",
        year: 2020,
        make: "Ford",
        model: "F-550 Diesel Service Body",
        engineMake: "Ford Power Stroke",
        fuelLabel: "Diesel",
        vin: "1FD0W5HT6LE000606",
        licensePlate: "DEMO-N606",
        mileage: 216000,
        engineHours: 5920,
        primaryDriverEmail: "driver2.northstone@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        demoIssue: "Preventive maintenance is due soon for filters and fluids.",
        bodyStyle: "service_truck",
      },
      {
        id: "demo-northstone-nsf-t701",
        unitNumber: "NSF-T701",
        assetType: "trailer",
        vehicleType: "dry_van_trailer",
        businessStatus: "active_road_ready",
        year: 2017,
        make: "Great Dane",
        model: "53 ft Dry Van",
        fuelLabel: "Not applicable",
        vin: "1GRAA0624HW000701",
        licensePlate: "DEMO-N701",
        linkedPoweredVehicleId: "demo-northstone-nsf-602",
        primaryDriverEmail: "driver1.northstone@truckfixr-demo.example.com",
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
      },
      {
        id: "demo-northstone-nsf-t702",
        unitNumber: "NSF-T702",
        assetType: "tractor",
        vehicleType: "tractor",
        businessStatus: "out_of_service",
        year: 2020,
        make: "Volvo",
        model: "VNL 860",
        engineMake: "Volvo D13",
        fuelLabel: "Diesel",
        vin: "4V4NC9EH7LN000702",
        licensePlate: "DEMO-N702",
        mileage: 596000,
        engineHours: 18220,
        notes: "Synthetic demo VIN only; this record is for seeding and may not decode through NHTSA.",
        demoIssue: "Unresolved engine derate with active diagnostic alert. Unit is out of service.",
        cabStyle: "sleeper",
      },
    ],
  },
];

export const DEMO_COMPANY_NAMES = DEMO_COMPANIES.map((company) => company.name);
export const DEMO_COMPANY_EMAILS = DEMO_COMPANIES.map((company) => company.companyEmail);
export const DEMO_INVITE_CODES = DEMO_COMPANIES.map((company) => company.inviteCode);
export const DEMO_USER_EMAILS = DEMO_COMPANIES.flatMap((company) =>
  company.users.map((user) => user.email)
);
export const DEMO_VEHICLE_IDS = DEMO_COMPANIES.flatMap((company) =>
  company.vehicles.map((vehicle) => vehicle.id)
);

export function isDemoEmail(email: string | null | undefined) {
  return Boolean(email && email.trim().toLowerCase().endsWith(`@${DEMO_EMAIL_DOMAIN}`));
}

export function getDemoCompanyByKey(key: DemoCompanyKey) {
  return DEMO_COMPANIES.find((company) => company.key === key) ?? null;
}
