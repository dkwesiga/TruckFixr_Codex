import { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { AlertTriangle, Search, ShieldAlert, Truck } from "lucide-react";

const reasonOptions = [
  { value: "assigned_to_this_unit_today", label: "Assigned to this unit today" },
  { value: "need_to_complete_inspection", label: "Need to complete inspection" },
  { value: "need_to_report_defect", label: "Need to report defect" },
  { value: "need_to_run_diagnosis", label: "Need to run diagnosis" },
  { value: "trailer_swap", label: "Trailer swap" },
  { value: "emergency_roadside_issue", label: "Emergency / roadside issue" },
  { value: "other", label: "Other" },
] as const;

type Props = {
  fleetId: number;
  triggerLabel?: string;
  triggerVariant?: "default" | "outline" | "ghost";
  title?: string;
  description?: string;
  defaultVehicleId?: number | null;
  onSubmitted?: () => void;
};

export default function VehicleAccessRequestDialog({
  fleetId,
  triggerLabel = "Request Vehicle Access",
  triggerVariant = "outline",
  title = "Request Vehicle Access",
  description = "Search for the unit, VIN, or plate in your fleet, then ask your fleet manager for access.",
  defaultVehicleId = null,
  onSubmitted,
}: Props) {
  const [open, setOpen] = useState(false);
  const [search, setSearch] = useState("");
  const [selectedVehicleId, setSelectedVehicleId] = useState<number | null>(defaultVehicleId);
  const [reason, setReason] =
    useState<(typeof reasonOptions)[number]["value"]>("need_to_complete_inspection");
  const [note, setNote] = useState("");
  const [manualIdentifier, setManualIdentifier] = useState("");
  const [requestedFromUserId, setRequestedFromUserId] = useState<number | null>(null);

  const utils = trpc.useUtils();
  const grantContactsQuery = trpc.vehicleAccess.getGrantContacts.useQuery(
    { fleetId },
    { enabled: open, staleTime: 30_000 }
  );
  const requestableVehiclesQuery = trpc.vehicleAccess.listRequestableVehicles.useQuery(
    { fleetId, query: search.trim() },
    { enabled: open, staleTime: 10_000 }
  );
  const myRequestsQuery = trpc.vehicleAccess.listMyRequests.useQuery(
    { fleetId },
    { enabled: open, staleTime: 10_000 }
  );
  const createRequestMutation = trpc.vehicleAccess.createAccessRequest.useMutation({
    onSuccess: async () => {
      await utils.vehicleAccess.listMyRequests.invalidate({ fleetId });
    },
  });

  const existingPendingRequest = useMemo(() => {
    return (myRequestsQuery.data ?? []).find(
      (request) =>
        request.status === "pending" &&
        (selectedVehicleId ? request.vehicleId === selectedVehicleId : false)
    );
  }, [myRequestsQuery.data, selectedVehicleId]);

  const submitRequest = async () => {
    if (!selectedVehicleId && !manualIdentifier.trim()) {
      toast.error("Search and select a fleet vehicle, or enter the unit/VIN/plate details.");
      return;
    }

    try {
      await createRequestMutation.mutateAsync({
        fleetId,
        vehicleId: selectedVehicleId ?? undefined,
        requestedVehicleIdentifier: selectedVehicleId ? undefined : manualIdentifier.trim(),
        requestedFromUserId: requestedFromUserId ?? undefined,
        reason,
        note: note.trim() || undefined,
      });
      toast.success("Vehicle access request submitted");
      setOpen(false);
      setSearch("");
      setSelectedVehicleId(null);
      setReason("need_to_complete_inspection");
      setNote("");
      setManualIdentifier("");
      setRequestedFromUserId(null);
      onSubmitted?.();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : "Unable to submit access request");
    }
  };

  const vehicles = requestableVehiclesQuery.data ?? [];
  const selectedVehicle =
    vehicles.find((vehicle) => vehicle.id === selectedVehicleId) ?? null;
  const grantors = grantContactsQuery.data?.grantors ?? [];
  const selectedGrantor =
    grantors.find((grantor) => grantor.id === requestedFromUserId) ??
    grantContactsQuery.data?.primaryGrantor ??
    null;

  useEffect(() => {
    if (!open) return;
    if (requestedFromUserId != null) return;
    if (grantContactsQuery.data?.primaryGrantor?.id) {
      setRequestedFromUserId(grantContactsQuery.data.primaryGrantor.id);
    }
  }, [grantContactsQuery.data?.primaryGrantor?.id, open, requestedFromUserId]);

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button variant={triggerVariant} className="rounded-2xl">
          <Truck className="mr-2 h-4 w-4" />
          {triggerLabel}
        </Button>
      </DialogTrigger>
      <DialogContent className="rounded-[24px] border-slate-200 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>
            {description}
            {selectedGrantor
              ? ` Do you want to seek access from ${selectedGrantor.name || selectedGrantor.email || selectedGrantor.role}?`
              : ""}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <Label htmlFor="vehicle-access-select">Select a company vehicle or trailer</Label>
            <Select
              value={selectedVehicleId != null ? String(selectedVehicleId) : ""}
              onValueChange={(value) => {
                const nextVehicleId = value ? Number(value) : null;
                setSelectedVehicleId(nextVehicleId);
                if (nextVehicleId != null) {
                  setManualIdentifier("");
                }
              }}
            >
              <SelectTrigger id="vehicle-access-select" className="mt-2 h-11 rounded-xl">
                <SelectValue placeholder="Choose from company vehicles" />
              </SelectTrigger>
              <SelectContent>
                {vehicles.length > 0 ? (
                  vehicles.map((vehicle) => (
                    <SelectItem key={vehicle.id} value={String(vehicle.id)}>
                      {vehicle.unitNumber || vehicle.licensePlate || vehicle.vin}
                      {vehicle.assetType ? ` | ${vehicle.assetType}` : ""}
                      {vehicle.make || vehicle.model ? ` | ${[vehicle.year, vehicle.make, vehicle.model].filter(Boolean).join(" ")}` : ""}
                    </SelectItem>
                  ))
                ) : (
                  <SelectItem value="__no_vehicle__" disabled>
                    No unassigned company vehicles available
                  </SelectItem>
                )}
              </SelectContent>
            </Select>
            {selectedVehicle ? (
              <p className="mt-2 text-xs text-slate-500">
                Selected: {[selectedVehicle.assetType, selectedVehicle.year, selectedVehicle.make, selectedVehicle.model, selectedVehicle.licensePlate]
                  .filter(Boolean)
                  .join(" | ")}
              </p>
            ) : null}
          </div>

          <div>
            <Label htmlFor="vehicle-access-search">Filter company vehicles</Label>
            <div className="relative mt-2">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                id="vehicle-access-search"
                value={search}
                onChange={(event) => {
                  setSearch(event.target.value);
                  setSelectedVehicleId(null);
                }}
                placeholder="Type unit number, VIN, plate, trailer number"
                className="pl-9"
              />
            </div>
          </div>

          {search.trim().length >= 2 ? (
            <div className="space-y-2">
              {requestableVehiclesQuery.isLoading ? (
                <div className="rounded-2xl border border-slate-200 bg-slate-50 px-4 py-4 text-sm text-slate-600">
                  Searching fleet vehicles...
                </div>
              ) : vehicles.length > 0 ? (
                vehicles.map((vehicle) => {
                  const isSelected = selectedVehicleId === vehicle.id;
                  return (
                    <button
                      key={vehicle.id}
                      type="button"
                      className={`w-full rounded-2xl border px-4 py-4 text-left transition ${
                        isSelected
                          ? "border-blue-200 bg-blue-50"
                          : "border-slate-200 bg-white hover:border-blue-200 hover:bg-blue-50/50"
                      }`}
                      onClick={() => {
                        setSelectedVehicleId(vehicle.id);
                        setManualIdentifier("");
                      }}
                    >
                      <p className="font-semibold text-slate-950">
                        {vehicle.unitNumber || vehicle.licensePlate || vehicle.vin}
                      </p>
                      <p className="mt-1 text-sm text-slate-600">
                        {[vehicle.assetType, vehicle.year, vehicle.make, vehicle.model, vehicle.licensePlate]
                          .filter(Boolean)
                          .join(" | ")}
                      </p>
                    </button>
                  );
                })
              ) : (
                <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
                  <p className="font-medium">This vehicle is not currently in your fleet list.</p>
                  <p className="mt-1">
                    Contact your fleet manager or owner to add it. You can still send the unit/VIN/plate details below.
                  </p>
                </div>
              )}
            </div>
          ) : null}

          <div>
            <Label htmlFor="vehicle-access-manual">If not found, enter unit / VIN / plate</Label>
            <Input
              id="vehicle-access-manual"
              value={manualIdentifier}
              onChange={(event) => {
                setManualIdentifier(event.target.value);
                if (event.target.value.trim()) setSelectedVehicleId(null);
              }}
              placeholder="Unit 52, 1XP..., trailer 143, plate ABC123"
              className="mt-2"
            />
          </div>

          <div>
            <Label htmlFor="vehicle-access-reason">Reason</Label>
            <select
              id="vehicle-access-reason"
              value={reason}
              onChange={(event) => setReason(event.target.value as (typeof reasonOptions)[number]["value"])}
              className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
            >
              {reasonOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </div>

          {grantors.length > 0 ? (
            <div>
              <Label htmlFor="vehicle-access-grantor">Who should receive this request?</Label>
              <select
                id="vehicle-access-grantor"
                value={requestedFromUserId ?? ""}
                onChange={(event) =>
                  setRequestedFromUserId(event.target.value ? Number(event.target.value) : null)
                }
                className="mt-2 h-11 w-full rounded-xl border border-slate-200 bg-white px-3 text-sm"
              >
                <option value="">Primary approver</option>
                {grantors.map((grantor) => (
                  <option key={grantor.id} value={grantor.id}>
                    {grantor.name || grantor.email || `User ${grantor.id}`} {grantor.email ? `(${grantor.email})` : ""}
                  </option>
                ))}
              </select>
              <p className="mt-2 text-xs text-slate-500">
                Access can be granted by{" "}
                {grantors
                  .map((grantor) => grantor.name || grantor.email || `User ${grantor.id}`)
                  .join(", ")}
                .
              </p>
            </div>
          ) : null}

          <div>
            <Label htmlFor="vehicle-access-note">Note</Label>
            <Textarea
              id="vehicle-access-note"
              value={note}
              onChange={(event) => setNote(event.target.value)}
              placeholder="Optional context for the manager"
              className="mt-2 min-h-24"
            />
          </div>

          {reason === "emergency_roadside_issue" ? (
            <div className="rounded-2xl border border-red-200 bg-red-50 px-4 py-4 text-sm text-red-900">
              <div className="flex items-start gap-3">
                <ShieldAlert className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-semibold">Urgent request</p>
                  <p className="mt-1">
                    TruckFixr will mark this request urgent for the fleet manager, but it still requires approval.
                  </p>
                </div>
              </div>
            </div>
          ) : null}

          {existingPendingRequest ? (
            <div className="rounded-2xl border border-amber-200 bg-amber-50 px-4 py-4 text-sm text-amber-900">
              <div className="flex items-start gap-3">
                <AlertTriangle className="mt-0.5 h-4 w-4" />
                <div>
                  <p className="font-semibold">A request is already pending for this vehicle.</p>
                  <p className="mt-1">TruckFixr will wait for manager review before sending another request.</p>
                </div>
              </div>
            </div>
          ) : null}

          <div className="flex justify-end gap-3">
            <Button type="button" variant="outline" className="rounded-2xl" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button
              type="button"
              className="rounded-2xl bg-blue-600 text-white hover:bg-blue-700"
              disabled={createRequestMutation.isPending || Boolean(existingPendingRequest)}
              onClick={() => void submitRequest()}
            >
              {createRequestMutation.isPending ? "Submitting..." : "Submit request"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
