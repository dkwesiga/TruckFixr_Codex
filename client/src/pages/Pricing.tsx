import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, X } from "lucide-react";

export default function Pricing() {
  const plans = [
    {
      name: "Starter",
      description: "Perfect for small fleets",
      price: 99,
      truckLimit: "2-5 trucks",
      features: [
        "Daily inspections",
        "Basic TADIS diagnostics",
        "Issue triage & tracking",
        "Mobile driver app",
        "Basic reporting",
        "Email support",
      ],
      notIncluded: [
        "Advanced analytics",
        "Premium TADIS",
        "Team management",
        "Custom templates",
      ],
      popular: false,
    },
    {
      name: "Growth",
      description: "For growing fleets",
      price: 249,
      truckLimit: "6-10 trucks",
      features: [
        "Daily inspections",
        "Advanced TADIS diagnostics",
        "Issue triage & tracking",
        "Mobile driver app",
        "Advanced reporting",
        "Team management",
        "Custom inspection templates",
        "Priority email & chat support",
      ],
      notIncluded: [
        "Premium TADIS",
        "Predictive maintenance",
        "Telematics integration",
      ],
      popular: true,
    },
    {
      name: "Fleet",
      description: "For large fleets",
      price: 499,
      truckLimit: "11-20 trucks",
      features: [
        "Daily inspections",
        "Advanced TADIS diagnostics",
        "Issue triage & tracking",
        "Mobile driver app",
        "Advanced reporting & analytics",
        "Team management",
        "Custom inspection templates",
        "API access",
        "Dedicated account manager",
        "Phone & email support",
      ],
      notIncluded: [
        "Premium TADIS (add-on available)",
      ],
      popular: false,
    },
  ];

  const premiumTadis = {
    name: "Premium TADIS",
    description: "Advanced AI diagnostics & predictive maintenance",
    price: 149,
    features: [
      "Predictive maintenance alerts",
      "Telematics integration",
      "Advanced failure prediction",
      "Custom diagnostic rules",
      "Historical trend analysis",
      "Compliance reporting",
    ],
  };

  const onboarding = {
    name: "Onboarding Package",
    description: "Guided setup & training",
    price: 299,
    features: [
      "Fleet setup assistance",
      "Driver training session",
      "Custom template configuration",
      "Initial data import",
      "Team onboarding call",
      "30-day support included",
    ],
  };

  return (
    <div className="min-h-screen bg-slate-50">
      {/* Header */}
      <header className="bg-white border-b border-slate-200">
        <div className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
          <h1 className="text-3xl font-bold text-slate-900">Simple, Transparent Pricing</h1>
          <p className="text-lg text-slate-600 mt-2">
            Choose the plan that fits your fleet. All plans include a 14-day free trial.
          </p>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-6xl mx-auto px-4 sm:px-6 lg:px-8 py-12">
        {/* Pricing Tiers */}
        <div className="grid md:grid-cols-3 gap-8 mb-16">
          {plans.map(plan => (
            <Card key={plan.name} className={plan.popular ? "border-2 border-blue-600 relative" : ""}>
              {plan.popular && (
                <div className="absolute -top-4 left-1/2 transform -translate-x-1/2">
                  <span className="bg-blue-600 text-white px-3 py-1 rounded-full text-sm font-semibold">
                    Most Popular
                  </span>
                </div>
              )}
              <CardHeader className={plan.popular ? "pt-8" : ""}>
                <CardTitle>{plan.name}</CardTitle>
                <CardDescription>{plan.description}</CardDescription>
                <div className="mt-4">
                  <span className="text-4xl font-bold text-slate-900">${plan.price}</span>
                  <span className="text-slate-600 ml-2">/month</span>
                </div>
                <p className="text-sm text-slate-600 mt-2">{plan.truckLimit}</p>
              </CardHeader>
              <CardContent className="space-y-6">
                <Button className="w-full" variant={plan.popular ? "default" : "outline"}>
                  Start Free Trial
                </Button>

                <div className="space-y-3">
                  <p className="text-sm font-semibold text-slate-900">Included:</p>
                  {plan.features.map(feature => (
                    <div key={feature} className="flex items-start gap-3">
                      <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                      <span className="text-sm text-slate-700">{feature}</span>
                    </div>
                  ))}
                </div>

                {plan.notIncluded.length > 0 && (
                  <div className="space-y-3 border-t border-slate-200 pt-4">
                    <p className="text-sm font-semibold text-slate-900">Not included:</p>
                    {plan.notIncluded.map(feature => (
                      <div key={feature} className="flex items-start gap-3">
                        <X className="w-4 h-4 text-slate-400 flex-shrink-0 mt-0.5" />
                        <span className="text-sm text-slate-500">{feature}</span>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Add-ons */}
        <div className="grid md:grid-cols-2 gap-8 mb-16">
          {/* Premium TADIS */}
          <Card>
            <CardHeader>
              <CardTitle>{premiumTadis.name}</CardTitle>
              <CardDescription>{premiumTadis.description}</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-900">${premiumTadis.price}</span>
                <span className="text-slate-600 ml-2">/month add-on</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Button className="w-full" variant="outline">
                Add to Plan
              </Button>

              <div className="space-y-3">
                {premiumTadis.features.map(feature => (
                  <div key={feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-700">{feature}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>

          {/* Onboarding Package */}
          <Card>
            <CardHeader>
              <CardTitle>{onboarding.name}</CardTitle>
              <CardDescription>{onboarding.description}</CardDescription>
              <div className="mt-4">
                <span className="text-3xl font-bold text-slate-900">${onboarding.price}</span>
                <span className="text-slate-600 ml-2">one-time</span>
              </div>
            </CardHeader>
            <CardContent className="space-y-6">
              <Button className="w-full" variant="outline">
                Purchase
              </Button>

              <div className="space-y-3">
                {onboarding.features.map(feature => (
                  <div key={feature} className="flex items-start gap-3">
                    <Check className="w-4 h-4 text-green-600 flex-shrink-0 mt-0.5" />
                    <span className="text-sm text-slate-700">{feature}</span>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* FAQ */}
        <Card>
          <CardHeader>
            <CardTitle>Frequently Asked Questions</CardTitle>
          </CardHeader>
          <CardContent className="space-y-6">
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Can I upgrade or downgrade anytime?</h4>
              <p className="text-slate-600">Yes, you can change your plan at any time. Changes take effect on your next billing cycle.</p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">What happens after the free trial?</h4>
              <p className="text-slate-600">Your trial converts to a paid subscription. You can cancel anytime before the trial ends.</p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">Do you offer discounts for annual billing?</h4>
              <p className="text-slate-600">Yes! Pay annually and save 20% on any plan. Contact our sales team for details.</p>
            </div>
            <div>
              <h4 className="font-semibold text-slate-900 mb-2">What if I need more than 20 trucks?</h4>
              <p className="text-slate-600">Contact our sales team for custom enterprise pricing tailored to your fleet size.</p>
            </div>
          </CardContent>
        </Card>
      </main>
    </div>
  );
}
