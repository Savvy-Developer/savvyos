import { CheckCircle2, CircleAlert, ExternalLink } from "lucide-react";
import { Link } from "wouter";
import { Button } from "@/components/ui/button";

export function VendorPaymentConfirmedPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-emerald-200 bg-white p-8 text-center shadow-sm">
        <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-emerald-700">Payment submitted</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">Thank you for becoming a Featured vendor.</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">Stripe is confirming your subscription. Once payment is successful, your Savvy STR Agent will see the updated status in their Vendor List.</p>
        <Button asChild className="mt-6"><a href="https://savvy-agents.com" target="_blank" rel="noreferrer">Visit Savvy STR Agents <ExternalLink className="ml-2 h-4 w-4" /></a></Button>
      </section>
    </main>
  );
}

export function VendorPaymentCanceledPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-12">
      <section className="w-full max-w-lg rounded-2xl border border-amber-200 bg-white p-8 text-center shadow-sm">
        <CircleAlert className="mx-auto h-12 w-12 text-amber-600" />
        <p className="mt-5 text-sm font-semibold uppercase tracking-wide text-amber-700">Checkout canceled</p>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-slate-900">No payment has been made.</h1>
        <p className="mt-4 text-sm leading-6 text-slate-600">You can return to the Stripe payment link from your invitation email whenever you are ready. Contact your Savvy STR Agent if you need a new invitation.</p>
        <Button asChild variant="outline" className="mt-6"><Link href="/">Return to Savvy STR Agents</Link></Button>
      </section>
    </main>
  );
}
