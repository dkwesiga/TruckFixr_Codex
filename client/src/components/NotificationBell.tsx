import { useState } from "react";
import { Bell, Check } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

// In-app notification bell (TruckFixr V1.0). Reads inAppAlerts via the
// notifications router; in-app only (no email/SMS/push).

const ALERT_LABELS: Record<string, string> = {
  driver_issue_submitted: "New issue submitted",
  critical_defect_reported: "Critical defect reported",
  ai_triage_completed: "AI triage completed",
  emergency_attention: "Emergency attention",
  repair_scheduled: "Repair scheduled",
  repair_completed: "Repair completed",
  issue_closed: "Issue closed",
  inspection_report_submitted: "Inspection submitted",
  daily_inspection_missed: "Inspection missed",
  vehicle_access_request: "Vehicle access request",
  urgent_vehicle_access_request: "Urgent access request",
  vehicle_access_granted: "Vehicle access granted",
  vehicle_access_revoked: "Vehicle access revoked",
  vehicle_access_denied: "Vehicle access denied",
};

function alertLabel(type: string) {
  return ALERT_LABELS[type] ?? type.replace(/_/g, " ");
}

function severityDot(severity: string) {
  switch (severity) {
    case "critical":
      return "bg-red-500";
    case "warning":
      return "bg-amber-500";
    default:
      return "bg-blue-500";
  }
}

function timeAgo(value: string | Date) {
  const date = value instanceof Date ? value : new Date(value);
  const diff = Date.now() - date.getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return date.toLocaleDateString();
}

export function NotificationBell({ fleetId }: { fleetId: number | null }) {
  const [open, setOpen] = useState(false);
  const [, navigate] = useLocation();
  const utils = trpc.useUtils();
  const enabled = typeof fleetId === "number" && fleetId > 0;
  const resolvedFleetId = enabled ? (fleetId as number) : 0;

  const unreadQuery = trpc.notifications.unreadCount.useQuery(
    { fleetId: resolvedFleetId },
    { enabled, refetchInterval: 60_000, staleTime: 30_000 }
  );
  const listQuery = trpc.notifications.list.useQuery(
    { fleetId: resolvedFleetId, limit: 20 },
    { enabled: enabled && open }
  );

  const refresh = async () => {
    if (!enabled) return;
    await Promise.all([
      utils.notifications.unreadCount.invalidate({ fleetId: resolvedFleetId }),
      utils.notifications.list.invalidate({ fleetId: resolvedFleetId, limit: 20 }),
    ]);
  };

  const markReadMutation = trpc.notifications.markRead.useMutation({ onSuccess: refresh });
  const markAllReadMutation = trpc.notifications.markAllRead.useMutation({ onSuccess: refresh });

  const unread = unreadQuery.data ?? 0;
  const notifications = listQuery.data ?? [];

  const handleSelect = (notification: (typeof notifications)[number]) => {
    if (notification.status === "open") {
      markReadMutation.mutate({ id: notification.id });
    }
    setOpen(false);
    if (notification.defectId) {
      navigate(`/defect/${notification.defectId}`);
    } else if (notification.vehicleId) {
      navigate(`/truck/${notification.vehicleId}`);
    }
  };

  if (!enabled) return null;

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="icon"
          className="relative h-11 w-11 rounded-full border-slate-200 bg-white shadow-sm"
          aria-label="Notifications"
        >
          <Bell className="h-5 w-5 text-slate-700" />
          {unread > 0 ? (
            <span className="absolute -right-0.5 -top-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-600 px-1 text-[11px] font-semibold text-white">
              {unread > 9 ? "9+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 rounded-2xl p-0">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <p className="text-sm font-semibold text-slate-900">Notifications</p>
          {unread > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-auto px-2 py-1 text-xs"
              disabled={markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate({ fleetId: resolvedFleetId })}
            >
              <Check className="mr-1 h-3.5 w-3.5" />
              Mark all read
            </Button>
          ) : null}
        </div>
        <ScrollArea className="max-h-96">
          {listQuery.isLoading ? (
            <div className="px-4 py-6 text-center text-sm text-slate-500">Loading…</div>
          ) : notifications.length === 0 ? (
            <div className="px-4 py-8 text-center text-sm text-slate-500">
              No notifications yet.
            </div>
          ) : (
            <ul className="divide-y divide-slate-100">
              {notifications.map((notification) => (
                <li key={notification.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(notification)}
                    className={`flex w-full gap-3 px-4 py-3 text-left transition hover:bg-slate-50 ${
                      notification.status === "open" ? "bg-blue-50/40" : ""
                    }`}
                  >
                    <span
                      className={`mt-1.5 h-2 w-2 shrink-0 rounded-full ${severityDot(
                        notification.severity
                      )}`}
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center justify-between gap-2">
                        <span className="truncate text-sm font-medium text-slate-900">
                          {notification.title || alertLabel(notification.alertType)}
                        </span>
                        <span className="shrink-0 text-[11px] text-slate-400">
                          {timeAgo(notification.createdAt)}
                        </span>
                      </span>
                      {notification.message ? (
                        <span className="mt-0.5 block truncate text-xs text-slate-600">
                          {notification.message}
                        </span>
                      ) : null}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  );
}
