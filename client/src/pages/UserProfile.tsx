import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuthContext } from "@/hooks/useAuthContext";

export default function UserProfile() {
  const { user } = useAuthContext();
  const utils = trpc.useUtils();
  const [formData, setFormData] = useState({
    name: user?.name || "",
    email: user?.email || "",
    company: "",
    role: (user?.role || "driver") as "driver" | "manager" | "owner",
  });
  const [isLoading, setIsLoading] = useState(false);
  const [step, setStep] = useState<"profile" | "fleet">("profile");

  const updateProfileMutation = trpc.auth.updateProfile.useMutation();
  const createFleetMutation = trpc.fleet.create.useMutation();

  useEffect(() => {
    if (!user) return;

    setFormData((current) => ({
      ...current,
      name: current.name || user.name || "",
      email: user.email || "",
      role: user.role,
    }));
  }, [user]);

  const handleProfileSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validate form
      if (!formData.name.trim()) {
        toast.error("Please enter your name");
        setIsLoading(false);
        return;
      }

      if ((formData.role === "manager" || formData.role === "owner") && !formData.company.trim()) {
        toast.error("Please enter your company name");
        setIsLoading(false);
        return;
      }

      const updatedUser = await updateProfileMutation.mutateAsync({
        name: formData.name.trim(),
        role: formData.role,
      });

      await utils.auth.me.invalidate();

      if (updatedUser.role === "driver") {
        toast.success("Profile updated! Redirecting to your dashboard...");
        setTimeout(() => {
          window.location.href = "/driver";
        }, 500);
        return;
      }

      setStep("fleet");
    } catch (error: any) {
      toast.error(error?.message || "Failed to update profile");
    } finally {
      setIsLoading(false);
    }
  };

  const handleFleetCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Create initial fleet
      const fleet = await createFleetMutation.mutateAsync({
        name: `${formData.company} Fleet`,
      });

      toast.success("Fleet created successfully!");

      // Track event
      if ((window as any).posthog) {
        (window as any).posthog.capture("fleet_created", {
          fleet_name: fleet.name,
          company: formData.company,
        });
      }

      await utils.auth.me.invalidate();
      // Redirect to manager dashboard
      setTimeout(() => {
        window.location.href = "/manager";
      }, 1000);
    } catch (error: any) {
      toast.error(error?.message || "Failed to create fleet");
      setIsLoading(false);
    }
  };

  const handleSkip = () => {
    const redirectPath = formData.role === "driver" ? "/driver" : "/manager";
    window.location.href = redirectPath;
  };

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100">
        <Card className="w-full max-w-md">
          <CardContent className="pt-6">
            <p className="text-center text-slate-600">Loading...</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 to-slate-100 p-4">
      <Card className="w-full max-w-md">
        {step === "profile" ? (
          <>
            <CardHeader>
              <CardTitle>Complete Your Profile</CardTitle>
              <CardDescription>
                Let's set up your account to get started with TruckFixr
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleProfileSubmit} className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Full Name
                  </label>
                  <Input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    placeholder="Your name"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Email
                  </label>
                  <Input
                    type="email"
                    value={formData.email}
                    disabled
                    className="bg-slate-100"
                  />
                  <p className="text-xs text-slate-500 mt-1">Email cannot be changed</p>
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Company Name
                  </label>
                  <Input
                    type="text"
                    value={formData.company}
                    onChange={(e) =>
                      setFormData({ ...formData, company: e.target.value })
                    }
                    placeholder={
                      formData.role === "driver"
                        ? "Your company name (optional)"
                        : "Your company name"
                    }
                    required={formData.role === "manager" || formData.role === "owner"}
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-1">
                    Role
                  </label>
                  <select
                    value={formData.role}
                    onChange={(e) =>
                      setFormData({ ...formData, role: e.target.value as "driver" | "manager" | "owner" })
                    }
                    className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm"
                  >
                    <option value="driver">Driver</option>
                    <option value="manager">Manager</option>
                    <option value="owner">Owner</option>
                  </select>
                </div>

                <Button
                  type="submit"
                  className="w-full bg-blue-600 hover:bg-blue-700"
                  disabled={isLoading}
                >
                  {isLoading
                    ? "Loading..."
                    : formData.role === "driver"
                      ? "Save & Continue"
                      : "Continue"}
                </Button>
              </form>
            </CardContent>
          </>
        ) : (
          <>
            <CardHeader>
              <CardTitle>Create Your First Fleet</CardTitle>
              <CardDescription>
                Set up your fleet to start managing trucks and inspections
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleFleetCreate} className="space-y-4">
                <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
                  <p className="text-sm text-slate-700">
                    <strong>Fleet Name:</strong> {formData.company} Fleet
                  </p>
                  <p className="text-sm text-slate-600 mt-2">
                    You can manage multiple fleets and add more trucks later.
                  </p>
                </div>

                <div className="space-y-2">
                  <Button
                    type="submit"
                    className="w-full bg-blue-600 hover:bg-blue-700"
                    disabled={isLoading || createFleetMutation.isPending}
                  >
                    {isLoading || createFleetMutation.isPending
                      ? "Creating Fleet..."
                      : "Create Fleet"}
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    className="w-full"
                    onClick={handleSkip}
                    disabled={isLoading || createFleetMutation.isPending}
                  >
                    Skip for Now
                  </Button>
                </div>
              </form>
            </CardContent>
          </>
        )}
      </Card>
    </div>
  );
}
