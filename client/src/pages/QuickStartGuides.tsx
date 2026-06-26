import AppLogo from "@/components/AppLogo";
import { RoleBasedRoute } from "@/components/RoleBasedRoute";
import QuickStartGuideIndex from "@/components/quickStart/QuickStartGuideIndex";
import QuickStartGuideRenderer from "@/components/quickStart/QuickStartGuideRenderer";
import { Button } from "@/components/ui/button";
import { useAuthContext } from "@/hooks/useAuthContext";
import {
  getGuideSlugForRole,
  getQuickStartGuide,
  quickStartGuides,
  type QuickStartGuideSlug,
} from "@/lib/quickStartGuides";
import { trpc } from "@/lib/trpc";
import { LayoutDashboard } from "lucide-react";
import { useEffect, useMemo } from "react";
import { toast } from "sonner";
import { useLocation } from "wouter";

const validGuideSlugs = new Set(quickStartGuides.map((guide) => guide.slug));

function slugFromPath(location: string, role?: string | null): QuickStartGuideSlug | null {
  const cleanPath = location.split("?")[0]?.replace(/\/$/, "") || location;
  const parts = cleanPath.split("/").filter(Boolean);
  const lastSegment = parts.at(-1);

  if (lastSegment === "my-guide") {
    return getGuideSlugForRole(role);
  }

  if (lastSegment && validGuideSlugs.has(lastSegment as QuickStartGuideSlug)) {
    return lastSegment as QuickStartGuideSlug;
  }

  return null;
}

function dashboardPathForRole(role?: string | null) {
  return role === "driver" ? "/driver" : "/manager";
}

function QuickStartGuidesContent() {
  const { user } = useAuthContext();
  const [location, navigate] = useLocation();
  const utils = trpc.useUtils();
  const guideSlug = useMemo(() => slugFromPath(location, user?.role), [location, user?.role]);
  const guide = getQuickStartGuide(guideSlug);

  const progressQuery = trpc.quickStart.getMine.useQuery(
    guide ? { manualSlug: guide.slug } : undefined,
    { enabled: Boolean(guide) }
  );
  const recordViewedMutation = trpc.quickStart.recordViewed.useMutation();
  const markCompleteMutation = trpc.quickStart.markComplete.useMutation({
    onSuccess: async () => {
      await utils.quickStart.getMine.invalidate();
      toast.success("Quick Start Guide marked complete.");
    },
  });

  useEffect(() => {
    if (!guide || recordViewedMutation.isPending) return;
    recordViewedMutation.mutate({ manualSlug: guide.slug });
  }, [guide?.slug]);

  const progress = Array.isArray(progressQuery.data) ? null : progressQuery.data;

  return (
    <div className="app-shell min-h-screen">
      <div className="quick-start-nav border-b border-slate-200 bg-white/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <AppLogo imageClassName="h-10" frameClassName="p-1.5" href={dashboardPathForRole(user?.role)} />
          <Button
            variant="outline"
            className="rounded-full bg-white"
            onClick={() => navigate(dashboardPathForRole(user?.role))}
          >
            <LayoutDashboard className="h-4 w-4" />
            Dashboard
          </Button>
        </div>
      </div>

      {guide ? (
        <QuickStartGuideRenderer
          guide={guide}
          completed={Boolean(progress?.manualCompletedAt)}
          isCompleting={markCompleteMutation.isPending}
          onComplete={() => markCompleteMutation.mutate({ manualSlug: guide.slug })}
        />
      ) : (
        <QuickStartGuideIndex userRole={user?.role} />
      )}
    </div>
  );
}

export default function QuickStartGuides() {
  return (
    <RoleBasedRoute requiredRoles={["owner", "manager", "driver", "owner_operator"]}>
      <QuickStartGuidesContent />
    </RoleBasedRoute>
  );
}
