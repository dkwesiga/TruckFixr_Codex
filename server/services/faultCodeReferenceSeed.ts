import { and, eq, isNull } from "drizzle-orm";
import { faultCodeReferences, faultCodeReferenceSources } from "../../drizzle/schema";
import { getDb } from "../db";
import { normalizeFaultCodeForLookup } from "./faultCodeReferences";

type SeedRiskLevel = "low" | "medium" | "high" | "critical";
type SeedCodeSystem = "SPN_FMI" | "OBD_DTC";

type StarterFaultCodeReferenceDefinition = {
  key: string;
  codeSystem: SeedCodeSystem;
  code: string;
  category:
    | "aftertreatment/emissions"
    | "brake/air pressure"
    | "oil pressure"
    | "coolant/overheating"
    | "derate/shutdown";
  title: string;
  summary: string;
  recommendedChecks: string[];
  riskLevel: SeedRiskLevel;
  metadata?: Record<string, unknown>;
};

type StarterFaultCodeSourceDefinition = {
  key: string;
  title: string;
  sourceType: string;
  urlOrPath: string;
  metadata?: Record<string, unknown>;
  references: StarterFaultCodeReferenceDefinition[];
};

type Database = NonNullable<Awaited<ReturnType<typeof getDb>>>;

export const STARTER_FAULT_CODE_SEED_VERSION = "2026-05-10";

export const STARTER_FAULT_CODE_REFERENCE_SEED: StarterFaultCodeSourceDefinition[] = [
  {
    key: "detroit-spn-4364-fmi-18",
    title: "Detroit Diesel SPN 4364 FMI 18 diagnostic bulletin",
    sourceType: "starter_seed_nhtsa_tsb",
    urlOrPath: "https://static.nhtsa.gov/odi/tsbs/2013/MC-10140873-9999.pdf",
    metadata: {
      publisher: "Detroit Diesel / NHTSA",
      documentFocus: "SCR NOx conversion efficiency",
    },
    references: [
      {
        key: "spn-4364-fmi-18",
        codeSystem: "SPN_FMI",
        code: "SPN 4364 FMI 18",
        category: "aftertreatment/emissions",
        title: "SCR NOx conversion efficiency very low",
        summary:
          "Starter reference for SCR conversion-efficiency faults that commonly point to DEF quality, dosing, NOx sensing, or aftertreatment flow issues before a harder inducement stage appears.",
        recommendedChecks: [
          "Verify DEF concentration and check for contamination with fuel, oil, or water.",
          "Inspect DEF lines, dosing hardware, and visible exhaust leaks or kinks around the SCR system.",
          "Compare inlet and outlet NOx sensor readings and confirm temperatures/load support valid SCR diagnostics.",
        ],
        riskLevel: "high",
        metadata: {
          symptomKeywords: ["check engine", "DEF", "SCR", "NOx", "low power"],
          reviewHint: "Confirm OEM applicability and expected drivability impact before approval.",
        },
      },
    ],
  },
  {
    key: "mercedes-p20ee",
    title: "Mercedes-Benz P20EE SCR efficiency bulletin",
    sourceType: "starter_seed_nhtsa_tsb",
    urlOrPath: "https://static.nhtsa.gov/odi/tsbs/2025/MC-11021173-0001.pdf",
    metadata: {
      publisher: "Mercedes-Benz / NHTSA",
      documentFocus: "SCR catalyst efficiency",
    },
    references: [
      {
        key: "p20ee",
        codeSystem: "OBD_DTC",
        code: "P20EE",
        category: "aftertreatment/emissions",
        title: "SCR catalytic converter efficiency below expected threshold",
        summary:
          "Starter reference for diesel SCR efficiency faults where poor DEF dosing, biased NOx feedback, low catalyst temperature, or catalyst contamination can trigger emissions warnings and progressive inducement behavior.",
        recommendedChecks: [
          "Confirm DEF quality, level, and dosing performance before replacing aftertreatment components.",
          "Inspect NOx sensors and compare readings against operating temperature and load conditions.",
          "Check for low-temperature operation, exhaust leaks, or catalyst contamination from oil or coolant.",
        ],
        riskLevel: "high",
        metadata: {
          symptomKeywords: ["P20EE", "SCR efficiency", "DEF warning", "emissions"],
          reviewHint: "Validate whether this generic OBD record maps cleanly to the fleets you plan to support.",
        },
      },
    ],
  },
  {
    key: "mack-p2463",
    title: "Mack P2463 DPF soot accumulation bulletin",
    sourceType: "starter_seed_nhtsa_tsb",
    urlOrPath: "https://static.nhtsa.gov/odi/tsbs/2020/MC-10173173-0001.pdf",
    metadata: {
      publisher: "Mack Trucks / NHTSA",
      documentFocus: "DPF soot accumulation",
    },
    references: [
      {
        key: "p2463",
        codeSystem: "OBD_DTC",
        code: "P2463",
        category: "aftertreatment/emissions",
        title: "Diesel particulate filter soot accumulation",
        summary:
          "Starter reference for DPF soot-load restrictions that often show up with low-power complaints when regeneration is interrupted, inhibited, or the aftertreatment dosing path is not functioning correctly.",
        recommendedChecks: [
          "Review soot load, recent regen history, and whether parked or passive regeneration has been inhibited.",
          "Inspect the aftertreatment hydrocarbon doser and related plumbing for poor dosing or restriction.",
          "Confirm differential pressure sensing and lines before replacing the DPF or catalyst hardware.",
        ],
        riskLevel: "high",
        metadata: {
          symptomKeywords: ["P2463", "DPF", "soot", "regen", "low power"],
          reviewHint: "Adjust the recommended checks if your supported engines use a different regen sequence.",
        },
      },
    ],
  },
  {
    key: "eaton-spn-37-fmi-18",
    title: "Endurant low transmission air pressure bulletin",
    sourceType: "starter_seed_nhtsa_tsb",
    urlOrPath: "https://static.nhtsa.gov/odi/tsbs/2021/MC-10216256-9999.pdf",
    metadata: {
      publisher: "Eaton / NHTSA",
      documentFocus: "Transmission air supply pressure",
    },
    references: [
      {
        key: "spn-37-fmi-18",
        codeSystem: "SPN_FMI",
        code: "SPN 37 FMI 18",
        category: "brake/air pressure",
        title: "Transmission air supply pressure below operating range",
        summary:
          "Starter reference for low-air events tied to the vehicle air system, especially when repeated brake use or system leakage prevents normal air pressure from recovering before shifting or maneuvering.",
        recommendedChecks: [
          "Verify the primary air system reaches normal operating pressure before selecting a gear.",
          "Inspect the air system for leaks, compressor or dryer concerns, and pressure-recovery issues after repeated brake application.",
          "Separate transmission strategy complaints from genuine low-air system faults before component replacement.",
        ],
        riskLevel: "high",
        metadata: {
          symptomKeywords: ["low air", "air pressure", "brake use", "shift inhibit"],
          reviewHint: "This is air-system-oriented and should be approved only if it fits your supported powertrain set.",
        },
      },
    ],
  },
  {
    key: "mack-spn-100-fmi-1",
    title: "Mack low oil pressure bulletin",
    sourceType: "starter_seed_nhtsa_tsb",
    urlOrPath: "https://static.nhtsa.gov/odi/tsbs/2013/SB-10083820-6903.pdf",
    metadata: {
      publisher: "Mack Trucks / NHTSA",
      documentFocus: "Low oil pressure diagnostics",
    },
    references: [
      {
        key: "spn-100-fmi-1",
        codeSystem: "SPN_FMI",
        code: "SPN 100 FMI 1",
        category: "oil pressure",
        title: "Engine oil pressure below normal operating range",
        summary:
          "Starter reference for low-oil-pressure faults where the first priority is confirming actual mechanical pressure and protecting the engine from damage before extended operation continues.",
        recommendedChecks: [
          "Verify oil pressure with a mechanical gauge instead of trusting the electronic signal alone.",
          "Check oil level, condition, and signs of dilution or aeration before deeper teardown.",
          "Inspect the pressure reduction valve, pump path, and filter-related restrictions if mechanical pressure is low.",
        ],
        riskLevel: "critical",
        metadata: {
          symptomKeywords: ["oil pressure", "engine shutdown lamp", "low oil"],
          reviewHint: "Keep approval language conservative because true low oil pressure can become catastrophic quickly.",
        },
      },
    ],
  },
  {
    key: "mack-spn-110-fmi-0",
    title: "Mack engine coolant over-temperature bulletin",
    sourceType: "starter_seed_nhtsa_tsb",
    urlOrPath: "https://static.nhtsa.gov/odi/tsbs/2020/MC-10173143-0001.pdf",
    metadata: {
      publisher: "Mack Trucks / NHTSA",
      documentFocus: "Engine coolant over-temperature condition",
    },
    references: [
      {
        key: "spn-110-fmi-0",
        codeSystem: "SPN_FMI",
        code: "SPN 110 FMI 0",
        category: "coolant/overheating",
        title: "Engine coolant over-temperature condition",
        summary:
          "Starter reference for overheating events that can trigger high derate or shutdown behavior when coolant flow, fan control, radiator performance, or internal engine sealing is compromised.",
        recommendedChecks: [
          "Stop to cool the engine if temperature is actively climbing or coolant is venting.",
          "Inspect coolant level, fan engagement, thermostat operation, radiator flow, and water-pump performance.",
          "Check for oil-coolant cross-contamination, oil-cooler problems, or head-gasket symptoms if overheating repeats.",
        ],
        riskLevel: "critical",
        metadata: {
          symptomKeywords: ["overheat", "coolant temp", "shutdown", "steam"],
          reviewHint: "Approval should keep the stop-driving guidance strong whenever the engine is actively overheating.",
        },
      },
    ],
  },
  {
    key: "vw-p204f",
    title: "Volkswagen P204F reductant system performance bulletin",
    sourceType: "starter_seed_nhtsa_tsb",
    urlOrPath: "https://static.nhtsa.gov/odi/tsbs/2016/MC-10239825-9999.pdf",
    metadata: {
      publisher: "Volkswagen / NHTSA",
      documentFocus: "Reductant system performance and no-restart warning",
    },
    references: [
      {
        key: "p204f",
        codeSystem: "OBD_DTC",
        code: "P204F",
        category: "derate/shutdown",
        title: "Reductant system performance with inducement or no-restart warning",
        summary:
          "Starter reference for reductant-system performance faults that commonly appear with countdown or no-restart messaging, signaling that the SCR/DEF issue needs repair before the vehicle becomes operationally restricted.",
        recommendedChecks: [
          "Record any remaining miles-to-no-start or inducement warnings before clearing faults.",
          "Verify DEF quality, heater/pump activity, and dosing function before replacing control modules.",
          "Confirm software level and only clear the event after the underlying SCR fault path has been corrected.",
        ],
        riskLevel: "high",
        metadata: {
          symptomKeywords: ["P204F", "no restart", "inducement", "DEF"],
          reviewHint: "Use this as a cross-platform starter only if your supported fleets report OBD-style reductant warnings.",
        },
      },
    ],
  },
  {
    key: "navistar-spn-5246-inducement",
    title: "Navistar SCR inducement progression bulletin",
    sourceType: "starter_seed_nhtsa_tsb",
    urlOrPath: "https://static.nhtsa.gov/odi/tsbs/2021/MC-10201756-0001.pdf",
    metadata: {
      publisher: "Navistar / NHTSA",
      documentFocus: "SCR inducement and derate progression",
    },
    references: [
      {
        key: "spn-5246-fmi-15",
        codeSystem: "SPN_FMI",
        code: "SPN 5246 FMI 15",
        category: "derate/shutdown",
        title: "SCR operator inducement severity stage 1",
        summary:
          "Starter reference for the early inducement stage where an active SCR fault has progressed into an initial derate and the root cause should be corrected before the vehicle escalates into harder limitations.",
        recommendedChecks: [
          "Capture the active SCR root fault that triggered inducement before clearing codes.",
          "Confirm DEF level, quality, and tamper-related causes before replacing hardware.",
          "Treat this as a repair-priority event because continued operation can escalate the derate stage.",
        ],
        riskLevel: "high",
        metadata: {
          symptomKeywords: ["inducement", "25% derate", "DEF fault", "SCR"],
          reviewHint: "Approval should mention that SPN 5246 is usually downstream of another active SCR fault.",
        },
      },
      {
        key: "spn-5246-fmi-16",
        codeSystem: "SPN_FMI",
        code: "SPN 5246 FMI 16",
        category: "derate/shutdown",
        title: "SCR operator inducement severity stage 2",
        summary:
          "Starter reference for the escalated inducement stage where the derate has deepened and the vehicle should be routed to repair before the final low-speed restriction is triggered.",
        recommendedChecks: [
          "Document the triggering SCR fault and current derate behavior for the technician or fleet manager.",
          "Plan controlled movement to repair instead of repeated resets or continued route service.",
          "Verify the final inducement trigger is not imminent before authorizing any additional operation.",
        ],
        riskLevel: "critical",
        metadata: {
          symptomKeywords: ["40% derate", "inducement", "SCR", "reduced power"],
          reviewHint: "Keep approval language conservative because this is an escalation stage, not a normal emissions warning.",
        },
      },
      {
        key: "spn-5246-fmi-0",
        codeSystem: "SPN_FMI",
        code: "SPN 5246 FMI 0",
        category: "derate/shutdown",
        title: "SCR operator inducement final severe derate",
        summary:
          "Starter reference for the final inducement stage where the vehicle is heavily speed-limited and the SCR root cause must be repaired and validated before returning the unit to normal service.",
        recommendedChecks: [
          "Treat the event as a severe operational restriction and stop normal dispatching.",
          "Repair the upstream SCR or DEF root fault instead of only clearing the inducement code.",
          "Validate the repair by confirming inducement staging and active aftertreatment faults are gone afterward.",
        ],
        riskLevel: "critical",
        metadata: {
          symptomKeywords: ["5 mph derate", "shutdown", "final inducement", "SCR"],
          reviewHint: "Approval should preserve very explicit severity language for dispatch and driver safety decisions.",
        },
      },
    ],
  },
];

export function flattenStarterFaultCodeReferenceSeed() {
  return STARTER_FAULT_CODE_REFERENCE_SEED.flatMap((source) =>
    source.references.map((reference) => ({
      sourceKey: source.key,
      sourceTitle: source.title,
      sourceType: source.sourceType,
      sourceUrlOrPath: source.urlOrPath,
      sourceMetadata: source.metadata ?? {},
      referenceKey: reference.key,
      codeSystem: reference.codeSystem,
      code: reference.code,
      normalizedCode: normalizeFaultCodeForLookup(reference.code),
      category: reference.category,
      title: reference.title,
      summary: reference.summary,
      recommendedChecks: reference.recommendedChecks,
      riskLevel: reference.riskLevel,
      metadata: reference.metadata ?? {},
    }))
  );
}

function buildSourceMetadata(source: StarterFaultCodeSourceDefinition) {
  return {
    ...(source.metadata ?? {}),
    seed: {
      version: STARTER_FAULT_CODE_SEED_VERSION,
      sourceKey: source.key,
      starter: true,
    },
  };
}

function buildReferenceMetadata(
  source: StarterFaultCodeSourceDefinition,
  reference: StarterFaultCodeReferenceDefinition
) {
  return {
    ...(reference.metadata ?? {}),
    seed: {
      version: STARTER_FAULT_CODE_SEED_VERSION,
      sourceKey: source.key,
      referenceKey: reference.key,
      starter: true,
    },
  };
}

async function findExistingSource(db: Database, source: StarterFaultCodeSourceDefinition) {
  const query = db
    .select({
      id: faultCodeReferenceSources.id,
    })
    .from(faultCodeReferenceSources)
    .where(
      source.urlOrPath
        ? and(
            eq(faultCodeReferenceSources.title, source.title),
            eq(faultCodeReferenceSources.sourceType, source.sourceType),
            eq(faultCodeReferenceSources.urlOrPath, source.urlOrPath)
          )
        : and(
            eq(faultCodeReferenceSources.title, source.title),
            eq(faultCodeReferenceSources.sourceType, source.sourceType),
            isNull(faultCodeReferenceSources.urlOrPath)
          )
    )
    .limit(1);

  const [existing] = await query;
  return existing ?? null;
}

async function findExistingReference(
  db: Database,
  sourceId: number,
  reference: StarterFaultCodeReferenceDefinition
) {
  const [existing] = await db
    .select({
      id: faultCodeReferences.id,
    })
    .from(faultCodeReferences)
    .where(
      and(
        eq(faultCodeReferences.sourceId, sourceId),
        eq(faultCodeReferences.codeSystem, reference.codeSystem),
        eq(faultCodeReferences.normalizedCode, normalizeFaultCodeForLookup(reference.code))
      )
    )
    .limit(1);

  return existing ?? null;
}

export async function seedStarterFaultCodeReferences(input?: { db?: Database }) {
  const db = input?.db ?? (await getDb());
  if (!db) {
    throw new Error(
      "DATABASE_URL is required to seed starter fault-code references because the review queue is stored in Postgres."
    );
  }

  let createdSources = 0;
  let existingSources = 0;
  let createdReferences = 0;
  let existingReferences = 0;

  for (const source of STARTER_FAULT_CODE_REFERENCE_SEED) {
    const existingSource = await findExistingSource(db, source);
    let sourceId = existingSource?.id ?? null;

    if (!sourceId) {
      const [createdSource] = await db
        .insert(faultCodeReferenceSources)
        .values({
          title: source.title,
          sourceType: source.sourceType,
          urlOrPath: source.urlOrPath,
          reviewStatus: "needs_review",
          reviewerUserId: null,
          approvedAt: null,
          metadata: buildSourceMetadata(source),
          importedAt: new Date(),
          createdAt: new Date(),
          updatedAt: new Date(),
        })
        .returning({ id: faultCodeReferenceSources.id });

      sourceId = createdSource.id;
      createdSources += 1;
    } else {
      existingSources += 1;
    }

    for (const reference of source.references) {
      const existingReference = await findExistingReference(db, sourceId, reference);
      if (existingReference) {
        existingReferences += 1;
        continue;
      }

      await db.insert(faultCodeReferences).values({
        sourceId,
        codeSystem: reference.codeSystem,
        code: reference.code,
        normalizedCode: normalizeFaultCodeForLookup(reference.code),
        category: reference.category,
        title: reference.title,
        summary: reference.summary,
        recommendedChecks: reference.recommendedChecks,
        riskLevel: reference.riskLevel,
        reviewStatus: "needs_review",
        reviewerUserId: null,
        approvedAt: null,
        archivedAt: null,
        metadata: buildReferenceMetadata(source, reference),
        createdAt: new Date(),
        updatedAt: new Date(),
      });
      createdReferences += 1;
    }
  }

  return {
    seedVersion: STARTER_FAULT_CODE_SEED_VERSION,
    totalSources: STARTER_FAULT_CODE_REFERENCE_SEED.length,
    totalReferences: flattenStarterFaultCodeReferenceSeed().length,
    createdSources,
    existingSources,
    createdReferences,
    existingReferences,
  };
}
