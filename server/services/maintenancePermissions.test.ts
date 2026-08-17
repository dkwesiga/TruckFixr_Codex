import { beforeEach, describe, expect, it, vi } from "vitest";

// RBAC test (§27 "Role Enforcement"): a Service Advisor grant must never let
// its holder verify a technical Outcome; a Technician grant must. Owners and
// managers always pass implicitly regardless of any grant row.

const { store, mockDb } = vi.hoisted(() => {
  const store = { grants: [] as any[] };

  const chain = (rows: any[]) => {
    const c: any = {
      _rows: rows,
      from() {
        return c;
      },
      where(pred: any) {
        c._rows = c._rows.filter(pred?.__match ?? (() => true));
        return c;
      },
      limit: async (n: number) => c._rows.slice(0, n),
    };
    return c;
  };

  return {
    store,
    mockDb: {
      getDb: async () => ({
        select: () => ({ from: () => chain([...store.grants]) }),
      }),
    },
  };
});

vi.mock("../db", () => ({ getDb: mockDb.getDb }));
vi.mock("../../drizzle/schema", () => {
  const mk = (name: string) =>
    new Proxy({ _name: name }, { get: (t: any, prop: string) => (prop === "_name" ? name : { __col: prop }) });
  return { maintenancePermissions: mk("maintenancePermissions") };
});
vi.mock("drizzle-orm", () => ({
  and: (...ps: any[]) => ({ __match: (r: any) => ps.every((p) => (p?.__match ? p.__match(r) : true)) }),
  eq: (col: any, val: any) => ({ __match: (r: any) => r[col?.__col ?? col] === val }),
}));
vi.mock("./maintenanceActivityLog", () => ({ logMaintenanceActivity: async () => {} }));

const canManageCompanyOperationsMock = vi.fn(async () => false);
vi.mock("./companyAccess", () => ({
  canManageCompanyOperations: (...args: unknown[]) => canManageCompanyOperationsMock(...args),
}));

import { hasMaintenanceCapability } from "./maintenancePermissions";
import { MAINTENANCE_CAPABILITIES, SERVICE_ADVISOR_CAPABILITIES, TECHNICIAN_CAPABILITIES } from "@shared/maintenance/permissions";

const FLEET = 1;
const SERVICE_ADVISOR = { id: 10, role: "driver" };
const TECHNICIAN = { id: 11, role: "driver" };
const MANAGER = { id: 12, role: "manager" };

beforeEach(() => {
  store.grants = [
    { fleetId: FLEET, userId: SERVICE_ADVISOR.id, capabilitiesJson: SERVICE_ADVISOR_CAPABILITIES, active: true },
    { fleetId: FLEET, userId: TECHNICIAN.id, capabilitiesJson: TECHNICIAN_CAPABILITIES, active: true },
  ];
  canManageCompanyOperationsMock.mockReset();
  canManageCompanyOperationsMock.mockImplementation(async ({ user }: any) => user.role === "manager" || user.role === "owner");
});

describe("hasMaintenanceCapability", () => {
  it("never allows a Service Advisor grant to verify an Outcome", async () => {
    const allowed = await hasMaintenanceCapability({
      fleetId: FLEET,
      user: SERVICE_ADVISOR,
      capability: MAINTENANCE_CAPABILITIES.verifyOutcome,
    });
    expect(allowed).toBe(false);
  });

  it("allows a Technician grant to verify an Outcome", async () => {
    const allowed = await hasMaintenanceCapability({
      fleetId: FLEET,
      user: TECHNICIAN,
      capability: MAINTENANCE_CAPABILITIES.verifyOutcome,
    });
    expect(allowed).toBe(true);
  });

  it("lets a Service Advisor grant create a case", async () => {
    const allowed = await hasMaintenanceCapability({
      fleetId: FLEET,
      user: SERVICE_ADVISOR,
      capability: MAINTENANCE_CAPABILITIES.createCase,
    });
    expect(allowed).toBe(true);
  });

  it("owners/managers always pass regardless of any grant row", async () => {
    const allowed = await hasMaintenanceCapability({
      fleetId: FLEET,
      user: MANAGER,
      capability: MAINTENANCE_CAPABILITIES.verifyOutcome,
    });
    expect(allowed).toBe(true);
  });

  it("denies a user with no grant at all", async () => {
    const allowed = await hasMaintenanceCapability({
      fleetId: FLEET,
      user: { id: 999, role: "driver" },
      capability: MAINTENANCE_CAPABILITIES.createCase,
    });
    expect(allowed).toBe(false);
  });
});
