import { useState } from "react";
import { Copy, Plus, RefreshCw } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";

function absoluteAppUrl(path: string) {
  if (typeof window === "undefined") return path;
  return `${window.location.origin}${path}`;
}

async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Clipboard API can be unavailable (permissions, non-secure context) —
    // the link is still shown on screen for manual copy.
  }
}

export default function PartsRequestQueue() {
  const list = trpc.partsRequests.list.useQuery(undefined, { refetchInterval: 60_000 });
  const [showCreate, setShowCreate] = useState(false);
  const [route, setRoute] = useState<"case_derived" | "known_part_number">("known_part_number");
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [partDescription, setPartDescription] = useState("");
  const [confirmedByType, setConfirmedByType] = useState<
    "truckfixr_technician" | "external_technician" | "repair_shop" | "customer_declaration"
  >("truckfixr_technician");
  const [confirmedByName, setConfirmedByName] = useState("");
  const [evidenceNotes, setEvidenceNotes] = useState("");
  const [links, setLinks] = useState<Record<number, { supplier?: string; customer?: string }>>({});

  const refresh = () => list.refetch();
  const create = trpc.partsRequests.create.useMutation({
    onSuccess: () => {
      setShowCreate(false);
      setCustomerName("");
      setCustomerEmail("");
      setPartNumber("");
      setPartDescription("");
      setConfirmedByName("");
      setEvidenceNotes("");
      refresh();
    },
  });
  const generateSupplierLink = trpc.partsRequests.generateSupplierLink.useMutation({
    onSuccess: (res, vars) => {
      const url = absoluteAppUrl(`/supplier-offer?token=${encodeURIComponent(res.token)}`);
      setLinks((prev) => ({ ...prev, [vars.id]: { ...prev[vars.id], supplier: url } }));
      copyToClipboard(url);
      refresh();
    },
  });
  const generateCustomerLink = trpc.partsRequests.generateCustomerLink.useMutation({
    onSuccess: (res, vars) => {
      const url = absoluteAppUrl(`/parts-offers?token=${encodeURIComponent(res.token)}`);
      setLinks((prev) => ({ ...prev, [vars.id]: { ...prev[vars.id], customer: url } }));
      copyToClipboard(url);
    },
  });
  const markTransaction = trpc.partsRequests.markTransactionStatus.useMutation({ onSuccess: refresh });

  const items = list.data ?? [];

  return (
    <AdminLayout>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">Parts concierge</h1>
            <p className="text-sm text-slate-500">
              GTA concierge pilot. Send suppliers their offer link personally — no automated outreach yet.
            </p>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" onClick={refresh} disabled={list.isFetching}>
              <RefreshCw className={cn("mr-2 h-4 w-4", list.isFetching && "animate-spin")} />
              Refresh
            </Button>
            <Button onClick={() => setShowCreate((v) => !v)}>
              <Plus className="mr-2 h-4 w-4" />
              New request
            </Button>
          </div>
        </div>

        {showCreate && (
          <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-5">
            <div className="flex gap-4">
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={route === "known_part_number"}
                  onChange={() => setRoute("known_part_number")}
                />
                Known part number
              </label>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="radio"
                  checked={route === "case_derived"}
                  onChange={() => setRoute("case_derived")}
                />
                Case-derived
              </label>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <Input placeholder="Customer name" value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              <Input placeholder="Customer email" value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
            </div>
            {route === "known_part_number" ? (
              <Input placeholder="Part number" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
            ) : (
              <>
                <select
                  value={confirmedByType}
                  onChange={(e) => setConfirmedByType(e.target.value as typeof confirmedByType)}
                  className="h-9 w-full rounded border border-slate-300 px-2 text-sm"
                >
                  <option value="truckfixr_technician">TruckFixr technician confirmed</option>
                  <option value="external_technician">External technician confirmed</option>
                  <option value="repair_shop">Repair shop confirmed</option>
                  <option value="customer_declaration">Customer declaration</option>
                </select>
                <Input placeholder="Confirmed by (name)" value={confirmedByName} onChange={(e) => setConfirmedByName(e.target.value)} />
                <Textarea placeholder="Evidence notes" value={evidenceNotes} onChange={(e) => setEvidenceNotes(e.target.value)} />
              </>
            )}
            <Textarea
              placeholder="Part description / requirement"
              value={partDescription}
              onChange={(e) => setPartDescription(e.target.value)}
            />
            <Button
              onClick={() =>
                create.mutate({
                  route,
                  customerName: customerName || undefined,
                  customerEmail: customerEmail || undefined,
                  partNumber: route === "known_part_number" ? partNumber : undefined,
                  partDescription: partDescription || undefined,
                  confirmedByType: route === "case_derived" ? confirmedByType : undefined,
                  confirmedByName: route === "case_derived" ? confirmedByName || undefined : undefined,
                  evidenceNotes: route === "case_derived" ? evidenceNotes || undefined : undefined,
                })
              }
              disabled={create.isPending}
            >
              Create request
            </Button>
          </div>
        )}

        {items.length === 0 ? (
          <div className="rounded-lg border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
            No parts requests yet.
          </div>
        ) : (
          <div className="space-y-3">
            {items.map((it: any) => (
              <div key={it.id} className="rounded-lg border border-slate-200 bg-white p-4">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="font-mono text-xs text-slate-500">#{it.id}</span>{" "}
                    <span className="text-sm font-semibold text-slate-800">
                      {it.partNumber || it.partDescription || "Part request"}
                    </span>
                    <span className="ml-2 text-xs text-slate-500">{it.route.replace(/_/g, " ")}</span>
                  </div>
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
                    {it.status.replace(/_/g, " ")}
                  </span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" onClick={() => generateSupplierLink.mutate({ id: it.id })}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy supplier link
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => generateCustomerLink.mutate({ id: it.id })}>
                    <Copy className="mr-1.5 h-3.5 w-3.5" />
                    Copy customer comparison link
                  </Button>
                  {it.status === "referred_to_supplier" && (
                    <>
                      <Button size="sm" onClick={() => markTransaction.mutate({ id: it.id, transactionStatus: "completed" })}>
                        Mark transaction completed
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => markTransaction.mutate({ id: it.id, transactionStatus: "not_completed" })}
                      >
                        Mark not completed
                      </Button>
                    </>
                  )}
                </div>
                {(links[it.id]?.supplier || links[it.id]?.customer) && (
                  <div className="mt-2 space-y-1 text-xs text-slate-500">
                    {links[it.id]?.supplier && <div className="break-all">Supplier: {links[it.id]?.supplier}</div>}
                    {links[it.id]?.customer && <div className="break-all">Customer: {links[it.id]?.customer}</div>}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </AdminLayout>
  );
}
