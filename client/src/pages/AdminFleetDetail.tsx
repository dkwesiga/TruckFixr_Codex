import { useEffect, useState } from "react";
import type { ComponentType, ReactNode } from "react";
import { useLocation, useRoute } from "wouter";
import { toast } from "sonner";
import { ArrowLeft, CalendarDays, ClipboardCheck, CreditCard, FileText, Save, SearchCode, ShieldAlert, Truck, Users } from "lucide-react";
import { AdminLayout } from "@/components/admin/AdminLayout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { trpc } from "@/lib/trpc";

function formatDate(value: unknown) {
  if (!value) return "Not set";
  const date = new Date(String(value));
  if (Number.isNaN(date.getTime())) return "Not set";
  return date.toLocaleString(undefined, { month: "short", day: "numeric", year: "numeric", hour: "numeric", minute: "2-digit" });
}

function formatCurrency(value: unknown) {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
    maximumFractionDigits: 0,
  }).format(Number(value ?? 0));
}

function Badge({ value, tone = "slate" }: { value: string; tone?: "slate" | "green" | "amber" | "red" | "blue" }) {
  const classes = {
    slate: "border-slate-200 bg-slate-100 text-slate-700",
    green: "border-emerald-200 bg-emerald-50 text-emerald-700",
    amber: "border-amber-200 bg-amber-50 text-amber-800",
    red: "border-red-200 bg-red-50 text-red-700",
    blue: "border-blue-200 bg-blue-50 text-blue-700",
  };
  return <span className={`inline-flex rounded-full border px-2.5 py-1 text-xs font-semibold ${classes[tone]}`}>{value}</span>;
}

function riskTone(value?: string) {
  if (value === "healthy") return "green" as const;
  if (value === "high_priority" || value === "billing_risk" || value === "compliance_risk") return "red" as const;
  if (value === "inactive" || value === "diagnostic_follow_up_risk") return "amber" as const;
  return "blue" as const;
}

function StatCard(props: { label: string; value: string | number; icon: ComponentType<{ className?: string }> }) {
  const Icon = props.icon;
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-center justify-between gap-3">
        <p className="text-sm font-medium text-slate-500">{props.label}</p>
        <Icon className="h-4 w-4 text-slate-500" />
      </div>
      <p className="mt-2 text-2xl font-semibold text-slate-950">{props.value}</p>
    </div>
  );
}

function DetailSection({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  return (
    <Card className="border-slate-200 shadow-sm">
      <CardHeader>
        <CardTitle>{title}</CardTitle>
        {description ? <CardDescription>{description}</CardDescription> : null}
      </CardHeader>
      <CardContent>{children}</CardContent>
    </Card>
  );
}

export default function AdminFleetDetail() {
  const [, params] = useRoute("/admin/fleets/:fleetId");
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const fleetId = Number(params?.fleetId ?? 0);
  const detailQuery = trpc.admin.fleetDetail.useQuery({ fleetId }, { enabled: fleetId > 0 });
  const adminQuery = trpc.admin.me.useQuery(undefined, { retry: false });
  const canWrite = Boolean(adminQuery.data?.canWrite);
  const canChangeAccountType = adminQuery.data?.role === "super_admin";
  const [note, setNote] = useState("");
  const [followUpStatus, setFollowUpStatus] = useState("healthy");
  const [riskStatus, setRiskStatus] = useState("healthy");
  const [riskReason, setRiskReason] = useState("");
  const [nextFollowUpAt, setNextFollowUpAt] = useState("");
  const [accountType, setAccountType] = useState("production");

  const detail = detailQuery.data;

  useEffect(() => {
    if (!detail) return;
    setFollowUpStatus(detail.summary.followUpStatus || "healthy");
    setRiskStatus(detail.summary.riskStatus || "healthy");
    setRiskReason(detail.summary.riskReason || "");
    setNextFollowUpAt(detail.summary.nextFollowUpAt ? String(detail.summary.nextFollowUpAt).slice(0, 10) : "");
    setAccountType(detail.summary.accountType || "production");
  }, [detail]);

  const addNoteMutation = trpc.admin.addFleetNote.useMutation({
    onSuccess: async () => {
      toast.success("Admin note added.");
      setNote("");
      await utils.admin.fleetDetail.invalidate({ fleetId });
    },
  });
  const updateFollowUpMutation = trpc.admin.updateFollowUp.useMutation({
    onSuccess: async () => {
      toast.success("Follow-up status updated.");
      await utils.admin.fleetDetail.invalidate({ fleetId });
      await utils.admin.metrics.invalidate();
    },
  });
  const updateAccountTypeMutation = trpc.admin.updateAccountType.useMutation({
    onSuccess: async () => {
      toast.success("Account type updated.");
      await utils.admin.fleetDetail.invalidate({ fleetId });
      await utils.admin.metrics.invalidate();
    },
  });

  if (!fleetId) {
    return (
      <AdminLayout>
        <Card className="border-red-200 bg-red-50">
          <CardContent className="py-4 text-sm text-red-700">Invalid fleet ID.</CardContent>
        </Card>
      </AdminLayout>
    );
  }

  return (
    <AdminLayout>
      <div className="mx-auto max-w-[1500px] space-y-6">
        <div className="flex flex-col gap-4 xl:flex-row xl:items-start xl:justify-between">
          <div>
            <Button variant="outline" className="mb-4" onClick={() => navigate("/admin/metrics")}>
              <ArrowLeft className="mr-2 h-4 w-4" />
              Back to metrics
            </Button>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">Fleet drill-down</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">{detail?.summary.name ?? "Fleet"}</h1>
            <div className="mt-3 flex flex-wrap gap-2">
              <Badge value={detail?.summary.accountType ?? "production"} tone={detail?.summary.accountType === "production" ? "green" : "amber"} />
              <Badge value={detail?.summary.planLabel ?? "Plan"} tone="blue" />
              <Badge value={detail?.summary.billingStatus ?? "billing"} tone={detail?.summary.billingStatus === "active" ? "green" : "amber"} />
              <Badge value={String(detail?.summary.riskStatus ?? "healthy").replaceAll("_", " ")} tone={riskTone(detail?.summary.riskStatus)} />
            </div>
          </div>
          <Card className="w-full border-slate-200 shadow-sm xl:max-w-md">
            <CardHeader>
              <CardTitle>Risk & Follow-Up</CardTitle>
              <CardDescription>{detail?.summary.suggestedFollowUp ?? "Loading follow-up guidance."}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <Label>Follow-up status</Label>
                  <select
                    value={followUpStatus}
                    disabled={!canWrite}
                    onChange={(event) => setFollowUpStatus(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    {["healthy", "needs_onboarding", "follow_up_needed", "at_risk", "converted", "churned"].map((value) => (
                      <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </div>
                <div>
                  <Label>Risk status</Label>
                  <select
                    value={riskStatus}
                    disabled={!canWrite}
                    onChange={(event) => setRiskStatus(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    {["healthy", "needs_onboarding", "inactive", "billing_risk", "compliance_risk", "diagnostic_follow_up_risk", "high_priority"].map((value) => (
                      <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </div>
              </div>
              <div>
                <Label>Risk reason</Label>
                <Textarea value={riskReason} disabled={!canWrite} onChange={(event) => setRiskReason(event.target.value)} className="mt-1" />
              </div>
              <div>
                <Label>Next follow-up</Label>
                <Input type="date" value={nextFollowUpAt} disabled={!canWrite} onChange={(event) => setNextFollowUpAt(event.target.value)} className="mt-1" />
              </div>
              {canWrite ? (
                <Button
                  className="w-full"
                  disabled={updateFollowUpMutation.isPending}
                  onClick={() =>
                    updateFollowUpMutation.mutate({
                      fleetId,
                      followUpStatus: followUpStatus as any,
                      riskStatus: riskStatus as any,
                      riskReason: riskReason.trim() || null,
                      nextFollowUpAt: nextFollowUpAt || null,
                    })
                  }
                >
                  <Save className="mr-2 h-4 w-4" />
                  Save follow-up
                </Button>
              ) : null}
            </CardContent>
          </Card>
        </div>

        {detailQuery.error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">{detailQuery.error.message}</CardContent>
          </Card>
        ) : null}

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <StatCard label="Active users" value={detail?.usage.activeUsers ?? 0} icon={Users} />
          <StatCard label="Inspections completed" value={detail?.usage.inspectionsCompleted ?? 0} icon={ClipboardCheck} />
          <StatCard label="Diagnostics started" value={detail?.usage.diagnosticsStarted ?? 0} icon={SearchCode} />
          <StatCard label="MRR" value={formatCurrency(detail?.subscription.mrr)} icon={CreditCard} />
        </section>

        <section className="grid gap-6 xl:grid-cols-2">
          <DetailSection title="Fleet Summary" description="Company account, lifecycle, billing, and latest activity.">
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                ["Account type", detail?.summary.accountType],
                ["Plan", detail?.summary.planLabel],
                ["Billing status", detail?.summary.billingStatus],
                ["Created", formatDate(detail?.summary.createdAt)],
                ["Trial ends", formatDate(detail?.summary.trialEndsAt)],
                ["Pilot ends", formatDate(detail?.summary.paidPilotEndsAt)],
                ["Last active", formatDate(detail?.summary.lastActiveAt)],
                ["Follow-up", detail?.summary.followUpStatus],
              ].map(([label, value]) => (
                <div key={label} className="rounded-lg border border-slate-200 bg-slate-50 p-3">
                  <p className="text-xs uppercase tracking-[0.12em] text-slate-500">{label}</p>
                  <p className="mt-1 font-semibold text-slate-950">{value || "Not set"}</p>
                </div>
              ))}
            </div>
            {canChangeAccountType ? (
              <div className="mt-4 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row sm:items-end">
                <div className="flex-1">
                  <Label>Account type</Label>
                  <select
                    value={accountType}
                    onChange={(event) => setAccountType(event.target.value)}
                    className="mt-1 h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm"
                  >
                    {["production", "demo", "internal_test", "archived"].map((value) => (
                      <option key={value} value={value}>{value.replaceAll("_", " ")}</option>
                    ))}
                  </select>
                </div>
                <Button
                  disabled={updateAccountTypeMutation.isPending}
                  onClick={() => updateAccountTypeMutation.mutate({ fleetId, accountType: accountType as any })}
                >
                  Update account type
                </Button>
              </div>
            ) : null}
          </DetailSection>

          <DetailSection title="Usage Snapshot" description="Setup completion and latest operational activity.">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Setup completion" value={`${detail?.usage.setupCompletion ?? 0}%`} icon={CheckIcon} />
              <StatCard label="Last inspection" value={formatDate(detail?.usage.lastInspectionAt)} icon={ClipboardCheck} />
              <StatCard label="Last diagnostic" value={formatDate(detail?.usage.lastDiagnosticAt)} icon={SearchCode} />
              <StatCard label="Next follow-up" value={formatDate(detail?.summary.nextFollowUpAt)} icon={CalendarDays} />
            </div>
          </DetailSection>
        </section>

        <section className="grid gap-6 xl:grid-cols-3">
          <DetailSection title="Assets" description="Powered vehicles, trailers, and recently added assets.">
            <div className="grid gap-3 sm:grid-cols-2">
              <StatCard label="Powered vehicles" value={detail?.assets.poweredVehicles ?? 0} icon={Truck} />
              <StatCard label="Trailers" value={detail?.assets.trailers ?? 0} icon={Truck} />
              <StatCard label="Active assets" value={detail?.assets.activeAssets ?? 0} icon={Truck} />
              <StatCard label="Inactive assets" value={detail?.assets.inactiveAssets ?? 0} icon={Truck} />
            </div>
            <div className="mt-4 space-y-2">
              {(detail?.assets.recentlyAddedAssets ?? []).slice(0, 6).map((asset: any) => (
                <div key={asset.id} className="rounded-lg border border-slate-200 bg-white p-3 text-sm">
                  <p className="font-semibold text-slate-950">{asset.unitNumber || asset.id}</p>
                  <p className="text-slate-500">{asset.assetType} | {asset.vin}</p>
                </div>
              ))}
            </div>
          </DetailSection>

          <DetailSection title="Inspection Activity" description="Inspection compliance and defect state.">
            <div className="grid gap-3">
              {[
                ["Completed", detail?.inspections.completed],
                ["Missed", detail?.inspections.missed],
                ["Failed", detail?.inspections.failed],
                ["Defects reported", detail?.inspections.defectsReported],
                ["Unresolved defects", detail?.inspections.unresolvedDefects],
                ["Critical defects", detail?.inspections.criticalDefects],
                ["Completion rate", `${detail?.inspections.inspectionCompletionRate ?? 0}%`],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-950">{value}</span>
                </div>
              ))}
            </div>
          </DetailSection>

          <DetailSection title="Diagnostic Activity" description="AI triage usage and quality signals.">
            <div className="grid gap-3">
              {[
                ["Sessions started", detail?.diagnostics.sessionsStarted],
                ["Sessions completed", detail?.diagnostics.sessionsCompleted],
                ["Low-confidence cases", detail?.diagnostics.lowConfidenceCases],
                ["Unresolved cases", detail?.diagnostics.unresolvedCases],
              ].map(([label, value]) => (
                <div key={label} className="flex items-center justify-between rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
                  <span className="text-slate-500">{label}</span>
                  <span className="font-semibold text-slate-950">{value}</span>
                </div>
              ))}
              <div className="rounded-lg border border-slate-200 bg-white p-3">
                <p className="text-sm font-semibold text-slate-950">Top symptoms</p>
                <p className="mt-1 text-sm text-slate-500">
                  {(detail?.diagnostics.topSymptoms ?? []).map((item: any) => item.label).join(", ") || "No symptom data yet."}
                </p>
              </div>
            </div>
          </DetailSection>
        </section>

        <section className="grid gap-6 xl:grid-cols-[1fr_0.85fr]">
          <DetailSection title="Users" description="User-level details are visible only inside this authorized drill-down.">
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-xs uppercase tracking-[0.12em] text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4">Name</th>
                    <th className="pb-3 pr-4">Email</th>
                    <th className="pb-3 pr-4">Role</th>
                    <th className="pb-3 pr-4">Last active</th>
                    <th className="pb-3">Assigned assets</th>
                  </tr>
                </thead>
                <tbody>
                  {(detail?.users.members ?? []).map((member: any) => (
                    <tr key={member.id} className="border-b border-slate-100">
                      <td className="py-3 pr-4 font-semibold text-slate-950">{member.name || "Unnamed user"}</td>
                      <td className="py-3 pr-4 text-slate-600">{member.email || "No email"}</td>
                      <td className="py-3 pr-4">{member.role}</td>
                      <td className="py-3 pr-4">{formatDate(member.lastActiveAt)}</td>
                      <td className="py-3">{member.assignedAssets?.length ?? 0}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </DetailSection>

          <DetailSection title="Internal Admin Notes" description="Private admin notes never appear in investor exports.">
            {canWrite ? (
              <div className="space-y-3">
                <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Add internal note or follow-up context" />
                <Button
                  disabled={!note.trim() || addNoteMutation.isPending}
                  onClick={() => addNoteMutation.mutate({ fleetId, note: note.trim(), noteType: "general" })}
                >
                  <FileText className="mr-2 h-4 w-4" />
                  Add note
                </Button>
              </div>
            ) : (
              <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-500">
                Read-only viewers cannot add notes.
              </div>
            )}
            <div className="mt-4 space-y-3">
              {(detail?.notes ?? []).length === 0 ? (
                <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-4 text-sm text-slate-500">No admin notes yet.</div>
              ) : (
                detail?.notes.map((item: any) => (
                  <div key={item.id} className="rounded-lg border border-slate-200 bg-white p-3">
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-slate-950">{item.createdByName}</p>
                      <p className="text-xs text-slate-500">{formatDate(item.createdAt)}</p>
                    </div>
                    <p className="mt-2 text-sm text-slate-600">{item.note}</p>
                  </div>
                ))
              )}
            </div>
          </DetailSection>
        </section>
      </div>
    </AdminLayout>
  );
}

function CheckIcon(props: { className?: string }) {
  return <ShieldAlert {...props} />;
}
