import { useMemo, useRef, useState } from "react";
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
import { trpc } from "@/lib/trpc";
import { REPAIR_DOCUMENT_TYPES } from "@shared/maintenance/documentLimits";
import { SAFETY_DISCLAIMERS } from "@shared/maintenance/caseWorkflow";
import { toast } from "sonner";
import { FileText, Loader2, ShieldCheck, Upload } from "lucide-react";

const FINDING_STYLES: Record<string, string> = {
  high: "border-red-200 bg-red-50 text-red-800",
  verify: "border-amber-200 bg-amber-50 text-amber-800",
  info: "border-slate-200 bg-slate-50 text-slate-600",
};

function toCents(value: string): number {
  const n = Number(value);
  return Number.isFinite(n) ? Math.round(n * 100) : 0;
}

export default function RepairDocumentsSection({ caseId }: { caseId: number }) {
  const utils = trpc.useUtils();
  const fileRef = useRef<HTMLInputElement>(null);
  const [docType, setDocType] = useState("estimate");
  const [entryDocId, setEntryDocId] = useState<number | null>(null);
  const [estimateDocId, setEstimateDocId] = useState<string>("");
  const [invoiceDocId, setInvoiceDocId] = useState<string>("");

  const caps = trpc.fleetMaintenance.capabilities.useQuery(undefined, { retry: false });
  const enabled =
    caps.data?.capabilities.pilotEligible === true &&
    (caps.data?.capabilities as { repairDocumentReview?: boolean })?.repairDocumentReview === true;

  const listQuery = trpc.repairDocuments.list.useQuery(
    { caseId },
    { enabled, retry: false }
  );
  const docs = listQuery.data ?? [];

  const invalidate = () => void utils.repairDocuments.list.invalidate({ caseId });
  const onErr = (e: { message: string }) => toast.error(e.message);

  const upload = trpc.repairDocuments.upload.useMutation({
    onSuccess: (res) => {
      if (res.status === "uploaded") { toast.success("Document uploaded."); invalidate(); }
      else if (res.status === "duplicate_in_case") toast.error("Identical file already on this case.");
      else if (res.status === "duplicate_in_fleet") toast.error("Identical file exists in your fleet; re-choose to confirm.");
      else toast.error(res.errors?.[0] ?? "Upload rejected.");
      if (fileRef.current) fileRef.current.value = "";
    },
    onError: onErr,
  });
  const saveFields = trpc.repairDocuments.saveFields.useMutation({
    onSuccess: () => { toast.success("Values saved."); setEntryDocId(null); invalidate(); },
    onError: onErr,
  });
  const compare = trpc.repairDocuments.compare.useMutation({ onError: onErr });
  const authorize = trpc.repairDocuments.authorize.useMutation({ onError: onErr });

  async function onFile(file: File, allowFleetDuplicate: boolean) {
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    const base64Content = dataUrl.split(",")[1] ?? "";
    upload.mutate({
      caseId,
      documentType: docType as never,
      filename: file.name,
      declaredMimeType: file.type || "application/octet-stream",
      base64Content,
      allowFleetDuplicate,
    });
  }

  if (!enabled) return null;

  return (
    <Card>
      <CardHeader><CardTitle className="text-base">Repair documents</CardTitle></CardHeader>
      <CardContent className="space-y-4">
        {/* Upload */}
        <div className="flex flex-wrap items-end gap-2">
          <div className="space-y-1">
            <Label className="text-xs">Type</Label>
            <Select value={docType} onValueChange={setDocType}>
              <SelectTrigger className="h-9 w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                {REPAIR_DOCUMENT_TYPES.map((t) => <SelectItem key={t} value={t}>{t.replace(/_/g, " ")}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>
          <input ref={fileRef} type="file" accept=".pdf,.jpg,.jpeg,.png,.webp" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) void onFile(f, false); }} />
          <Button variant="outline" size="sm" disabled={upload.isPending} onClick={() => fileRef.current?.click()}>
            {upload.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Upload className="mr-2 h-4 w-4" />}
            Upload (PDF / image)
          </Button>
        </div>

        {/* List */}
        {docs.length === 0 ? (
          <p className="text-sm text-slate-500">No documents yet.</p>
        ) : (
          <ul className="space-y-2">
            {docs.map((d) => (
              <li key={d.id} className="rounded-lg border border-slate-200 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-sm">
                    <FileText className="h-4 w-4 text-slate-400" />
                    <span className="font-medium text-slate-900">{d.originalFilename}</span>
                    <Badge variant="outline">{String(d.documentType).replace(/_/g, " ")}</Badge>
                    <Badge variant="outline" className="capitalize">{String(d.processingState).replace(/_/g, " ")}</Badge>
                  </span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="ghost"
                      onClick={async () => {
                        try {
                          const { url } = await utils.repairDocuments.downloadUrl.fetch({ documentId: d.id });
                          window.open(url, "_blank", "noopener");
                        } catch (e) { onErr(e as { message: string }); }
                      }}>View</Button>
                    <Button size="sm" variant="outline" onClick={() => setEntryDocId(entryDocId === d.id ? null : d.id)}>
                      {d.normalizedFieldsJson ? "Correct values" : "Enter values"}
                    </Button>
                  </div>
                </div>
                {entryDocId === d.id ? (
                  <ValueEntryForm
                    isCorrection={!!d.normalizedFieldsJson}
                    pending={saveFields.isPending}
                    onSave={(fields) => saveFields.mutate({ documentId: d.id, fields, isCorrection: !!d.normalizedFieldsJson })}
                  />
                ) : null}
              </li>
            ))}
          </ul>
        )}

        {/* Comparison */}
        <div className="space-y-2 rounded-lg border border-slate-200 p-3">
          <p className="text-xs font-semibold text-slate-700">Compare estimate to invoice</p>
          <div className="flex flex-wrap items-center gap-2">
            <Select value={estimateDocId} onValueChange={setEstimateDocId}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Estimate" /></SelectTrigger>
              <SelectContent>{docs.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.originalFilename}</SelectItem>)}</SelectContent>
            </Select>
            <Select value={invoiceDocId} onValueChange={setInvoiceDocId}>
              <SelectTrigger className="h-9 w-44"><SelectValue placeholder="Invoice" /></SelectTrigger>
              <SelectContent>{docs.map((d) => <SelectItem key={d.id} value={String(d.id)}>{d.originalFilename}</SelectItem>)}</SelectContent>
            </Select>
            <Button size="sm" disabled={!estimateDocId || !invoiceDocId || compare.isPending}
              onClick={() => compare.mutate({ caseId, estimateDocumentId: Number(estimateDocId), invoiceDocumentId: Number(invoiceDocId) })}>
              Compare
            </Button>
          </div>
          {compare.data ? (
            <div className="space-y-1.5">
              <p className="text-xs font-semibold text-slate-700">Items to verify</p>
              {compare.data.findings.length === 0 ? (
                <p className="text-sm text-emerald-700">No discrepancies found.</p>
              ) : (
                compare.data.findings.map((f, i) => (
                  <div key={i} className={`rounded-md border px-2.5 py-1.5 text-xs ${FINDING_STYLES[f.severity] ?? ""}`}>
                    {f.message}
                  </div>
                ))
              )}
            </div>
          ) : null}
        </div>

        {/* Authorization */}
        <AuthorizeForm
          pending={authorize.isPending}
          result={authorize.data}
          onAuthorize={(cents, reviewed, scope, highVar) =>
            authorize.mutate({
              caseId,
              estimateCents: cents,
              valuesReviewed: reviewed,
              scopeMatchesAssessment: scope,
              hasUnresolvedHighVariance: highVar,
            })
          }
        />

        <p className="text-xs leading-5 text-slate-400">{SAFETY_DISCLAIMERS.short}</p>
      </CardContent>
    </Card>
  );
}

function ValueEntryForm({
  isCorrection,
  pending,
  onSave,
}: {
  isCorrection: boolean;
  pending: boolean;
  onSave: (fields: {
    currency: string; subtotalCents: number; taxCents: number; totalCents: number;
    labourHours: number | null; lineItems: never[];
  }) => void;
}) {
  const [currency, setCurrency] = useState("CAD");
  const [subtotal, setSubtotal] = useState("");
  const [tax, setTax] = useState("");
  const [total, setTotal] = useState("");
  const [hours, setHours] = useState("");
  return (
    <div className="mt-3 grid gap-2 sm:grid-cols-5">
      <div><Label className="text-xs">Currency</Label><Input value={currency} onChange={(e) => setCurrency(e.target.value)} /></div>
      <div><Label className="text-xs">Subtotal</Label><Input inputMode="decimal" value={subtotal} onChange={(e) => setSubtotal(e.target.value)} /></div>
      <div><Label className="text-xs">Tax</Label><Input inputMode="decimal" value={tax} onChange={(e) => setTax(e.target.value)} /></div>
      <div><Label className="text-xs">Total</Label><Input inputMode="decimal" value={total} onChange={(e) => setTotal(e.target.value)} /></div>
      <div><Label className="text-xs">Labour hrs</Label><Input inputMode="decimal" value={hours} onChange={(e) => setHours(e.target.value)} /></div>
      <div className="sm:col-span-5">
        <Button size="sm" disabled={pending}
          onClick={() => onSave({
            currency: currency.trim().toUpperCase(),
            subtotalCents: toCents(subtotal), taxCents: toCents(tax), totalCents: toCents(total),
            labourHours: hours ? Number(hours) : null, lineItems: [],
          })}>
          {isCorrection ? "Save correction" : "Save values"}
        </Button>
      </div>
    </div>
  );
}

function AuthorizeForm({
  pending,
  result,
  onAuthorize,
}: {
  pending: boolean;
  result: { decision: string; reasons: string[] } | undefined;
  onAuthorize: (cents: number, reviewed: boolean, scope: boolean, highVar: boolean) => void;
}) {
  const [amount, setAmount] = useState("");
  const [reviewed, setReviewed] = useState(false);
  const [scope, setScope] = useState(false);
  const [highVar, setHighVar] = useState(false);
  const decisionLabel = useMemo(() => (result ? result.decision.replace(/_/g, " ") : null), [result]);
  return (
    <div className="space-y-2 rounded-lg border border-slate-200 p-3">
      <p className="flex items-center gap-1.5 text-xs font-semibold text-slate-700">
        <ShieldCheck className="h-4 w-4 text-slate-400" /> Authorize repair
      </p>
      <div className="flex flex-wrap items-end gap-2">
        <div><Label className="text-xs">Estimate amount</Label><Input inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="e.g. 850.00" /></div>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={reviewed} onChange={(e) => setReviewed(e.target.checked)} /> Values reviewed</label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={scope} onChange={(e) => setScope(e.target.checked)} /> Scope matches</label>
        <label className="flex items-center gap-1.5 text-xs text-slate-600"><input type="checkbox" checked={highVar} onChange={(e) => setHighVar(e.target.checked)} /> Unresolved high variance</label>
        <Button size="sm" disabled={pending || !amount} onClick={() => onAuthorize(toCents(amount), reviewed, scope, highVar)}>Authorize</Button>
      </div>
      {result ? (
        <div className="text-xs">
          <span className="font-semibold text-slate-800">Decision: {decisionLabel}</span>
          {result.reasons.length > 0 ? <ul className="mt-1 list-disc pl-4 text-slate-600">{result.reasons.map((r, i) => <li key={i}>{r}</li>)}</ul> : null}
        </div>
      ) : null}
    </div>
  );
}
