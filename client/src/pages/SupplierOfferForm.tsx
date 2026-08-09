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

export default function SupplierOfferForm() {
  useSeoMeta({ title: "Submit a Parts Offer | TruckFixr", description: "Submit a structured parts offer for a TruckFixr customer request." });

  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") ?? "" : "";
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [supplierName, setSupplierName] = useState("");
  const [respondentName, setRespondentName] = useState("");
  const [respondentContact, setRespondentContact] = useState("");
  const [skuPartNumber, setSkuPartNumber] = useState("");
  const [description, setDescription] = useState("");
  const [conditionType, setConditionType] = useState<"new" | "remanufactured" | "used">("new");
  const [priceCents, setPriceCents] = useState("");
  const [fitmentConfirmed, setFitmentConfirmed] = useState(false);
  const [fitmentBasis, setFitmentBasis] = useState("");
  const [stockStatus, setStockStatus] = useState("");
  const [warrantyText, setWarrantyText] = useState("");

  const submitMutation = trpc.partsRequests.submitOffer.useMutation();

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!token) {
      setError("This link is missing its token. Please use the link exactly as it was sent to you.");
      return;
    }
    if (!fitmentConfirmed) {
      setError("Please confirm fitment for this exact item before submitting.");
      return;
    }
    const price = Math.round(Number(priceCents) * 100);
    if (!Number.isFinite(price) || price < 0) {
      setError("Enter a valid price.");
      return;
    }
    try {
      await submitMutation.mutateAsync({
        token,
        supplierName: supplierName.trim(),
        respondentName: respondentName.trim() || undefined,
        respondentContact: respondentContact.trim() || undefined,
        skuPartNumber: skuPartNumber.trim(),
        description: description.trim() || undefined,
        conditionType,
        fitmentConfirmed: true,
        fitmentBasis: fitmentBasis.trim() || undefined,
        priceCents: price,
        stockStatus: stockStatus.trim() || undefined,
        warrantyText: warrantyText.trim() || undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't submit that offer. Please try again.");
    }
  }

  return (
    <div className="min-h-screen bg-[#F6F8FB] pb-24 font-['IBM_Plex_Sans'] text-[#0A1A2E]">
      <header className="border-b border-[#C3C7CE] bg-white/90 backdrop-blur">
        <div className={cn(shell, "flex items-center justify-between py-3")}>
          <Link href="/" className="flex items-center gap-2">
            <AppLogo />
          </Link>
        </div>
      </header>

      <main className={cn(shell, "space-y-4 pt-8")}>
        {submitted ? (
          <div className={cn(cardClass, "space-y-3 p-6 text-center")}>
            <Check className="mx-auto h-10 w-10 text-[#1EA66C]" aria-hidden="true" />
            <h1 className={cn(displayClass, "text-xl")}>Offer submitted</h1>
            <p className="text-sm text-[#38465F]">Thanks — the customer will see your offer alongside any others.</p>
          </div>
        ) : !token ? (
          <div className={cn(cardClass, "p-6 text-sm text-[#D81F2A]")}>
            This link is missing its token. Please use the link exactly as it was sent to you.
          </div>
        ) : (
          <form onSubmit={handleSubmit} className={cn(cardClass, "space-y-4 p-5 sm:p-6")}>
            <div>
              <h1 className={cn(displayClass, "text-xl")}>Submit a parts offer</h1>
              <p className="mt-1 text-sm text-[#38465F]">
                Provide the exact item you can supply and confirm fitment. TruckFixr shares this with the customer as-is.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="supplierName">Supplier name</Label>
                <Input id="supplierName" required value={supplierName} onChange={(e) => setSupplierName(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="respondentName">Your name</Label>
                <Input id="respondentName" value={respondentName} onChange={(e) => setRespondentName(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="respondentContact">Your phone or email</Label>
              <Input id="respondentContact" value={respondentContact} onChange={(e) => setRespondentContact(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="skuPartNumber">Your SKU / part number</Label>
              <Input id="skuPartNumber" required value={skuPartNumber} onChange={(e) => setSkuPartNumber(e.target.value)} />
            </div>

            <div className="space-y-1">
              <Label htmlFor="description">Description</Label>
              <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="conditionType">Condition</Label>
                <select
                  id="conditionType"
                  value={conditionType}
                  onChange={(e) => setConditionType(e.target.value as typeof conditionType)}
                  className="h-9 w-full rounded border border-[#C3C7CE] px-2 text-sm"
                >
                  <option value="new">New</option>
                  <option value="remanufactured">Remanufactured</option>
                  <option value="used">Used</option>
                </select>
              </div>
              <div className="space-y-1">
                <Label htmlFor="priceCents">Price (CAD, before tax)</Label>
                <Input id="priceCents" type="number" min="0" step="0.01" required value={priceCents} onChange={(e) => setPriceCents(e.target.value)} />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1">
                <Label htmlFor="stockStatus">Stock status</Label>
                <Input id="stockStatus" placeholder="e.g. in stock, 2 days" value={stockStatus} onChange={(e) => setStockStatus(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label htmlFor="warrantyText">Warranty</Label>
                <Input id="warrantyText" value={warrantyText} onChange={(e) => setWarrantyText(e.target.value)} />
              </div>
            </div>

            <div className="space-y-1">
              <Label htmlFor="fitmentBasis">Fitment basis (vehicle/VIN/configuration)</Label>
              <Textarea id="fitmentBasis" value={fitmentBasis} onChange={(e) => setFitmentBasis(e.target.value)} />
            </div>

            <label className="flex items-start gap-2 rounded-md border border-[#E2E6EC] bg-[#F8FAFC] p-3 text-xs leading-5 text-[#38465F]">
              <input
                type="checkbox"
                checked={fitmentConfirmed}
                onChange={(e) => setFitmentConfirmed(e.target.checked)}
                className="mt-0.5 h-4 w-4"
                required
              />
              <span>I confirm fitment for this exact item on the customer's vehicle/configuration.</span>
            </label>

            {error && <p className="text-sm font-medium text-[#D81F2A]" role="alert">{error}</p>}

            <Button type="submit" disabled={submitMutation.isPending} className={cn("h-12 w-full text-[15px] font-bold", redBtn)}>
              {submitMutation.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              Submit offer
            </Button>
          </form>
        )}
      </main>
    </div>
  );
}
