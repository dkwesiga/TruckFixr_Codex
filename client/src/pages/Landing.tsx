import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import AppLogo from "@/components/AppLogo";
import { Check, ChevronRight, Clock, Zap, BarChart3, AlertCircle, ArrowRight } from "lucide-react";
import { getLoginUrl } from "@/const";
import { useState } from "react";
import {
  formatTruckFixrCad,
  getPublicTruckFixrPlans,
  getTruckFixrPlanPrice,
} from "../../../shared/truckfixrPricing";

export default function Landing() {
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const faqs = [
    {
      question: "How does TADIS work?",
      answer: "TADIS combines driver-reported symptoms, fault codes, truck history, and operational context to produce an urgency level and recommended action. It uses rule-based logic augmented by AI to identify likely causes and provide reasoning for every defect.",
    },
    {
      question: "Can I start with a free trial?",
      answer: "Yes. New accounts can start on TruckFixr's 14-day free trial with 2 powered vehicles, 2 active trailers, and 10 total AI diagnostic sessions. No credit card is required.",
    },
    {
      question: "How do I add my team?",
      answer: "During onboarding, you'll invite managers and drivers via email. Managers see the full dashboard and can triage issues. Drivers use the mobile-first inspection workflow.",
    },
    {
      question: "What if I have more than 20 trucks?",
      answer: "TruckFixr Fleet Pro includes up to 20 powered vehicles. For 21+ powered vehicles or trailer-heavy operations, contact TruckFixr for custom fleet pricing.",
    },
    {
      question: "Is my data secure?",
      answer: "Yes. All data is encrypted in transit and at rest. We use industry-standard security practices and comply with GDPR and CCPA.",
    },
  ];

const legacyPricingPlans = [
    {
      name: "Starter",
      trucks: "2–5 trucks",
      price: "$99",
      period: "/month",
      features: [
        "Daily inspections & defect capture",
        "Basic TADIS diagnostics",
        "Morning fleet summary",
        "Action queue & defect tracking",
        "Up to 3 team members",
        "Email support",
      ],
      cta: "Start Free Trial",
      highlighted: false,
    },
    {
      name: "Growth",
      trucks: "6–10 trucks",
      price: "$249",
      period: "/month",
      features: [
        "Everything in Starter, plus:",
        "Advanced reporting & analytics",
        "Maintenance history & logs",
        "Up to 10 team members",
        "Priority email support",
        "Truck health trends",
      ],
      cta: "Start Free Trial",
      highlighted: true,
    },
    {
      name: "Fleet",
      trucks: "11–20 trucks",
      price: "$499",
      period: "/month",
      features: [
        "Everything in Growth, plus:",
        "Custom inspection templates",
        "Predictive maintenance insights",
        "Unlimited team members",
        "Phone & email support",
        "API access (coming soon)",
      ],
      cta: "Start Free Trial",
      highlighted: false,
    },
  ];

  const pricingPlans = getPublicTruckFixrPlans().filter((plan) =>
    ["free_trial", "small_fleet", "fleet_growth", "fleet_pro"].includes(plan.planKey)
  );

  const supporters = [
    {
      name: "Black Founders Network",
      href: "https://www.blackfounders.network/",
      description: "Supporting Black-led startups and venture growth.",
      logoSrc: "/partner-bfn.svg",
      logoAlt: "Black Founders Network logo",
      logoClassName: "h-12 w-auto",
      logoWrapperClassName:
        "rounded-2xl bg-slate-950 px-4 py-3 shadow-[inset_0_0_0_1px_rgba(255,255,255,0.06)]",
    },
    {
      name: "DMZ",
      href: "https://www.dmzlaunchpad.ca/",
      description: "Backing high-potential founders building scalable companies.",
      logoSrc: "/partner-dmz.png",
      logoAlt: "DMZ logo",
      logoClassName: "h-11 w-auto",
      logoWrapperClassName: "rounded-2xl bg-slate-100 px-4 py-3",
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/80 backdrop-blur-md border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <AppLogo imageClassName="h-10" frameClassName="p-1.5" />
            <span className="font-bold text-lg text-slate-900 hidden sm:inline">TruckFixr</span>
          </div>
          <div className="flex items-center gap-4">
            <a href="#pricing" className="text-sm text-slate-600 hover:text-slate-900">
              Pricing
            </a>
            <a href="#faq" className="text-sm text-slate-600 hover:text-slate-900">
              FAQ
            </a>
            <Button asChild size="sm" className="bg-blue-600 hover:bg-blue-700 text-white">
              <a href="/signup">Sign Up</a>
            </Button>
            <Button asChild variant="outline" size="sm">
              <a href="/auth/email">Sign In</a>
            </Button>
          </div>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-20 sm:py-32">
        <div className="text-center space-y-8">
          <div className="space-y-4">
            <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold text-slate-900 leading-tight">
              Keep More Trucks on the Road
            </h1>
            <p className="text-lg sm:text-xl text-slate-600 max-w-2xl mx-auto">
              Daily inspections, AI-powered diagnostics, and real-time fleet management. Catch issues before they become downtime.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <Button asChild size="lg" className="bg-blue-600 hover:bg-blue-700">
              <a href="/signup">
                Start Free Trial <ArrowRight className="ml-2 w-4 h-4" />
              </a>
            </Button>
            <Button asChild variant="outline" size="lg">
              <a href="#how-it-works">See How It Works</a>
            </Button>
          </div>
          <p className="text-sm text-slate-500">No credit card required. Start with TruckFixr&apos;s 14-day free trial.</p>
        </div>
      </section>

      {/* Features Section */}
      <section className="bg-white py-20 sm:py-32">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">
              Everything You Need to Run a Smarter Fleet
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              From daily inspections to predictive maintenance, TruckFixr gives you visibility and control.
            </p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                icon: Clock,
                title: "Daily Inspections",
                description: "Drivers complete inspections in minutes. Capture defects with photos and detailed notes.",
              },
              {
                icon: Zap,
                title: "TADIS Diagnostics",
                description: "AI-powered analysis produces urgency levels and recommended actions instantly.",
              },
              {
                icon: BarChart3,
                title: "Real-Time Visibility",
                description: "Managers see the complete fleet status, action queue, and maintenance history at a glance.",
              },
              {
                icon: AlertCircle,
                title: "Smart Alerts",
                description: "Get notified of critical issues before they cause breakdowns.",
              },
              {
                icon: Check,
                title: "Action Tracking",
                description: "Assign, track, and resolve defects with a full audit trail.",
              },
              {
                icon: BarChart3,
                title: "Maintenance Insights",
                description: "Understand fleet health trends and plan preventive maintenance.",
              },
            ].map((feature, idx) => (
              <Card key={idx} className="border-slate-200">
                <CardHeader>
                  <feature.icon className="w-8 h-8 text-blue-600 mb-2" />
                  <CardTitle className="text-lg">{feature.title}</CardTitle>
                </CardHeader>
                <CardContent>
                  <p className="text-slate-600">{feature.description}</p>
                </CardContent>
              </Card>
            ))}
          </div>
        </div>
      </section>

      <section className="bg-slate-50 py-16">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-10">
            <h2 className="text-2xl sm:text-3xl font-bold text-slate-900 mb-3">
              Partners and Supporters
            </h2>
            <p className="text-lg text-slate-600 max-w-2xl mx-auto">
              TruckFixr is supported by organizations helping founders build practical, high-impact products.
            </p>
          </div>
          <div className="grid gap-6 md:grid-cols-2">
            {supporters.map((supporter) => (
              <a
                key={supporter.name}
                href={supporter.href}
                target="_blank"
                rel="noreferrer"
                className="rounded-2xl border border-slate-200 bg-white p-6 text-left shadow-sm transition-all hover:-translate-y-0.5 hover:border-slate-300 hover:shadow-md"
              >
                <div className="flex h-16 items-center">
                  <div className={supporter.logoWrapperClassName}>
                  <img
                    src={supporter.logoSrc}
                    alt={supporter.logoAlt}
                    className={supporter.logoClassName}
                  />
                  </div>
                </div>
                <h3 className="text-xl font-semibold text-slate-900">{supporter.name}</h3>
                <p className="mt-2 text-slate-600">{supporter.description}</p>
              </a>
            ))}
          </div>
        </div>
      </section>

      {/* How It Works */}
      <section id="how-it-works" className="py-20 sm:py-32 bg-slate-50">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">How It Works</h2>
            <p className="text-lg text-slate-600">Three simple steps to smarter fleet management.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-8">
            {[
              {
                step: "1",
                title: "Driver Inspects",
                description: "Drivers use the mobile app to complete daily inspections. They report defects with photos and details.",
              },
              {
                step: "2",
                title: "TADIS Analyzes",
                description: "Our AI engine analyzes each defect and produces an urgency level, recommended action, and likely cause.",
              },
              {
                step: "3",
                title: "Manager Acts",
                description: "Managers see the prioritized action queue and assign repairs. Track everything from defect to resolution.",
              },
            ].map((item, idx) => (
              <div key={idx} className="text-center">
                <div className="w-12 h-12 bg-blue-600 text-white rounded-full flex items-center justify-center mx-auto mb-4 text-lg font-bold">
                  {item.step}
                </div>
                <h3 className="text-xl font-semibold text-slate-900 mb-2">{item.title}</h3>
                <p className="text-slate-600">{item.description}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pricing Section */}
      <section id="pricing" className="py-20 sm:py-32 bg-white">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-16">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Simple, Transparent Pricing</h2>
            <p className="text-lg text-slate-600">Plans are based on active powered vehicles, with matching trailer allowance built in.</p>
          </div>
          <div className="grid gap-8 md:grid-cols-2 xl:grid-cols-4">
            {pricingPlans.map((plan) => (
              <Card
                key={plan.planKey}
                className={`flex flex-col ${
                  plan.recommended ? "border-blue-600 border-2 shadow-lg" : "border-slate-200"
                }`}
              >
                {plan.recommended && (
                  <div className="bg-blue-600 text-white px-4 py-2 text-center text-sm font-semibold">
                    Most Popular
                  </div>
                )}
                <CardHeader>
                  <CardTitle>{plan.name}</CardTitle>
                  <CardDescription>{plan.publicNote}</CardDescription>
                  <div className="mt-4">
                    <span className="text-3xl font-bold text-slate-900">
                      {plan.billingInterval === "trial"
                        ? "CAD $0"
                        : formatTruckFixrCad(getTruckFixrPlanPrice(plan.planKey, "monthly"))}
                    </span>
                    <span className="text-slate-600">{plan.billingInterval === "trial" ? "/trial" : "/month"}</span>
                  </div>
                </CardHeader>
                <CardContent className="flex-1 space-y-4">
                  <Button asChild className="w-full" variant={plan.recommended ? "default" : "outline"}>
                    <a href="/signup">{plan.cta}</a>
                  </Button>
                  <ul className="space-y-3">
                    <li className="flex gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span>{plan.poweredVehicleLimit ?? "Custom"} powered vehicles included</span>
                    </li>
                    <li className="flex gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span>{plan.includedTrailerLimit ?? "Custom"} active trailers included</span>
                    </li>
                    <li className="flex gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span>{plan.aiDiagnosticSessionLimit ?? "Custom"} AI diagnostic sessions {plan.aiSessionLimitType === "total" ? "total" : "per month"}</span>
                    </li>
                    <li className="flex gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span>Driver assignments: {plan.driverAssignments === true ? "Included" : plan.driverAssignments}</span>
                    </li>
                    <li className="flex gap-2 text-sm text-slate-600">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span>Fleet dashboard: {plan.fleetDashboard}</span>
                    </li>
                  </ul>
                </CardContent>
              </Card>
            ))}
          </div>
          <div className="mt-12 p-6 bg-blue-50 rounded-lg border border-blue-200 text-center">
            <p className="text-slate-700">
              <strong>Need more than 20 powered vehicles?</strong> TruckFixr can set up a custom fleet plan for larger or trailer-heavy operations.
            </p>
          </div>
        </div>
      </section>

      {/* FAQ Section */}
      <section id="faq" className="py-20 sm:py-32 bg-slate-50">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="text-center mb-12">
            <h2 className="text-3xl sm:text-4xl font-bold text-slate-900 mb-4">Frequently Asked Questions</h2>
          </div>
          <div className="space-y-4">
            {faqs.map((faq, idx) => (
              <Card key={idx} className="border-slate-200 cursor-pointer" onClick={() => setExpandedFaq(expandedFaq === idx ? null : idx)}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <CardTitle className="text-base">{faq.question}</CardTitle>
                    <ChevronRight
                      className={`w-5 h-5 text-slate-400 transition-transform ${
                        expandedFaq === idx ? "rotate-90" : ""
                      }`}
                    />
                  </div>
                </CardHeader>
                {expandedFaq === idx && (
                  <CardContent className="pt-0">
                    <p className="text-slate-600">{faq.answer}</p>
                  </CardContent>
                )}
              </Card>
            ))}
          </div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="bg-blue-600 py-16 sm:py-20">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 lg:px-8 text-center">
          <h2 className="text-3xl sm:text-4xl font-bold text-white mb-4">Ready to Keep More Trucks on the Road?</h2>
          <p className="text-lg text-blue-100 mb-8">Start your free 14-day trial today. No credit card required.</p>
          <Button asChild size="lg" className="bg-white text-blue-600 hover:bg-slate-100">
            <a href="/signup">
              Get Started <ArrowRight className="ml-2 w-4 h-4" />
            </a>
          </Button>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-slate-900 text-slate-400 py-12">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="grid md:grid-cols-4 gap-8 mb-8">
            <div>
              <div className="flex items-center gap-2 mb-4">
                <AppLogo imageClassName="h-6" frameClassName="p-1.5 bg-white" />
                <span className="font-bold text-white hidden sm:inline">TruckFixr</span>
              </div>
              <p className="text-sm">Fleet operations copilot for small trucking companies.</p>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Product</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#pricing" className="hover:text-white">Pricing</a></li>
                <li><a href="#faq" className="hover:text-white">FAQ</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Legal</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="#" className="hover:text-white">Terms of Service</a></li>
                <li><a href="#" className="hover:text-white">Privacy Policy</a></li>
              </ul>
            </div>
            <div>
              <h4 className="font-semibold text-white mb-4">Support</h4>
              <ul className="space-y-2 text-sm">
                <li><a href="mailto:info@truckfixr.com" className="hover:text-white">info@truckfixr.com</a></li>
              </ul>
            </div>
          </div>
          <div className="border-t border-slate-800 pt-8 text-center text-sm">
            <p>&copy; 2026 TruckFixr. All rights reserved.</p>
          </div>
        </div>
      </footer>
    </div>
  );
}
