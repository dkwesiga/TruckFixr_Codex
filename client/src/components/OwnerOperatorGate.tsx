import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export default function OwnerOperatorGate() {
  return (
    <div className="min-h-screen bg-slate-50 px-4 py-8">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Enable Owner-Operator Mode</CardTitle>
          <CardDescription>
            This owner account is not yet set to use driver workflows. Turn on owner-operator mode in your profile to
            inspect vehicles, run diagnostics, and submit inspections as the owner-driver.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-slate-600">
            You will still keep full owner access. This just unlocks the driver workflow on your own vehicles.
          </p>
          <div className="flex flex-wrap gap-3">
            <Button onClick={() => (window.location.href = "/profile")}>Open Profile</Button>
            <Button variant="outline" onClick={() => (window.location.href = "/manager")}>
              Go to Owner Dashboard
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
