import AppLogo from "@/components/AppLogo";
import { Button } from "@/components/ui/button";

export default function Offline() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
      <section className="w-full max-w-md rounded-3xl border border-slate-200 bg-white p-8 text-center shadow-sm">
        <div className="mb-5 flex justify-center">
          <AppLogo imageClassName="h-12" frameClassName="p-2" href="/" />
        </div>
        <h1 className="text-2xl font-bold text-slate-900">You’re offline</h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          TruckFixr needs a connection to restore your session and load your fleet workspace.
        </p>
        <Button className="mt-6 w-full" onClick={() => window.location.assign("/login")}>
          Try sign in again
        </Button>
      </section>
    </main>
  );
}