import { useState } from "react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

export default function AdminBillingDashboard() {
  const [query, setQuery] = useState("");
  const dashboardQuery = trpc.subscriptions.adminDashboard.useQuery({ query });

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,#f8fafc_0%,#eef3f8_100%)] px-4 py-8 sm:px-6 lg:px-8">
      <div className="mx-auto max-w-7xl space-y-6">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.16em] text-blue-700">
              Internal Billing
            </p>
            <h1 className="mt-2 text-3xl font-bold text-slate-950">Subscriptions and fleet leads</h1>
            <p className="mt-2 text-sm text-slate-600">
              Search accounts, monitor billing state, review Fleet leads, and spot billing issues quickly.
            </p>
          </div>
          <div className="w-full max-w-sm">
            <Input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by name, email, role, or plan"
            />
          </div>
        </div>

        <Card className="border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Accounts</CardTitle>
            <CardDescription>
              Current plan, cadence, active vehicles, billable vehicles, Stripe status, and trial state.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="border-b border-slate-200 text-slate-500">
                  <tr>
                    <th className="pb-3 pr-4 font-medium">Account</th>
                    <th className="pb-3 pr-4 font-medium">Plan</th>
                    <th className="pb-3 pr-4 font-medium">Cadence</th>
                    <th className="pb-3 pr-4 font-medium">Billing</th>
                    <th className="pb-3 pr-4 font-medium">Active</th>
                    <th className="pb-3 pr-4 font-medium">Billable</th>
                    <th className="pb-3 pr-4 font-medium">Trial</th>
                    <th className="pb-3 font-medium">Stripe</th>
                  </tr>
                </thead>
                <tbody>
                  {(dashboardQuery.data?.accounts ?? []).map((account) => (
                    <tr key={`${account.userId}-${account.email ?? "no-email"}`} className="border-b border-slate-100">
                      <td className="py-3 pr-4">
                        <div className="font-medium text-slate-900">{account.name || "Unnamed user"}</div>
                        <div className="text-xs text-slate-500">{account.email || "No email"}</div>
                      </td>
                      <td className="py-3 pr-4 uppercase">{account.tier}</td>
                      <td className="py-3 pr-4">{account.billingCadence}</td>
                      <td className="py-3 pr-4">{account.billingStatusLabel}</td>
                      <td className="py-3 pr-4">{account.activeVehicleCount}</td>
                      <td className="py-3 pr-4">{account.billableVehicleCount}</td>
                      <td className="py-3 pr-4">{account.trialActive ? "Active trial" : "No trial"}</td>
                      <td className="py-3">
                        {account.stripeSubscriptionId ? "Connected" : "Not linked"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        <div className="grid gap-6 lg:grid-cols-2">
          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Fleet Quote Requests</CardTitle>
              <CardDescription>Sales-assisted Fleet interest and pending reviews.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(dashboardQuery.data?.quoteRequests ?? []).map((lead) => (
                <div key={lead.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">{lead.companyName}</p>
                      <p className="text-sm text-slate-600">{lead.contactName} · {lead.email}</p>
                    </div>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-slate-700">
                      {lead.status}
                    </span>
                  </div>
                  <p className="mt-3 text-sm text-slate-700">{lead.mainNeeds}</p>
                  <p className="mt-2 text-xs text-slate-500">
                    {lead.vehicleCount} vehicles · {lead.driverCount} drivers
                  </p>
                </div>
              ))}
            </CardContent>
          </Card>

          <Card className="border-slate-200 shadow-sm">
            <CardHeader>
              <CardTitle>Admin Alerts</CardTitle>
              <CardDescription>Billing and Fleet notifications created for TruckFixr staff.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {(dashboardQuery.data?.adminAlerts ?? []).map((alert) => (
                <div key={alert.id} className="rounded-xl border border-slate-200 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-semibold text-slate-900">{alert.title}</p>
                    <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.14em] text-amber-900">
                      {alert.status}
                    </span>
                  </div>
                  <p className="mt-2 text-sm text-slate-600">{alert.body}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </div>

        {dashboardQuery.error ? (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="py-4 text-sm text-red-700">
              {dashboardQuery.error.message}
            </CardContent>
          </Card>
        ) : null}

        <div className="flex">
          <Button variant="outline" onClick={() => dashboardQuery.refetch()}>
            Refresh dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
