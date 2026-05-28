import { useMemo } from "react";
import { useLocation } from "wouter";
import AppLogo from "@/components/AppLogo";
import OwnerOperatorGate from "@/components/OwnerOperatorGate";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { useAuthContext } from "@/hooks/useAuthContext";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { trpc } from "@/lib/trpc";
import { isOwnerOperatorEnabled } from "@/lib/ownerOperator";
import { ChevronLeft, Printer } from "lucide-react";

type DvirRow = {
  code: string;
  item: string;
  originalItem: string;
  categoryLabel?: string;
  defectCode: string;
  statusLabel?: string;
  defectMarked: boolean;
  repairedMarked: boolean;
  severity?: string | null;
  note?: string;
};

function valueOrLine(value: unknown) {
  const text = typeof value === "string" ? value.trim() : value == null ? "" : String(value);
  return text || "\u00a0";
}

function CheckMark({ checked }: { checked: boolean }) {
  return <span className="font-mono text-base leading-none">{checked ? "X" : ""}</span>;
}

function InspectionStatusMark({ defectMarked }: { defectMarked: boolean }) {
  return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold [&>span:first-child]:hidden ${
      defectMarked ? "bg-red-100 text-red-700" : "bg-emerald-100 text-emerald-700"
    }`}>
      <span className="text-xs leading-none">{defectMarked ? "✗" : "✓"}</span>
      <span className="text-xs leading-none">{defectMarked ? "✕" : "✓"}</span>
      <span>{defectMarked ? "Defect" : "Pass"}</span>
    </span>
  );
}

function DvirRows({ rows, minimumRows = 4 }: { rows: DvirRow[]; minimumRows?: number }) {
  return (
    <tbody>
      {rows.map((row, index) => (
        <tr key={`${row.code}-${row.originalItem}-${index}`} className="border-b border-black">
          <td className="w-24 border-r border-black px-1 py-1 align-top text-[11px]">{row.defectCode}</td>
          <td className="w-8 border-r border-black px-1 py-1 text-center align-top">
            <CheckMark checked={row.defectMarked} />
          </td>
          <td className="w-8 border-r border-black px-1 py-1 text-center align-top">
            <CheckMark checked={row.repairedMarked} />
          </td>
          <td className="w-12 border-r border-black px-1 py-1 text-center align-top text-[11px]">{row.code}</td>
          <td className="px-2 py-1 align-top text-[11px]">
            <div className="flex flex-wrap items-center gap-2">
              <div className="font-semibold">{row.item}</div>
              <InspectionStatusMark defectMarked={row.defectMarked} />
            </div>
            <div className="mt-0.5 text-[10px] leading-snug">
              {row.originalItem}
              {row.defectMarked && row.severity ? ` | ${row.severity}` : ""}
              {row.defectMarked && row.note ? ` | ${row.note}` : ""}
            </div>
          </td>
        </tr>
      ))}
      {Array.from({ length: Math.max(0, minimumRows - rows.length) }).map((_, index) => (
        <tr key={`blank-${index}`} className="border-b border-black">
          <td className="border-r border-black px-1 py-1">&nbsp;</td>
          <td className="border-r border-black px-1 py-1">&nbsp;</td>
          <td className="border-r border-black px-1 py-1">&nbsp;</td>
          <td className="border-r border-black px-1 py-1">&nbsp;</td>
          <td className="px-2 py-1">&nbsp;</td>
        </tr>
      ))}
    </tbody>
  );
}

function InspectionReportDvirContent() {
  const [, navigate] = useLocation();
  const { user } = useAuthContext();
  const inspectionId = useMemo(() => {
    const match = window.location.pathname.match(/inspection-report\/(\d+)/);
    return match ? Number(match[1]) : 0;
  }, []);
  const reportQuery = trpc.inspections.getDvirReport.useQuery(
    { inspectionId },
    { enabled: inspectionId > 0 }
  );
  const report = reportQuery.data as any;
  const role = String(user?.role ?? "");
  if (user?.role === "owner" && !isOwnerOperatorEnabled(user)) {
    return <OwnerOperatorGate />;
  }
  const fallbackPath =
    role === "driver" || isOwnerOperatorEnabled(user)
      ? "/driver"
      : role === "manager" || role === "owner"
        ? "/manager"
        : "/app";

  function handleBack() {
    if (typeof window !== "undefined" && window.history.length > 1) {
      const currentPath = window.location.pathname;
      window.history.back();
      window.setTimeout(() => {
        if (window.location.pathname === currentPath) {
          navigate(fallbackPath);
        }
      }, 150);
      return;
    }
    navigate(fallbackPath);
  }

  if (reportQuery.isLoading) {
    return (
      <div className="app-shell min-h-screen px-4 py-8">
        <Card className="mx-auto max-w-4xl p-6 text-sm text-slate-600">Loading inspection report...</Card>
      </div>
    );
  }

  if (!report) {
    return (
      <div className="app-shell min-h-screen px-4 py-8">
        <Card className="mx-auto max-w-4xl p-6">
          <p className="text-sm text-slate-600">Inspection report not found or unavailable.</p>
          <Button className="mt-4" variant="outline" onClick={handleBack}>
            <ChevronLeft className="mr-2 h-4 w-4" />
            Back
          </Button>
        </Card>
      </div>
    );
  }

  const tractorRows = (report.tractorRows ?? []) as DvirRow[];
  const trailerRows = (report.trailerRows ?? []) as DvirRow[];
  const sheetSections = (report.sheetSections ?? []) as Array<{ label: string; rows: DvirRow[] }>;
  const defects = (report.defectsNotCodedAbove ?? []) as string[];
  const flags = (report.flags ?? []) as Array<{ message?: string }>;
  const isTractor = report.inspectionSheetType === "tractor";
  const trailerInspected = report.trailerInspected === true;

  // For Ontario DVIR (tractor): combine all rows under Part A, with trailer rows as Part B if present
  const ontarioSections = isTractor
    ? [
        { label: "Part A – Power Unit (Tractor)", rows: sheetSections.length > 0 ? sheetSections.flatMap((s) => s.rows) : (tractorRows.length > 0 ? tractorRows : []) },
        ...(trailerInspected && trailerRows.length > 0
          ? [{ label: "Part B – Trailer (if applicable)", rows: trailerRows }]
          : []),
      ].filter((s) => s.rows.length > 0)
    : sheetSections.length > 0
      ? sheetSections
      : [
          { label: "Tractor / Truck", rows: tractorRows },
          { label: "Trailer / Load", rows: trailerRows },
        ].filter((s) => s.rows.length > 0);

  return (
    <div className="min-h-screen bg-slate-100 px-3 py-4 print:bg-white">
      <div className="mx-auto mb-4 flex max-w-6xl flex-wrap items-center justify-between gap-3 print:hidden">
        <Button variant="outline" onClick={handleBack}>
          <ChevronLeft className="mr-2 h-4 w-4" />
          Back
        </Button>
        <Button onClick={() => window.print()}>
          <Printer className="mr-2 h-4 w-4" />
          Print report
        </Button>
      </div>

      <main className="mx-auto max-w-6xl border-2 border-black bg-white p-4 font-sans text-black shadow-sm print:border print:shadow-none">
        {/* Header */}
        <div className="mb-2 flex items-center justify-between gap-4 border-b border-black pb-2">
          <div className="w-48">
            <AppLogo imageClassName="h-12 w-auto" href="/driver" />
          </div>
          <div className="text-center">
            <h1 className="text-xl font-black uppercase tracking-wide">Driver&apos;s Vehicle Inspection Report</h1>
            {isTractor ? (
              <p className="text-[11px] uppercase tracking-[0.16em]">Ontario Regulation 199/07 — Highway Traffic Act</p>
            ) : (
              <p className="text-[11px] uppercase tracking-[0.16em]">TruckFixr verified DVIR record</p>
            )}
          </div>
          <div className="w-48 text-right text-[11px]">
            <p>Report #{report.inspectionId}</p>
            <p>Integrity {report.status.integrityScore}/100</p>
          </div>
        </div>

        {/* Identification fields */}
        <section className="grid gap-x-6 gap-y-1 text-xs md:grid-cols-2">
          <div>
            <span className="font-bold">Carrier Name &amp; Address: </span>
            <span className="border-b border-black px-2">{valueOrLine(report.company.name)}</span>
            {report.company.address ? (
              <span className="border-b border-black px-2 ml-2">{valueOrLine(report.company.address)}</span>
            ) : null}
          </div>
          <div className="text-right">
            <span className="font-bold">Vehicle Type: </span>
            <span className="border-b border-black px-2">{valueOrLine(isTractor ? "Tractor" : report.vehicle.assetType)}</span>
          </div>
          <div>
            <span className="mr-4 font-semibold">&#10003; Pre-trip</span>
            <span className="mr-4 text-slate-400">Post-trip</span>
            <span className="font-bold">Time: </span>
            <span className="border-b border-black px-2">{valueOrLine(report.time)}</span>
          </div>
          <div className="text-right">
            <span className="font-bold">Date: </span>
            <span className="border-b border-black px-2">{valueOrLine(report.date)}</span>
            <span className="ml-4 font-bold">Location: </span>
            <span className="border-b border-black px-2">{valueOrLine(report.location)}</span>
          </div>
          <div>
            <span className="font-bold">{isTractor ? "Tractor" : "Truck"} Lic. No.: </span>
            <span className="border-b border-black px-2">{valueOrLine(report.vehicle.licensePlate)}</span>
            <span className="ml-3 font-bold">Unit No.: </span>
            <span className="border-b border-black px-2">{valueOrLine(report.vehicle.unitNumber)}</span>
          </div>
          <div className="text-right">
            <span className="font-bold">VIN: </span>
            <span className="border-b border-black px-2">{valueOrLine(report.vehicle.vin)}</span>
            {report.odometer != null ? (
              <>
                <span className="ml-4 font-bold">Odometer: </span>
                <span className="border-b border-black px-2">{String(report.odometer)}</span>
              </>
            ) : null}
          </div>
        </section>

        {/* Overall result */}
        <section className="mt-2 border-y border-black py-1 text-xs">
          <span className="mr-5">
            <CheckMark checked={report.status.noDefectsFound} /> No Defects Found
          </span>
          <span className="mr-5">
            <CheckMark checked={report.status.defectsFound} /> Defects Found
          </span>
          <span>
            Result: <strong>{String(report.status.overallVehicleResult).replaceAll("_", " ")}</strong>
          </span>
        </section>

        {/* Inspection sheet label */}
        <section className="mt-2 space-y-2">
          <div className="border border-black bg-slate-50 px-2 py-1 text-xs font-bold uppercase">
            {isTractor ? "Schedule 1 — Tractor Inspection (Ontario Reg. 199/07)" : valueOrLine(report.inspectionSheetLabel)}
          </div>
          {ontarioSections.map((section) => (
            <table key={section.label} className="w-full border border-black text-left">
              <thead>
                <tr className="bg-black text-white">
                  <th colSpan={5} className="px-2 py-1 text-xs uppercase">{section.label}</th>
                </tr>
                <tr className="border-b border-black text-[11px]">
                  <th className="border-r border-black px-1">Code(s)</th>
                  <th className="border-r border-black px-1 text-center">D</th>
                  <th className="border-r border-black px-1 text-center">R</th>
                  <th className="border-r border-black px-1 text-center">NSC #</th>
                  <th className="px-2">Inspection Item</th>
                </tr>
              </thead>
              <DvirRows rows={section.rows} />
            </table>
          ))}
        </section>

        {/* Defects and notes */}
        <section className="mt-2 space-y-2 text-xs">
          <div>
            <p className="font-bold">Minor/Major Defects Not Coded Above:</p>
            <div className="min-h-10 border-b border-black py-1">
              {defects.length > 0 ? defects.map((defect) => <p key={defect}>{defect}</p>) : <p>&nbsp;</p>}
            </div>
          </div>
          <div>
            <p className="font-bold">Inspection Notes / Integrity Follow-up:</p>
            <div className="min-h-10 border-b border-black py-1">
              {report.notes ? <p>{report.notes}</p> : null}
              {flags.map((flag, index) => <p key={`${flag.message}-${index}`}>{flag.message}</p>)}
              {!report.notes && flags.length === 0 ? <p>&nbsp;</p> : null}
            </div>
          </div>
        </section>

        {/* Driver certification */}
        {isTractor ? (
          <section className="mt-3 border border-black p-2 text-xs">
            <p className="font-bold">Driver&apos;s Declaration:</p>
            <p className="mt-1 leading-snug">
              I declare that this motor vehicle has been inspected in accordance with the requirements of the
              <em> Highway Traffic Act</em>, Ontario Regulation 199/07, and that the results are accurately reported above.
              I have reported all defects discovered during this inspection.
            </p>
          </section>
        ) : null}

        {/* Signature section */}
        <section className="mt-4 grid gap-4 text-xs md:grid-cols-3">
          <div>
            <p className="border-b border-black pb-1">{valueOrLine(report.driver.name)}</p>
            <p className="mt-1 font-bold">Driver&apos;s Printed Name</p>
          </div>
          <div>
            <p className="border-b border-black pb-1 font-cursive">{valueOrLine(report.driver.signature)}</p>
            <p className="mt-1 font-bold">Driver&apos;s Signature</p>
          </div>
          <div>
            <p className="border-b border-black pb-1">{valueOrLine(report.date)}</p>
            <p className="mt-1 font-bold">Date</p>
          </div>
        </section>

        {/* Repair review section */}
        <section className="mt-4 grid gap-4 border-t border-black pt-3 text-xs md:grid-cols-3">
          <div>
            <p className="border-b border-black pb-1">&nbsp;</p>
            <p className="mt-1 font-bold">Authorized Repairer&apos;s Signature</p>
          </div>
          <div>
            <p className="border-b border-black pb-1">&nbsp;</p>
            <p className="mt-1 font-bold">Driver&apos;s Signature After Repair Review</p>
          </div>
          <div>
            <p className="border-b border-black pb-1">&nbsp;</p>
            <p className="mt-1 font-bold">Date</p>
          </div>
        </section>

        <p className="mt-3 text-[10px] leading-snug">
          {isTractor
            ? "This report is required to be kept on the vehicle for 24 hours after completion or until the next required inspection, whichever comes first (Ontario Reg. 199/07). D = defect reported by driver. R = repair/correction certified."
            : "TruckFixr DVIR-style report. D = defect reported by driver. R = repair/correction review. Retain per your fleet compliance policy."}
        </p>
      </main>
    </div>
  );
}

export default function InspectionReportDvir() {
  return (
    <RoleBasedRoute requiredRoles={["driver", "owner_operator", "manager", "owner"]}>
      <InspectionReportDvirContent />
    </RoleBasedRoute>
  );
}
