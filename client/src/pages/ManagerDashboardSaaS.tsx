import { useMemo } from "react";
import { useAuthContext } from "@/hooks/useAuthContext";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Input } from "@/components/ui/input";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import MorningFleetSummary from "@/components/MorningFleetSummary";
import {
  AlertTriangle,
  ArrowRight,
  ChevronRight,
  ClipboardCheck,
  LogOut,
  Search,
  ShieldCheck,
  Sparkles,
  Truck,
  Wrench,
} from "lucide-react";

type MetricCard = {
  title: string;
  value: string;
  change: string;
  tone: "neutral" | "success" | "warning" | "danger";
};

type UrgentItem = {
  truck: string;
  issue: string;
  detail: string;
  status: "Critical" | "Attention" | "Monitor";
};

type OperationsRow = {
  truck: string;
  route: string;
  status: "Operational" | "In Shop" | "Dispatch Hold";
  inspection: "Complete" | "Due Today" | "Overdue";
  issues: string;
  priority: "Low" | "Medium" | "High" | "Critical";
};

const metrics: MetricCard[] = [
  {
    title: "Active Trucks",
    value: "24",
    change: "+3 versus last week",
    tone: "neutral",
  },
  {
    title: "Critical Issues",
    value: "3",
    change: "2 blocking dispatch",
    tone: "danger",
  },
  {
    title: "Inspections Due Today",
    value: "7",
    change: "4 due before 10:00 AM",
    tone: "warning",
  },
  {
    title: "Fleet Health Score",
    value: "89%",
    change: "+4 points this week",
    tone: "success",
  },
];

const urgentItems: UrgentItem[] = [
  {
    truck: "Truck 42",
    issue: "Coolant temperature spike",
    detail: "Driver reported overheating on outbound route. Pull from dispatch and inspect cooling system.",
    status: "Critical",
  },
  {
    truck: "Truck 18",
    issue: "Brake inspection overdue",
    detail: "Inspection missed before morning release. Schedule immediate bay check before next assignment.",
    status: "Attention",
  },
  {
    truck: "Truck 07",
    issue: "Battery voltage instability",
    detail: "Repeated low-voltage trend over three starts. Monitor and plan service within 24 hours.",
    status: "Monitor",
  },
];

const operationsRows: OperationsRow[] = [
  {
    truck: "Truck 42",
    route: "Toronto to Windsor",
    status: "Dispatch Hold",
    inspection: "Complete",
    issues: "Engine cooling alert",
    priority: "Critical",
  },
  {
    truck: "Truck 18",
    route: "Yard standby",
    status: "In Shop",
    inspection: "Overdue",
    issues: "Brake service follow-up",
    priority: "High",
  },
  {
    truck: "Truck 09",
    route: "Mississauga local",
    status: "Operational",
    inspection: "Due Today",
    issues: "No active defects",
    priority: "Low",
  },
  {
    truck: "Truck 27",
    route: "Buffalo linehaul",
    status: "Operational",
    inspection: "Complete",
    issues: "Tire wear trend",
    priority: "Medium",
  },
];

function toneClasses(tone: MetricCard["tone"]) {
  switch (tone) {
    case "success":
      return "text-emerald-700";
    case "warning":
      return "text-amber-700";
    case "danger":
      return "text-red-700";
    default:
      return "text-slate-700";
  }
}

function badgeClasses(value: string) {
  switch (value) {
    case "Operational":
    case "Complete":
    case "Low":
    case "Monitor":
      return "bg-emerald-50 text-emerald-700 ring-emerald-200";
    case "Due Today":
    case "Medium":
      return "bg-amber-50 text-amber-700 ring-amber-200";
    case "Attention":
    case "High":
    case "In Shop":
      return "bg-orange-50 text-orange-700 ring-orange-200";
    case "Critical":
    case "Overdue":
    case "Dispatch Hold":
      return "bg-red-50 text-red-700 ring-red-200";
    default:
      return "bg-slate-100 text-slate-700 ring-slate-200";
  }
}

function ManagerDashboardContent() {
  const { user, logout } = useAuthContext();

  const initials = useMemo(() => {
    const name = user?.name?.trim() || "Manager";

    return name
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part.charAt(0).toUpperCase())
      .join("");
  }, [user?.name]);

  return (
    <div className="app-shell min-h-screen">
      <header className="border-b border-slate-200/80 bg-white/80 backdrop-blur-xl">
        <div className="mx-auto flex max-w-7xl flex-col gap-4 px-4 py-5 sm:px-6 lg:flex-row lg:items-center lg:justify-between lg:px-8">
          <div>
            <p className="section-label">Manager dashboard</p>
            <h1 className="mt-2 text-3xl font-semibold tracking-tight text-slate-950">
              Fleet operations center
            </h1>
            <p className="mt-2 text-sm text-slate-600">
              Dispatch readiness, inspection coverage, and maintenance priorities for the day.
            </p>
          </div>

          <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
            <div className="relative min-w-[260px]">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <Input
                placeholder="Search trucks, routes, or issues"
                className="h-10 rounded-full border-slate-200 bg-white pl-9 shadow-sm"
              />
            </div>
            <Button variant="outline" className="rounded-full border-slate-200 bg-white">
              Export morning brief
            </Button>
            <Button className="rounded-full bg-blue-600 text-white hover:bg-blue-700">
              Create work order
            </Button>
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="outline" className="h-10 rounded-full border-slate-200 bg-white px-2">
                  <Avatar className="h-7 w-7 border border-slate-200">
                    <AvatarFallback className="bg-slate-900 text-xs font-semibold text-white">
                      {initials}
                    </AvatarFallback>
                  </Avatar>
                  <div className="hidden text-left sm:block">
                    <p className="text-sm font-medium text-slate-900">
                      {user?.name || "Manager"}
                    </p>
                  </div>
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end" className="w-56 rounded-2xl border-slate-200 p-2">
                <div className="px-2 py-2">
                  <p className="text-sm font-semibold text-slate-900">{user?.name || "Manager"}</p>
                  <p className="text-xs text-slate-500">{user?.email || "Signed in"}</p>
                </div>
                <DropdownMenuSeparator />
                <DropdownMenuItem className="cursor-pointer rounded-xl">
                  Profile settings
                </DropdownMenuItem>
                <DropdownMenuItem className="cursor-pointer rounded-xl">
                  Team access
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem
                  onClick={logout}
                  className="cursor-pointer rounded-xl text-destructive focus:text-destructive"
                >
                  <LogOut className="mr-2 h-4 w-4" />
                  Sign out
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-7xl space-y-8 px-4 py-8 sm:px-6 lg:px-8">
        <section className="grid gap-6 xl:grid-cols-[1.25fr_0.75fr]">
          <div className="saas-card overflow-hidden p-0">
            <div className="border-b border-slate-200 bg-[linear-gradient(135deg,rgba(15,23,42,0.98),rgba(30,41,59,0.96))] px-7 py-7 text-white">
              <div className="flex flex-col gap-5 lg:flex-row lg:items-end lg:justify-between">
                <div>
                  <p className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs font-medium uppercase tracking-[0.18em] text-slate-300">
                    <Sparkles className="h-3.5 w-3.5 text-blue-300" />
                    Today&apos;s focus
                  </p>
                  <h2 className="mt-4 text-2xl font-semibold">
                    Three trucks need action before dispatch windows tighten.
                  </h2>
                  <p className="mt-3 max-w-2xl text-sm leading-7 text-slate-300">
                    Prioritize cooling system review on Truck 42, clear the overdue brake inspection on Truck 18,
                    and close today&apos;s seven inspection tasks before the late morning dispatch cycle.
                  </p>
                </div>
                <div className="grid gap-3 sm:grid-cols-3">
                  {[
                    ["Dispatch ready", "17"],
                    ["Hold or shop", "4"],
                    ["Waiting inspection", "7"],
                  ].map(([label, value]) => (
                    <div key={label} className="rounded-2xl border border-white/10 bg-white/5 px-4 py-4">
                      <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                        {label}
                      </p>
                      <p className="mt-2 text-2xl font-semibold text-white">{value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="grid gap-4 px-7 py-6 md:grid-cols-3">
              {[
                {
                  icon: ShieldCheck,
                  label: "Compliance posture",
                  value: "2 reports need sign-off",
                },
                {
                  icon: Wrench,
                  label: "Maintenance load",
                  value: "5 open work orders in progress",
                },
                {
                  icon: ClipboardCheck,
                  label: "Inspection throughput",
                  value: "71% completed by 8:30 AM",
                },
              ].map((item) => (
                <div key={item.label} className="rounded-2xl border border-slate-200 bg-slate-50/80 px-4 py-4">
                  <div className="flex items-center gap-2 text-sm font-medium text-slate-800">
                    <item.icon className="h-4 w-4 text-blue-600" />
                    {item.label}
                  </div>
                  <p className="mt-3 text-sm leading-7 text-slate-600">{item.value}</p>
                </div>
              ))}
            </div>
          </div>

          <div className="saas-card p-6">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="section-label">Needs immediate attention</p>
                <h2 className="mt-2 text-xl font-semibold text-slate-950">
                  Urgent decisions this morning
                </h2>
              </div>
              <AlertTriangle className="h-5 w-5 text-red-500" />
            </div>
            <div className="mt-6 space-y-4">
              {urgentItems.map((item) => (
                <div
                  key={item.truck}
                  className="rounded-2xl border border-slate-200 bg-slate-50/80 p-4"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="text-sm font-semibold text-slate-950">{item.truck}</p>
                      <p className="mt-1 text-sm font-medium text-slate-800">{item.issue}</p>
                      <p className="mt-2 text-sm leading-6 text-slate-600">{item.detail}</p>
                    </div>
                    <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(item.status)}`}>
                      {item.status}
                    </span>
                  </div>
                  <div className="mt-4 flex items-center justify-between">
                    <p className="text-xs uppercase tracking-[0.16em] text-slate-400">
                      Recommended next action
                    </p>
                    <Button variant="ghost" size="sm" className="rounded-full px-0 text-blue-700 hover:bg-transparent">
                      Review case
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {metrics.map((metric) => (
            <Card key={metric.title} className="metric-card border-0">
              <CardHeader className="pb-3">
                <CardDescription className="text-sm text-slate-500">
                  {metric.title}
                </CardDescription>
                <CardTitle className="text-3xl font-semibold text-slate-950">
                  {metric.value}
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-0">
                <div className={`flex items-center gap-2 text-sm font-medium ${toneClasses(metric.tone)}`}>
                  <ArrowRight className="h-4 w-4 rotate-[-45deg]" />
                  {metric.change}
                </div>
              </CardContent>
            </Card>
          ))}
        </section>

        <section className="grid gap-6 xl:grid-cols-[1.35fr_0.65fr]">
          <div className="saas-card p-0">
            <div className="flex flex-col gap-2 border-b border-slate-200 px-7 py-6 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <p className="section-label">Fleet operations</p>
                <h2 className="mt-2 text-2xl font-semibold text-slate-950">
                  Trucks, readiness, and follow-up
                </h2>
                <p className="mt-2 text-sm text-slate-600">
                  Scan status, inspection coverage, active issues, and priority from one table.
                </p>
              </div>
              <Button variant="outline" className="rounded-full border-slate-200 bg-white">
                Open maintenance queue
              </Button>
            </div>

            <div className="overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead className="bg-slate-50/80 text-slate-500">
                  <tr>
                    {["Truck", "Status", "Inspection", "Issues", "Priority", "Action"].map((heading) => (
                      <th key={heading} className="px-7 py-4 font-medium">
                        {heading}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {operationsRows.map((row) => (
                    <tr key={row.truck} className="border-t border-slate-200/80">
                      <td className="px-7 py-5 align-top">
                        <div className="flex items-start gap-3">
                          <div className="mt-0.5 flex h-10 w-10 items-center justify-center rounded-2xl bg-slate-100 text-slate-700">
                            <Truck className="h-4 w-4" />
                          </div>
                          <div>
                            <p className="font-semibold text-slate-950">{row.truck}</p>
                            <p className="mt-1 text-xs uppercase tracking-[0.14em] text-slate-400">
                              {row.route}
                            </p>
                          </div>
                        </div>
                      </td>
                      <td className="px-7 py-5 align-top">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.status)}`}>
                          {row.status}
                        </span>
                      </td>
                      <td className="px-7 py-5 align-top">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.inspection)}`}>
                          {row.inspection}
                        </span>
                      </td>
                      <td className="px-7 py-5 align-top text-slate-600">{row.issues}</td>
                      <td className="px-7 py-5 align-top">
                        <span className={`rounded-full px-2.5 py-1 text-xs font-medium ring-1 ${badgeClasses(row.priority)}`}>
                          {row.priority}
                        </span>
                      </td>
                      <td className="px-7 py-5 align-top">
                        <Button variant="ghost" size="sm" className="rounded-full text-blue-700 hover:bg-blue-50">
                          View details
                          <ChevronRight className="h-4 w-4" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          <div className="space-y-6">
            <MorningFleetSummary fleetId={1} />

            <div className="saas-card p-6">
              <p className="section-label">Operations summary</p>
              <h2 className="mt-2 text-xl font-semibold text-slate-950">
                What the team should do next
              </h2>
              <div className="mt-6 space-y-4">
                {[
                  "Hold Truck 42 until cooling system diagnostics are confirmed.",
                  "Close overdue inspection gaps before 10:00 AM dispatch.",
                  "Review the five open work orders and release two trucks still in shop.",
                ].map((item) => (
                  <div key={item} className="flex items-start gap-3">
                    <div className="mt-1 h-2.5 w-2.5 rounded-full bg-blue-600" />
                    <p className="text-sm leading-7 text-slate-600">{item}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default function ManagerDashboardSaaS() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager"]}>
      <ManagerDashboardContent />
    </RoleBasedRoute>
  );
}
