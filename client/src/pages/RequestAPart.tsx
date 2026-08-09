import { useState, type FormEvent } from "react";
import { Link } from "wouter";
import { Check, Loader2 } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";

const shell = "mx-auto w-full max-w-[640px] px-4 sm:px-6";
const cardClass =
  "rounded-[12px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

export default function RequestAPart() {
  useSeoMeta({
    title: "Find a Part | TruckFixr",
    description: "Tell us the part you need or describe the issue — TruckFixr's GTA parts concierge sources supplier offers for you.",
  });

  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [customerName, setCustomerName] = useState("");
  const [customerEmail, setCustomerEmail] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [partNumber, setPartNumber] = useState("");
  const [partDescription, setPartDescription] = useState("");

  const submitMutation = trpc.partsRequests.submitPublic.useMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!partNumber.trim() && !partDescription.trim()) {
      setError("Please provide a part number or describe what you need.");
      return;
    }
    try {
      await submitMutation.mutateAsync({
        customerName: customerName.trim(),
        customerEmail: customerEmail.trim(),
        customerPhone: customerPhone.trim() || undefined,
        partNumber: partNumber.trim() || undefined,
        partDescription: partDescription.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-24 font-['IBM_Plex_Sans'] text-[#0A1A2E]">
      <header className="border-b border-[#C3C7CE] bg-white/90 backdrop-blur">
        <div className={cn(shell, "flex items-center justify-between py-3")}>
          <Link href="/" className="flex items-center gap-2">
            <AppLogo />
          </Link>
          <Link href="/" className="text-sm font-semibold text-[#38465F] hover:text-[#0A1A2E]">
            Back to home
          </Link>
        </div>
      </header>

      <main className={cn(shell, "space-y-4 pt-8")}>
        {submitted ? (
          <div className={cn(cardClass, "space-y-3 p-6 text-center")}>
            <Check className="mx-auto h-10 w-10 text-[#1EA66C]" aria-hidden="true" />
            <h1 className={cn(displayClass, "text-xl")}>Request received</h1>
            <p className="text-sm text-[#38465F]">
              A TruckFixr team member will reach out with supplier offers to compare. GTA concierge pilot — response times may vary.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={cn(cardClass, "space-y-4 p-5 sm:p-6")}>
            <div>
              <h1 className={cn(displayClass, "text-xl")}>Find a part</h1>
              <p className="mt-1 text-sm text-[#38465F]">
                Know the exact part number, or just describe what you need — we'll get supplier offers for you to compare.
                GTA concierge pilot.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="customerName">Your name</Label>
                <Input id="customerName" required value={customerName} onChange={(e) => setCustomerName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="customerEmail">Email</Label>
                <Input id="customerEmail" type="email" required value={customerEmail} onChange={(e) => setCustomerEmail(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="customerPhone">Phone (optional)</Label>
              <Input id="customerPhone" type="tel" value={customerPhone} onChange={(e) => setCustomerPhone(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="partNumber">Part number (if known)</Label>
              <Input id="partNumber" value={partNumber} onChange={(e) => setPartNumber(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="partDescription">Or describe what you need</Label>
              <Textarea
                id="partDescription"
                placeholder="Vehicle, part, and any other details that help a supplier quote accurately"
                value={partDescription}
                onChange={(e) => setPartDescription(e.target.value)}
              />
            </div>

            {error && <p className="text-sm font-medium text-[#D81F2A]" role="alert">{error}</p>}

            <Button type="submit" disabled={submitMutation.isPending} className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
              {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Request part offers
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
