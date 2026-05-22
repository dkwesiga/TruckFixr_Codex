import type { ReactNode } from "react";
import { useLocation } from "wouter";
import {
  BarChart3,
  Building2,
  ClipboardCheck,
  CreditCard,
  FileDown,
  LogOut,
  Menu,
  SearchCode,
  Settings2,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import { useAuthContext } from "@/hooks/useAuthContext";
import { trpc } from "@/lib/trpc";

const navItems = [
  { href: "/admin/metrics", label: "Metrics", icon: BarChart3 },
  { href: "/admin/fleets", label: "Fleets", icon: Building2 },
  { href: "/admin/metrics#billing", label: "Billing", icon: CreditCard },
  { href: "/admin/metrics#compliance", label: "Compliance", icon: ClipboardCheck },
  { href: "/admin/metrics#diagnostics", label: "Diagnostics", icon: SearchCode },
  { href: "/admin/metrics#investor", label: "Investor Snapshot", icon: FileDown },
];

function AdminGate({ children }: { children: ReactNode }) {
  const adminQuery = trpc.admin.me.useQuery(undefined, { retry: false });

  if (adminQuery.isLoading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <div className="rounded-xl border border-slate-200 bg-white px-5 py-4 text-sm text-slate-600 shadow-sm">
          Loading internal admin access...
        </div>
      </div>
    );
  }

  if (adminQuery.error || !adminQuery.data) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4">
        <Card className="w-full max-w-md border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Internal admin access required</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3 text-sm text-slate-600">
            <p>This dashboard is limited to TruckFixr internal administrators.</p>
            <Button variant="outline" className="w-full" onClick={() => { window.location.href = "/"; }}>
              Return to TruckFixr
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return <>{children}</>;
}

export function AdminLayout({ children }: { children: ReactNode }) {
  const [location, navigate] = useLocation();
  const { user, logout } = useAuthContext();
  const adminQuery = trpc.admin.me.useQuery(undefined, { retry: false });
  const initials =
    user?.name
      ?.split(/\s+/)
      .filter(Boolean)
      .slice(0, 2)
      .map((part) => part[0]?.toUpperCase())
      .join("") || "A";

  return (
    <RoleBasedRoute>
      <AdminGate>
        <div className="min-h-screen bg-slate-50 text-slate-950">
          <aside className="fixed inset-y-0 left-0 z-20 hidden w-72 border-r border-slate-200 bg-white px-4 py-5 lg:block">
            <div className="flex items-center gap-3 px-2">
              <AppLogo variant="icon" imageClassName="h-full w-full" href="/admin/metrics" />
              <div>
                <p className="text-sm font-semibold text-slate-950">TruckFixr</p>
                <p className="text-xs text-slate-500">Internal Admin</p>
              </div>
            </div>
            <nav className="mt-8 space-y-1">
              {navItems.map((item) => {
                const Icon = item.icon;
                const active = location === item.href || (item.href.startsWith("/admin/metrics") && location === "/admin");
                return (
                  <button
                    key={item.href}
                    type="button"
                    onClick={() => navigate(item.href)}
                    className={`flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left text-sm font-medium transition ${
                      active ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                    }`}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
            <div className="absolute bottom-5 left-4 right-4 rounded-lg border border-slate-200 bg-slate-50 p-3">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-emerald-600" />
                {adminQuery.data?.role?.replaceAll("_", " ") ?? "admin"}
              </div>
              <p className="mt-1 text-xs text-slate-500">Backend staff checks protect every admin metric route.</p>
            </div>
          </aside>
          <div className="lg:pl-72">
            <header className="sticky top-0 z-30 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-3">
                  <AppLogo variant="full" imageClassName="h-full w-full" href="/admin/metrics" />
                  <div className="hidden sm:block">
                    <p className="text-sm font-semibold text-slate-950">TruckFixr Admin Metrics Dashboard</p>
                    <p className="text-xs text-slate-500">Internal admin workspace</p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm" className="hidden sm:inline-flex" onClick={() => navigate("/admin/metrics")}>
                    Metrics
                  </Button>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <button
                        type="button"
                        className="inline-flex h-11 items-center gap-2 rounded-full border border-slate-200 bg-white px-3 text-left shadow-sm transition hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400"
                        aria-label="Admin account menu"
                      >
                        <Avatar className="h-7 w-7 border border-slate-200">
                          <AvatarFallback className="bg-slate-900 text-[11px] font-semibold text-white">
                            {initials}
                          </AvatarFallback>
                        </Avatar>
                        <div className="hidden max-w-40 sm:block">
                          <p className="truncate text-sm font-medium text-slate-900">{user?.name || "Admin"}</p>
                          <p className="truncate text-xs text-slate-500">{adminQuery.data?.role?.replaceAll("_", " ") ?? "admin"}</p>
                        </div>
                        <Menu className="h-4 w-4 text-slate-500 sm:hidden" />
                      </button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end" className="w-60 rounded-2xl border-slate-200 p-2">
                      <div className="px-2 py-2">
                        <p className="text-sm font-semibold text-slate-900">{user?.name || "Admin"}</p>
                        <p className="text-xs text-slate-500">{user?.email || "Signed in"}</p>
                      </div>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/profile")}>
                        <Settings2 className="mr-2 h-4 w-4" />
                        <span>Profile settings</span>
                      </DropdownMenuItem>
                      <DropdownMenuItem className="cursor-pointer rounded-xl" onClick={() => navigate("/auth/email")}>
                        <UserRound className="mr-2 h-4 w-4" />
                        <span>Login</span>
                      </DropdownMenuItem>
                      <DropdownMenuSeparator />
                      <DropdownMenuItem onClick={logout} className="cursor-pointer rounded-xl text-destructive focus:text-destructive">
                        <LogOut className="mr-2 h-4 w-4" />
                        <span>Sign out</span>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </div>
            </header>
            <main className="px-4 py-6 sm:px-6 lg:px-8">{children}</main>
          </div>
        </div>
      </AdminGate>
    </RoleBasedRoute>
  );
}
