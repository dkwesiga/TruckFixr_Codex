import { useState } from "react";
import { Link } from "wouter";
import { Check, Loader2 } from "lucide-react";
import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { trpc } from "@/lib/trpc";
import { useSeoMeta } from "@/lib/useSeoMeta";

const shell = "mx-auto w-full max-w-[720px] px-4 sm:px-6";
const cardClass =
  "rounded-[12px] border border-[#C3C7CE] bg-white shadow-[0_18px_40px_-30px_rgba(10,26,46,0.4)]";
const displayClass =
  "font-['Barlow_Condensed'] italic font-black uppercase leading-[1.05] tracking-[-0.01em] text-[#0A1A2E]";
const redBtn = "bg-[#D81F2A] text-white hover:bg-[#A6121B]";

function formatCad(cents: number, currency: string) {
  return new Intl.NumberFormat("en-CA", { style: "currency", currency: currency || "CAD" }).format(cents / 100);
}

export default function PartsOfferComparison() {
  useSeoMeta({ title: "Compare Parts Offers | TruckFixr", description: "Compare supplier offers for your requested part." });

  const token = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("token") ?? "" : "";
  const [error, setError] = useState<string | null>(null);
  const [selected, setSelected] = useState<{ supplierName: string; respondentContact: string | null; priceCents: number; currency: string } | null>(null);

  const query = trpc.partsRequests.getByCustomerToken.useQuery({ token }, { enabled: Boolean(token) });
  const selectMutation = trpc.partsRequests.selectOffer.useMutation();

  async function handleSelect(offerId: number) {
    setError(null);
    try {
      const res = await selectMutation.mutateAsync({ token, offerId });
      setSelected(res);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Couldn't select that offer. Please try again.");
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
        {!token ? (
          <div className={cn(cardClass, "p-6 text-sm text-[#D81F2A]")}>
            This link is missing its token. Please use the link exactly as it was sent to you.
          </div>
        ) : query.isLoading ? (
          <div className="flex justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-[#38465F]" />
          </div>
        ) : query.error ? (
          <div className={cn(cardClass, "p-6 text-sm text-[#D81F2A]")}>{query.error.message}</div>
        ) : selected ? (
          <div className={cn(cardClass, "space-y-3 p-6 text-center")}>
            <Check className="mx-auto h-10 w-10 text-[#1EA66C]" aria-hidden="true" />
            <h1 className={cn(displayClass, "text-xl")}>You're set — contact the supplier to complete your purchase</h1>
            <div className="rounded-md bg-[#F1F4F9] p-4 text-left text-sm text-[#38465F]">
              <div><span className="font-semibold">{selected.supplierName}</span></div>
              {selected.respondentContact && <div>{selected.respondentContact}</div>}
              <div className="mt-1 font-semibold">{formatCad(selected.priceCents, selected.currency)}</div>
            </div>
            <p className="text-xs text-[#73777E]">
              The supplier completes payment and sale and remains seller of record.
            </p>
          </div>
        ) : (
          <>
            <div>
              <h1 className={cn(displayClass, "text-xl")}>
                {query.data?.partNumber || query.data?.partDescription || "Compare offers"}
              </h1>
              <p className="mt-1 text-sm text-[#38465F]">
                Compare all confirmed offers below, then pick one. TruckFixr connects you to the supplier to complete the purchase.
              </p>
            </div>

            {error && <p className="text-sm font-medium text-[#D81F2A]" role="alert">{error}</p>}

            {(query.data?.offers ?? []).length === 0 ? (
              <div className={cn(cardClass, "p-6 text-sm text-[#38465F]")}>
                No offers yet — check back soon.
              </div>
            ) : (
              <div className="space-y-3">
                {query.data?.offers.map((offer: any) => (
                  <div key={offer.id} className={cn(cardClass, "space-y-2 p-5")}>
                    <div className="flex items-center justify-between">
                      <span className="text-sm font-bold text-[#0A1A2E]">{offer.supplierName}</span>
                      <span className="text-base font-bold text-[#0A1A2E]">
                        {formatCad(offer.priceCents, offer.currency)}
                      </span>
                    </div>
                    <p className="text-sm text-[#38465F]">
                      {offer.brandManufacturer ? `${offer.brandManufacturer} — ` : ""}
                      {offer.description || offer.skuPartNumber}
                    </p>
                    <div className="flex flex-wrap gap-3 text-xs text-[#73777E]">
                      {offer.conditionType && <span>{offer.conditionType}</span>}
                      {offer.stockStatus && <span>{offer.stockStatus}</span>}
                      {offer.warrantyText && <span>Warranty: {offer.warrantyText}</span>}
                      {offer.quoteExpiresAt && (
                        <span>Quote expires {new Date(offer.quoteExpiresAt).toLocaleDateString()}</span>
                      )}
                    </div>
                    <Button
                      onClick={() => handleSelect(offer.id)}
                      disabled={selectMutation.isPending}
                      className={cn("h-10 w-full font-bold", redBtn)}
                    >
                      Choose this offer
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
}
