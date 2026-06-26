import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import type { QuickStartGuide } from "@/lib/quickStartGuides";
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ExternalLink,
  FileDown,
  HelpCircle,
  ShieldCheck,
} from "lucide-react";
import { useLocation } from "wouter";

type QuickStartGuideRendererProps = {
  guide: QuickStartGuide;
  completed?: boolean;
  isCompleting?: boolean;
  onComplete: () => void;
};

function Checklist({ items }: { items: string[] }) {
  return (
    <ul className="space-y-2">
      {items.map((item) => (
        <li key={item} className="flex gap-3 text-sm leading-6 text-slate-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

function ScreenshotPlaceholder({ label }: { label?: string }) {
  return (
    <div className="mt-4 flex min-h-28 items-center justify-center rounded-lg border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm font-medium text-slate-500">
      {label ?? "[Screenshot placeholder]"}
    </div>
  );
}

export default function QuickStartGuideRenderer({
  guide,
  completed,
  isCompleting,
  onComplete,
}: QuickStartGuideRendererProps) {
  const [, navigate] = useLocation();

  return (
    <article className="quick-start-guide mx-auto max-w-6xl px-4 py-8 sm:px-6 lg:px-8">
      <div className="quick-start-app-only mb-5">
        <Button
          variant="ghost"
          className="rounded-full text-slate-700"
          onClick={() => navigate("/quick-start-guides")}
        >
          <ArrowLeft className="h-4 w-4" />
          Back to all guides
        </Button>
      </div>

      <header className="rounded-lg border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-start lg:justify-between">
          <div>
            <p className="section-label">TruckFixr Fleet AI</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-slate-950 sm:text-4xl">
              {guide.title}
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-slate-600">
              {guide.subtitle}
            </p>
            <div className="mt-5 flex flex-wrap gap-2 text-xs font-semibold uppercase tracking-wide">
              <span className="rounded-full bg-slate-100 px-3 py-1 text-slate-700">
                {guide.role}
              </span>
              <span className="rounded-full bg-red-50 px-3 py-1 text-red-700">
                {guide.tone}
              </span>
            </div>
          </div>
          <div className="quick-start-app-only flex flex-wrap gap-3">
            <Button
              variant="outline"
              className="rounded-full bg-white"
              onClick={() => window.print()}
            >
              <FileDown className="h-4 w-4" />
              Print / Save as PDF
            </Button>
            <Button
              className="rounded-full bg-[var(--fleet-secondary-container)] hover:bg-[var(--fleet-secondary)]"
              disabled={Boolean(completed) || isCompleting}
              onClick={onComplete}
            >
              <CheckCircle2 className="h-4 w-4" />
              {completed ? "Guide Complete" : "Mark Guide Complete"}
            </Button>
          </div>
        </div>
      </header>

      <section className="mt-6 grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Your Role in TruckFixr Fleet AI</CardTitle>
          </CardHeader>
          <CardContent className="text-sm leading-6 text-slate-700">
            {guide.audience}
          </CardContent>
        </Card>
        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>First 5 Minutes</CardTitle>
          </CardHeader>
          <CardContent>
            <Checklist items={guide.firstFiveMinutes} />
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>First-Time Setup Checklist</CardTitle>
          </CardHeader>
          <CardContent>
            <Checklist items={guide.setupChecklist} />
          </CardContent>
        </Card>
        <Card className="rounded-lg border-slate-200 shadow-sm">
          <CardHeader>
            <CardTitle>Daily / Weekly Workflow</CardTitle>
          </CardHeader>
          <CardContent>
            <Checklist items={guide.dailyWorkflow} />
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-2xl font-semibold text-slate-950">Key Features You Should Use</h2>
        <div className="mt-5 grid gap-4 lg:grid-cols-2">
          {guide.keyFeatures.map((feature) => (
            <div key={feature.title} className="rounded-lg border border-slate-200 bg-white p-5">
              <h3 className="text-lg font-semibold text-slate-950">{feature.title}</h3>
              <p className="mt-2 text-sm leading-6 text-slate-600">{feature.description}</p>
              {feature.actionLabel && feature.actionPath ? (
                <Button
                  variant="outline"
                  className="quick-start-app-only mt-4 rounded-full bg-white"
                  onClick={() => navigate(feature.actionPath ?? "/")}
                >
                  {feature.actionLabel}
                  <ExternalLink className="h-4 w-4" />
                </Button>
              ) : null}
              <ScreenshotPlaceholder label={feature.screenshotPlaceholder} />
            </div>
          ))}
        </div>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <Card className="rounded-lg border-emerald-200 bg-emerald-50/60 shadow-sm">
          <CardHeader>
            <CardTitle className="text-emerald-900">What You Can Do</CardTitle>
          </CardHeader>
          <CardContent>
            <Checklist items={guide.permissions.canDo} />
          </CardContent>
        </Card>
        <Card className="rounded-lg border-slate-200 bg-slate-50 shadow-sm">
          <CardHeader>
            <CardTitle>What You Cannot Do</CardTitle>
          </CardHeader>
          <CardContent>
            <Checklist items={guide.permissions.cannotDo} />
          </CardContent>
        </Card>
      </section>

      <section className="mt-6 grid gap-6 lg:grid-cols-2">
        <div className="rounded-lg border border-red-200 bg-red-50 p-6">
          <div className="flex items-center gap-3">
            <AlertTriangle className="h-5 w-5 text-red-700" />
            <h2 className="text-xl font-semibold text-red-950">Safety & AI Diagnostic Warnings</h2>
          </div>
          <div className="mt-4">
            <Checklist items={guide.safetyWarnings} />
          </div>
        </div>
        <div className="rounded-lg border border-blue-200 bg-blue-50 p-6">
          <div className="flex items-center gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-700" />
            <h2 className="text-xl font-semibold text-blue-950">Ontario/MTO Compliance Reminder</h2>
          </div>
          <div className="mt-4">
            <Checklist items={guide.complianceNotes} />
          </div>
        </div>
      </section>

      <section className="mt-6 rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
        <div className="flex items-center gap-3">
          <HelpCircle className="h-5 w-5 text-slate-700" />
          <h2 className="text-xl font-semibold text-slate-950">Need Help?</h2>
        </div>
        <div className="mt-4">
          <Checklist items={guide.helpNotes} />
        </div>
      </section>

      <footer className="quick-start-app-only mt-8 flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
        <p className="text-sm text-slate-600">
          {completed
            ? "This guide is marked complete. You can still return to it any time."
            : "Finish the guide to hide the dashboard banner for your account."}
        </p>
        <Button
          className="rounded-full bg-[var(--fleet-secondary-container)] hover:bg-[var(--fleet-secondary)]"
          disabled={Boolean(completed) || isCompleting}
          onClick={onComplete}
        >
          <CheckCircle2 className="h-4 w-4" />
          {completed ? "Guide Complete" : "Mark Guide Complete"}
        </Button>
      </footer>
    </article>
  );
}
