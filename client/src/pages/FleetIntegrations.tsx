import { useMemo, useRef, useState } from "react";
import AppLogo from "@/components/AppLogo";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";
import {
  buildColumnMap,
  parseCsv,
  VEHICLE_EVENT_IMPORT_LIMITS,
} from "@shared/maintenance/csv";
import { VEHICLE_EVENT_TYPES } from "@shared/maintenance/normalization";
import { toast } from "sonner";
import {
  AlertTriangle,
  CheckCircle2,
  FileSpreadsheet,
  Inbox,
  Loader2,
  Upload,
  X,
} from "lucide-react";

const EXPECTED_COLUMNS = [
  "vehicleId",
  "eventType",
  "eventTimestamp",
  "odometerKm",
  "engineHours",
  "dtcCode",
  "dtcStatus",
  "severity",
  "source",
  "sourceEventId",
] as const;

type CsvRowObject = Record<string, string>;

function csvRowsToObjects(
  header: string[],
  rows: string[][]
): { objects: CsvRowObject[]; missingRequired: string[] } {
  const map = buildColumnMap(header);
  const required = ["vehicleid", "eventtype", "eventtimestamp"];
  const missingRequired = required.filter((r) => !(r in map));

  const objects = rows.map((cols) => {
    const obj: CsvRowObject = {};
    for (const col of EXPECTED_COLUMNS) {
      const idx = map[col.toLowerCase()];
      if (idx != null && cols[idx] != null && cols[idx].trim() !== "") {
        obj[col] = cols[idx].trim();
      }
    }
    return obj;
  });

  return { objects, missingRequired };
}

// Convert string cells to the ingestion payload shape (numbers where numeric).
function toIngestPayload(row: CsvRowObject) {
  const num = (v: string | undefined) =>
    v == null || v === "" ? undefined : Number(v);
  return {
    vehicleId: row.vehicleId,
    eventType: row.eventType,
    eventTimestamp: row.eventTimestamp,
    source: row.source ?? "csv",
    sourceEventId: row.sourceEventId,
    odometerKm: num(row.odometerKm),
    engineHours: num(row.engineHours),
    dtcCode: row.dtcCode,
    dtcStatus: row.dtcStatus,
    severity: row.severity,
  };
}

type IngestSummary = {
  imported: number;
  duplicate: number;
  invalid: number;
  failed: number;
  total: number;
  errors: Array<{ index: number; code: string; message: string }>;
};

function SummaryPills({ summary }: { summary: IngestSummary }) {
  const pills: Array<[string, number, string]> = [
    ["Imported", summary.imported, "bg-emerald-100 text-emerald-700"],
    ["Duplicate", summary.duplicate, "bg-slate-100 text-slate-600"],
    ["Invalid", summary.invalid, "bg-amber-100 text-amber-800"],
    ["Failed", summary.failed, "bg-red-100 text-red-700"],
  ];
  return (
    <div className="flex flex-wrap gap-2">
      {pills.map(([label, value, cls]) => (
        <span
          key={label}
          className={`inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-xs font-semibold ${cls}`}
        >
          {label}: {value}
        </span>
      ))}
    </div>
  );
}

function ManualEntryTab({
  fleetId,
  vehicles,
  enabled,
}: {
  fleetId: number | null;
  vehicles: Array<{ id: string; label: string }>;
  enabled: boolean;
}) {
  const utils = trpc.useUtils();
  const [vehicleId, setVehicleId] = useState("");
  const [eventType, setEventType] = useState("odometer");
  const [timestamp, setTimestamp] = useState(() =>
    new Date().toISOString().slice(0, 16)
  );
  const [odometerKm, setOdometerKm] = useState("");
  const [dtcCode, setDtcCode] = useState("");

  const createEvent = trpc.fleetMaintenance.createManualEvent.useMutation({
    onSuccess: (summary) => {
      if (summary.imported > 0) {
        toast.success("Event recorded.");
        void utils.fleetMaintenance.listEvents.invalidate();
      } else if (summary.duplicate > 0) {
        toast.info("That event already exists (duplicate).");
      } else {
        toast.error(summary.errors[0]?.message ?? "Event could not be recorded.");
      }
    },
    onError: (err) => toast.error(err.message),
  });

  const canSubmit = enabled && vehicleId && eventType && timestamp;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Add a vehicle event manually</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="text-sm text-slate-500">
            Vehicle events are not enabled for your fleet.
          </p>
        ) : (
          <>
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="veh">Vehicle</Label>
                <Select value={vehicleId} onValueChange={setVehicleId}>
                  <SelectTrigger id="veh">
                    <SelectValue placeholder="Select a vehicle" />
                  </SelectTrigger>
                  <SelectContent>
                    {vehicles.map((v) => (
                      <SelectItem key={v.id} value={v.id}>
                        {v.label}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="etype">Event type</Label>
                <Select value={eventType} onValueChange={setEventType}>
                  <SelectTrigger id="etype">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {VEHICLE_EVENT_TYPES.map((t) => (
                      <SelectItem key={t} value={t}>
                        {t}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="ts">Event time</Label>
                <Input
                  id="ts"
                  type="datetime-local"
                  value={timestamp}
                  onChange={(e) => setTimestamp(e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="odo">Odometer (km, optional)</Label>
                <Input
                  id="odo"
                  type="number"
                  inputMode="decimal"
                  value={odometerKm}
                  onChange={(e) => setOdometerKm(e.target.value)}
                  placeholder="e.g. 250000"
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="dtc">DTC code (optional)</Label>
                <Input
                  id="dtc"
                  value={dtcCode}
                  onChange={(e) => setDtcCode(e.target.value)}
                  placeholder="e.g. P0420"
                />
              </div>
            </div>
            <Button
              disabled={!canSubmit || createEvent.isPending}
              onClick={() =>
                createEvent.mutate({
                  fleetId: fleetId ?? undefined,
                  event: {
                    vehicleId,
                    eventType,
                    eventTimestamp: new Date(timestamp).toISOString(),
                    odometerKm: odometerKm ? Number(odometerKm) : undefined,
                    dtcCode: dtcCode || undefined,
                  },
                })
              }
            >
              {createEvent.isPending ? (
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
              ) : null}
              Record event
            </Button>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function CsvImportTab({
  fleetId,
  enabled,
}: {
  fleetId: number | null;
  enabled: boolean;
}) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [parsed, setParsed] = useState<{
    objects: CsvRowObject[];
    missingRequired: string[];
    fileName: string;
  } | null>(null);
  const [result, setResult] = useState<IngestSummary | null>(null);

  const importCsv = trpc.fleetMaintenance.importEventsCsv.useMutation({
    onSuccess: (summary) => {
      setResult(summary as IngestSummary);
      setParsed(null);
      if (fileRef.current) fileRef.current.value = "";
      void utils.fleetMaintenance.listEvents.invalidate();
      toast.success(`Imported ${summary.imported} event(s).`);
    },
    onError: (err) => toast.error(err.message),
  });

  async function onFile(file: File) {
    setResult(null);
    if (file.size > VEHICLE_EVENT_IMPORT_LIMITS.maxFileSizeBytes) {
      toast.error("File exceeds the 5 MB limit.");
      return;
    }
    const text = await file.text();
    const { header, rows } = parseCsv(text);
    if (rows.length > VEHICLE_EVENT_IMPORT_LIMITS.maxRows) {
      toast.error(`Too many rows (${rows.length}); the limit is ${VEHICLE_EVENT_IMPORT_LIMITS.maxRows}.`);
      return;
    }
    const { objects, missingRequired } = csvRowsToObjects(header, rows);
    setParsed({ objects, missingRequired, fileName: file.name });
  }

  const previewRows = parsed?.objects.slice(0, 10) ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Import events from CSV</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {!enabled ? (
          <p className="text-sm text-slate-500">
            CSV import (integration ingestion) is not enabled for your fleet.
          </p>
        ) : (
          <>
            <p className="text-sm text-slate-600">
              Expected columns: <code className="text-xs">vehicleId, eventType,
              eventTimestamp</code> (required), plus optional{" "}
              <code className="text-xs">odometerKm, engineHours, dtcCode,
              dtcStatus, severity, source, sourceEventId</code>. Up to{" "}
              {VEHICLE_EVENT_IMPORT_LIMITS.maxRows} rows / 5 MB.
            </p>

            <input
              ref={fileRef}
              type="file"
              accept=".csv,text/csv"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void onFile(f);
              }}
            />
            <Button variant="outline" onClick={() => fileRef.current?.click()}>
              <Upload className="mr-2 h-4 w-4" />
              Choose CSV file
            </Button>

            {parsed ? (
              <div className="space-y-3 rounded-xl border border-slate-200 p-4">
                <div className="flex items-center justify-between gap-2">
                  <p className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                    <FileSpreadsheet className="h-4 w-4 text-slate-500" />
                    {parsed.fileName}
                  </p>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setParsed(null);
                      if (fileRef.current) fileRef.current.value = "";
                    }}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>

                {parsed.missingRequired.length > 0 ? (
                  <p className="flex items-start gap-1.5 text-sm text-red-700">
                    <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                    Missing required column(s): {parsed.missingRequired.join(", ")}.
                    Fix the header and re-upload.
                  </p>
                ) : (
                  <>
                    <p className="text-sm text-slate-600">
                      {parsed.objects.length} row(s) parsed. Showing the first{" "}
                      {previewRows.length}. The server validates and de-duplicates
                      on import.
                    </p>
                    <div className="overflow-x-auto rounded-lg border border-slate-200">
                      <Table>
                        <TableHeader>
                          <TableRow>
                            <TableHead>Vehicle</TableHead>
                            <TableHead>Type</TableHead>
                            <TableHead>Time</TableHead>
                            <TableHead>Odometer</TableHead>
                            <TableHead>DTC</TableHead>
                          </TableRow>
                        </TableHeader>
                        <TableBody>
                          {previewRows.map((r, i) => (
                            <TableRow key={i}>
                              <TableCell>{r.vehicleId}</TableCell>
                              <TableCell>{r.eventType}</TableCell>
                              <TableCell className="whitespace-nowrap text-xs">
                                {r.eventTimestamp}
                              </TableCell>
                              <TableCell>{r.odometerKm ?? "—"}</TableCell>
                              <TableCell>{r.dtcCode ?? "—"}</TableCell>
                            </TableRow>
                          ))}
                        </TableBody>
                      </Table>
                    </div>
                    <Button
                      disabled={importCsv.isPending}
                      onClick={() =>
                        importCsv.mutate({
                          fleetId: fleetId ?? undefined,
                          events: parsed.objects.map(toIngestPayload),
                        })
                      }
                    >
                      {importCsv.isPending ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : null}
                      Confirm import of {parsed.objects.length} row(s)
                    </Button>
                  </>
                )}
              </div>
            ) : null}

            {result ? (
              <div className="space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4">
                <p className="text-sm font-semibold text-slate-900">Import result</p>
                <SummaryPills summary={result} />
                {result.errors.length > 0 ? (
                  <ul className="mt-2 space-y-1 text-xs text-slate-600">
                    {result.errors.slice(0, 8).map((e, i) => (
                      <li key={i}>
                        Row {e.index + 1}: {e.message}
                      </li>
                    ))}
                  </ul>
                ) : null}
              </div>
            ) : null}
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ReviewQueueTab({
  fleetId,
  enabled,
}: {
  fleetId: number | null;
  enabled: boolean;
}) {
  const utils = trpc.useUtils();
  const queue = trpc.fleetMaintenance.listEvents.useQuery(
    { fleetId: fleetId ?? undefined, trustStatus: "review_required", limit: 50 },
    { enabled: enabled && fleetId != null }
  );

  const review = trpc.fleetMaintenance.reviewEvent.useMutation({
    onSuccess: () => {
      void utils.fleetMaintenance.listEvents.invalidate();
      toast.success("Event reviewed.");
    },
    onError: (err) => toast.error(err.message),
  });

  const events = queue.data?.events ?? [];

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-base">Events awaiting review</CardTitle>
      </CardHeader>
      <CardContent>
        {!enabled ? (
          <p className="text-sm text-slate-500">
            Vehicle events are not enabled for your fleet.
          </p>
        ) : queue.isLoading ? (
          <Skeleton className="h-24 w-full" />
        ) : events.length === 0 ? (
          <div className="flex flex-col items-center gap-2 py-8 text-center">
            <Inbox className="h-8 w-8 text-slate-400" />
            <p className="text-sm text-slate-500">Nothing to review.</p>
          </div>
        ) : (
          <div className="space-y-2">
            {events.map((e) => (
              <div
                key={e.id}
                className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="min-w-0 text-sm">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-slate-900">{e.vehicleId}</span>
                    <Badge variant="outline">{e.eventType}</Badge>
                    <span className="text-xs text-slate-400">{e.source}</span>
                  </div>
                </div>
                <div className="flex gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        fleetId: fleetId ?? undefined,
                        eventId: e.id,
                        decision: "reviewed",
                      })
                    }
                  >
                    <CheckCircle2 className="mr-1 h-3.5 w-3.5" />
                    Accept
                  </Button>
                  <Button
                    size="sm"
                    variant="ghost"
                    disabled={review.isPending}
                    onClick={() =>
                      review.mutate({
                        fleetId: fleetId ?? undefined,
                        eventId: e.id,
                        decision: "rejected",
                      })
                    }
                  >
                    Reject
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

function FleetIntegrationsContent() {
  useSeoMeta({
    title: "Integrations | TruckFixr",
    description: "Vehicle event entry, CSV import, and the review queue.",
  });

  const capabilitiesQuery = trpc.fleetMaintenance.capabilities.useQuery(undefined, {
    retry: false,
  });
  const fleetId = capabilitiesQuery.data?.fleetId ?? null;
  const caps = capabilitiesQuery.data?.capabilities;
  const eventsEnabled = caps?.pilotEligible === true && caps?.normalizedVehicleEvents === true;
  const csvEnabled = caps?.pilotEligible === true && caps?.integrationIngestion === true;

  const vehiclesQuery = trpc.vehicles.listByFleet.useQuery(
    { fleetId: fleetId ?? 0 },
    { enabled: fleetId != null }
  );
  const vehicles = useMemo(
    () =>
      ((vehiclesQuery.data ?? []) as Array<{ id: string; unitNumber?: string | null; make?: string | null; model?: string | null }>).map(
        (v) => ({
          id: v.id,
          label: v.unitNumber
            ? `Unit ${v.unitNumber}`
            : [v.make, v.model].filter(Boolean).join(" ") || v.id,
        })
      ),
    [vehiclesQuery.data]
  );

  return (
    <div className="min-h-screen bg-slate-50 text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-[1000px] items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <div className="flex items-center gap-3">
            <a href="/" aria-label="TruckFixr home">
              <AppLogo imageClassName="h-8 w-auto" />
            </a>
            <h1 className="font-['Manrope'] text-lg font-black text-slate-900">
              Integrations
            </h1>
          </div>
          <a href="/app/fleet-health">
            <Button variant="ghost" size="sm">
              Fleet Health
            </Button>
          </a>
        </div>
      </header>

      <main className="mx-auto max-w-[1000px] px-4 py-6 sm:px-6">
        {capabilitiesQuery.isLoading ? (
          <Skeleton className="h-64 w-full" />
        ) : !caps?.pilotEligible ? (
          <Card>
            <CardContent className="py-12 text-center text-sm text-slate-500">
              The maintenance pilot is not enabled for your fleet.
            </CardContent>
          </Card>
        ) : (
          <>
            <Tabs defaultValue="manual">
              <TabsList>
                <TabsTrigger value="manual">Manual entry</TabsTrigger>
                <TabsTrigger value="csv">CSV import</TabsTrigger>
                <TabsTrigger value="review">Review queue</TabsTrigger>
              </TabsList>
              <TabsContent value="manual" className="mt-4">
                <ManualEntryTab fleetId={fleetId} vehicles={vehicles} enabled={eventsEnabled} />
              </TabsContent>
              <TabsContent value="csv" className="mt-4">
                <CsvImportTab fleetId={fleetId} enabled={csvEnabled} />
              </TabsContent>
              <TabsContent value="review" className="mt-4">
                <ReviewQueueTab fleetId={fleetId} enabled={eventsEnabled} />
              </TabsContent>
            </Tabs>
            <p className="mt-8 text-xs leading-5 text-slate-400">
              TruckFixr does not connect directly to Geotab or Samsara in this
              release. Events are entered manually or imported from CSV.
            </p>
          </>
        )}
      </main>
    </div>
  );
}

export default function FleetIntegrations() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <FleetIntegrationsContent />
    </RoleBasedRoute>
  );
}
