import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  getGuideSlugForRole,
  quickStartGuides,
  type QuickStartGuideSlug,
} from "@/lib/quickStartGuides";
import { ArrowRight, BookOpenCheck } from "lucide-react";
import { useLocation } from "wouter";

type QuickStartGuideIndexProps = {
  userRole?: string | null;
};

const guideDescriptions: Record<QuickStartGuideSlug, string> = {
  driver: "Daily inspections, assigned vehicles, issue reporting, and safe AI diagnostics.",
  "owner-operator": "Equipment setup, inspections, diagnostics, reminders, and uptime follow-up.",
  "fleet-manager": "Drivers, assignments, inspection review, defects, diagnostics, and maintenance follow-up.",
  "fleet-owner": "Company setup, users, subscription visibility, fleet health, compliance, and uptime risk.",
};

export default function QuickStartGuideIndex({ userRole }: QuickStartGuideIndexProps) {
  const [, navigate] = useLocation();
  const userGuideSlug = getGuideSlugForRole(userRole);

  return (
    <main className="mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="section-label">TruckFixr Fleet AI</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
          Quick Start Guides
        </h1>
        <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
          Choose a role-specific one-page guide. Your own guide is listed first when TruckFixr can identify your role.
        </p>
        <div className="mt-6 flex flex-wrap gap-3">
          <Button
            className="rounded-full bg-[var(--fleet-secondary-container)] hover:bg-[var(--fleet-secondary)]"
            onClick={() => navigate("/quick-start-guides/my-guide")}
          >
            <BookOpenCheck className="h-4 w-4" />
            My Quick Start Guide
          </Button>
          <Button variant="outline" className="rounded-full bg-white" onClick={() => window.print()}>
            Print guide after opening
          </Button>
        </div>
        {!userGuideSlug ? (
          <div className="mt-5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            We could not match your current role to a guide. Choose the closest role below.
          </div>
        ) : null}
      </header>

      <section className="mt-6 grid gap-4 md:grid-cols-2">
        {quickStartGuides
          .slice()
          .sort((a, b) => {
            if (a.slug === userGuideSlug) return -1;
            if (b.slug === userGuideSlug) return 1;
            return 0;
          })
          .map((guide) => (
            <Card key={guide.slug} className="rounded-lg border-slate-200 bg-white shadow-sm">
              <CardHeader>
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-xs font-semibold uppercase tracking-wide text-red-700">
                      {guide.slug === userGuideSlug ? "Recommended for you" : guide.role}
                    </p>
                    <CardTitle className="mt-2 text-xl text-slate-950">{guide.title}</CardTitle>
                  </div>
                  <BookOpenCheck className="h-5 w-5 text-slate-500" />
                </div>
              </CardHeader>
              <CardContent>
                <p className="text-sm leading-6 text-slate-600">{guideDescriptions[guide.slug]}</p>
                <Button
                  variant="outline"
                  className="mt-5 rounded-full bg-white"
                  onClick={() => navigate(`/quick-start-guides/${guide.slug}`)}
                >
                  Open guide
                  <ArrowRight className="h-4 w-4" />
                </Button>
              </CardContent>
            </Card>
          ))}
      </section>
    </main>
  );
}
