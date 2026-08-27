import { useMemo, useState } from "react";
import { useLocation } from "wouter";
import { toast } from "sonner";
import {
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Loader2,
  Save,
  ScanLine,
  Wrench,
} from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { trpc } from "@/lib/trpc";
import { decodeVin, normalizeVinInput } from "@/lib/vin";
import { CASE_TYPE_LABELS, CASE_TYPES } from "@shared/tadis/caseTypes";

type VehicleState = {
  vin: string;
  unitNumber: string;
  make: string;
  model: string;
  year: string;
  engineMake: string;
  vinSource: "vin_decoder" | "technician_input";
};

function emptyVehicle(): VehicleState {
  return { vin: "", unitNumber: "", make: "", model: "", year: "", engineMake: "", vinSource: "technician_input" };
}

const NEW_VEHICLE_VALUE = "__new__";

function existingVehicleLabel(v: { unitNumber?: string | null; vin?: string | null; make?: string | null; model?: string | null; year?: number | null }) {
  const parts = [v.year, v.make, v.model].filter(Boolean).join(" ").trim();
  const identifier = v.unitNumber?.trim() ? `Unit ${v.unitNumber.trim()}` : v.vin?.trim() ? v.vin.trim() : null;
  if (parts && identifier) return `${identifier} — ${parts}`;
  return identifier || parts || "Vehicle";
}

function ShopCaseCaptureInner() {
  const [, setLocation] = useLocation();
  const fleetsQuery = trpc.fleet.list.useQuery();
  const partnerFleet = useMemo(
    () => (fleetsQuery.data ?? []).find((fleet: any) => fleet.isPartner) ?? null,
    [fleetsQuery.data]
  );
  const fleetId = partnerFleet?.id as number | undefined;

  const vehiclesQuery = trpc.maintenanceCases.listShopVehicles.useQuery(
    { fleetId },
    { enabled: Boolean(fleetId) }
  );
  const existingVehicles = vehiclesQuery.data ?? [];

  const [selectedVehicleId, setSelectedVehicleId] = useState<string>(NEW_VEHICLE_VALUE);
  const [vehicle, setVehicle] = useState<VehicleState>(emptyVehicle());
  const [decoding, setDecoding] = useState(false);
  const [caseType, setCaseType] = useState<string>("diagnostic_troubleshooting");
  const [complaint, setComplaint] = useState("");
  const [showMore, setShowMore] = useState(false);
  const [symptomsText, setSymptomsText] = useState("");
  const [faultCodesText, setFaultCodesText] = useState("");
  const [draftCaseId, setDraftCaseId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const draftsQuery = trpc.maintenanceCases.listDraftCases.useQuery(
    { fleetId },
    { enabled: Boolean(fleetId) }
  );
  const drafts = (draftsQuery.data ?? []).filter((d: any) => d.id !== draftCaseId);

  const createCase = trpc.maintenanceCases.createShopCase.useMutation({
    onSuccess: (result) => {
      toast.success(`Case ${result.case?.reference ?? ""} created.`);
      if (result.case?.id) {
        setLocation(`/app/case/${result.case.id}`);
      }
    },
    onError: (error) => toast.error(error.message),
  });

  const saveDraft = trpc.maintenanceCases.saveDraftCase.useMutation({
    onSuccess: async (result) => {
      setDraftCaseId(result.id);
      toast.success("Draft saved. You can come back to finish this case anytime.");
      if (fleetId) await utils.maintenanceCases.listDraftCases.invalidate({ fleetId });
    },
    onError: (error) => toast.error(error.message),
  });

  function resumeDraft(d: any) {
    setDraftCaseId(d.id);
    setCaseType(d.caseType || "diagnostic_troubleshooting");
    setComplaint(d.summary || "");
    setSelectedVehicleId(String(d.vehicleId));
    toast.success("Draft loaded — pick up where you left off.");
  }

  function saveDraftCase() {
    if (!fleetId) return;
    const usingExistingVehicle = selectedVehicleId !== NEW_VEHICLE_VALUE;
    if (!usingExistingVehicle && !vehicle.vin && !vehicle.unitNumber) {
      toast.error("Enter at least a VIN or unit number before saving a draft.");
      return;
    }
    saveDraft.mutate({
      fleetId,
      draftCaseId: draftCaseId ?? undefined,
      caseType: caseType as never,
      complaint: complaint || undefined,
      ...(usingExistingVehicle
        ? { vehicleId: selectedVehicleId }
        : {
            vehicle: {
              vin: vehicle.vin ? normalizeVinInput(vehicle.vin) : undefined,
              unitNumber: vehicle.unitNumber || undefined,
              make: vehicle.make || undefined,
              model: vehicle.model || undefined,
              year: vehicle.year ? Number(vehicle.year) : undefined,
              engineMake: vehicle.engineMake || undefined,
              vinSource: vehicle.vinSource,
            },
          }),
    });
  }

  async function handleDecode() {
    const normalized = normalizeVinInput(vehicle.vin);
    if (normalized.length !== 17) {
      toast.error("VIN must be 17 characters.");
      return;
    }
    setDecoding(true);
    const result = await decodeVin(normalized);
    setDecoding(false);
    if (!result.ok) {
      toast.error(result.error);
      return;
    }
    setVehicle((prev) => ({
      ...prev,
      vin: result.vehicle.vin,
      make: result.vehicle.make || prev.make,
      model: result.vehicle.model || prev.model,
      year: result.vehicle.year ? String(result.vehicle.year) : prev.year,
      engineMake: result.vehicle.engineMake || prev.engineMake,
      vinSource: "vin_decoder",
    }));
    toast.success("VIN decoded.");
  }

  function submit() {
    if (!fleetId) return;
    if (!complaint.trim()) {
      toast.error("Enter the customer complaint or inquiry.");
      return;
    }
    const usingExistingVehicle = selectedVehicleId !== NEW_VEHICLE_VALUE;
    createCase.mutate({
      fleetId,
      caseType: caseType as never,
      complaint,
      symptoms: symptomsText.split("\n").map((s) => s.trim()).filter(Boolean),
      faultCodes: faultCodesText.split(/[,\n]/).map((s) => s.trim()).filter(Boolean),
      draftCaseId: draftCaseId ?? undefined,
      ...(usingExistingVehicle
        ? { vehicleId: selectedVehicleId }
        : {
            vehicle: {
              vin: vehicle.vin ? normalizeVinInput(vehicle.vin) : undefined,
              unitNumber: vehicle.unitNumber || undefined,
              make: vehicle.make || undefined,
              model: vehicle.model || undefined,
              year: vehicle.year ? Number(vehicle.year) : undefined,
              engineMake: vehicle.engineMake || undefined,
              vinSource: vehicle.vinSource,
            },
          }),
    });
  }

  if (fleetsQuery.isLoading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!partnerFleet || !fleetId) {
    return (
      <div className="mx-auto max-w-2xl px-4 py-16">
        <Card>
          <CardHeader>
            <CardTitle>Partner shops only</CardTitle>
            <CardDescription>
              Fast case capture is for TruckFixr partner repair shops. Your account is not linked to a
              partner shop.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center gap-3 px-4 py-3">
          <a href="/" aria-label="TruckFixr home"><AppLogo imageClassName="h-8 w-auto" /></a>
          <h1 className="font-['Manrope'] text-lg font-black text-slate-900">New case — {partnerFleet.name}</h1>
        </div>
      </header>

      <main className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        {drafts.length > 0 ? (
          <Card className="border-amber-200 bg-amber-50/60">
            <CardContent className="space-y-2 py-4 text-sm">
              <p className="font-medium text-amber-900">
                {drafts.length === 1 ? "You have a saved draft case." : `You have ${drafts.length} saved draft cases.`}
              </p>
              <div className="flex flex-wrap gap-2">
                {drafts.map((d: any) => (
                  <Button
                    key={d.id}
                    type="button"
                    size="sm"
                    variant="outline"
                    onClick={() => resumeDraft(d)}
                  >
                    Resume {d.reference}
                  </Button>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Step 1: vehicle, VIN-first */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <ScanLine className="h-4 w-4 text-muted-foreground" />
              Vehicle
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>Vehicle on file</Label>
              <Select value={selectedVehicleId} onValueChange={setSelectedVehicleId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select a vehicle" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value={NEW_VEHICLE_VALUE}>+ Add a new vehicle</SelectItem>
                  {existingVehicles.map((v: any) => (
                    <SelectItem key={v.id} value={String(v.id)}>
                      {existingVehicleLabel(v)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            {selectedVehicleId === NEW_VEHICLE_VALUE ? (
              <>
                <div className="flex gap-2">
                  <Input
                    placeholder="17-character VIN"
                    value={vehicle.vin}
                    maxLength={17}
                    onChange={(e) => setVehicle((v) => ({ ...v, vin: e.target.value, vinSource: "technician_input" }))}
                    className="font-mono uppercase"
                  />
                  <Button type="button" variant="outline" disabled={decoding} onClick={handleDecode}>
                    {decoding ? <Loader2 className="h-4 w-4 animate-spin" /> : "Decode"}
                  </Button>
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label>Unit #</Label>
                    <Input value={vehicle.unitNumber} onChange={(e) => setVehicle((v) => ({ ...v, unitNumber: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Year</Label>
                    <Input inputMode="numeric" value={vehicle.year} onChange={(e) => setVehicle((v) => ({ ...v, year: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Make</Label>
                    <Input value={vehicle.make} onChange={(e) => setVehicle((v) => ({ ...v, make: e.target.value }))} />
                  </div>
                  <div className="space-y-1.5">
                    <Label>Model</Label>
                    <Input value={vehicle.model} onChange={(e) => setVehicle((v) => ({ ...v, model: e.target.value }))} />
                  </div>
                </div>
                <p className="text-xs text-slate-400">
                  Vehicle context source: {vehicle.vinSource === "vin_decoder" ? "VIN decoder" : "technician input"}
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500">
                Using the vehicle already on file — no need to re-enter its details.
              </p>
            )}
          </CardContent>
        </Card>

        {/* Step 2: complaint + case type (the minimum to open a case) */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Wrench className="h-4 w-4 text-muted-foreground" />
              Complaint or inquiry
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <Textarea
              rows={3}
              placeholder="What's the customer reporting? e.g. Check engine + derate on the highway."
              value={complaint}
              onChange={(e) => setComplaint(e.target.value)}
            />
            <div className="space-y-1.5">
              <Label>Case type</Label>
              <Select value={caseType} onValueChange={setCaseType}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {CASE_TYPES.map((t) => (
                    <SelectItem key={t} value={t}>{CASE_TYPE_LABELS[t]}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Progressive disclosure: symptoms/fault codes only if the staffer wants them now */}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => setShowMore((s) => !s)}
          className="w-full justify-between"
        >
          Symptoms &amp; fault codes (optional now)
          {showMore ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        {showMore ? (
          <Card>
            <CardContent className="space-y-3 pt-4">
              <div className="space-y-1.5">
                <Label>Symptoms (one per line)</Label>
                <Textarea rows={3} value={symptomsText} onChange={(e) => setSymptomsText(e.target.value)} />
              </div>
              <div className="space-y-1.5">
                <Label>Fault codes (comma or line separated)</Label>
                <Textarea rows={2} value={faultCodesText} onChange={(e) => setFaultCodesText(e.target.value)} placeholder="SPN 3226 FMI 4" />
              </div>
            </CardContent>
          </Card>
        ) : null}

        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            className="flex-1"
            disabled={saveDraft.isPending || createCase.isPending}
            onClick={saveDraftCase}
          >
            {saveDraft.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Save className="mr-2 h-4 w-4" />
            )}
            Save case
          </Button>
          <Button
            className="flex-1"
            disabled={createCase.isPending || saveDraft.isPending || !complaint.trim()}
            onClick={submit}
          >
            {createCase.isPending ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <CheckCircle2 className="mr-2 h-4 w-4" />
            )}
            Create case
          </Button>
        </div>
        <p className="text-center text-xs text-slate-400">
          "Save case" keeps your progress as a draft if you're not ready to finish intake yet. A
          technician can add diagnosis, resolution, and Verified/Confirmed outcomes on the case page next.
        </p>
      </main>
    </div>
  );
}

export default function ShopCaseCapture() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager", "driver"]}>
      <ShopCaseCaptureInner />
    </RoleBasedRoute>
  );
}
