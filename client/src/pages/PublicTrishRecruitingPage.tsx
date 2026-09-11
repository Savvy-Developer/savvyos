import { useMemo, useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CalendarDays, CheckCircle2, Clock3, Loader2, ShieldCheck } from "lucide-react";

function visitorTimezone() {
  return Intl.DateTimeFormat().resolvedOptions().timeZone || "America/New_York";
}

function formatSlot(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "short",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    timeZoneName: "short",
  }).format(new Date(value));
}

function dayLabel(value: string, timezone: string) {
  return new Intl.DateTimeFormat("en-US", {
    timeZone: timezone,
    weekday: "long",
    month: "long",
    day: "numeric",
  }).format(new Date(value));
}

export default function PublicTrishRecruitingPage() {
  const timezone = useMemo(visitorTimezone, []);
  const availability = trpc.recruiting.publicAvailability.useQuery(undefined, { retry: false, staleTime: 20_000 });
  const book = trpc.recruiting.publicBookTrish.useMutation({ onSuccess: () => availability.refetch() });
  const [selectedSlot, setSelectedSlot] = useState<{ startAt: string; endAt: string } | null>(null);
  const [form, setForm] = useState({ name: "", email: "", phone: "", currentBrokerage: "", primaryMarket: "", message: "" });
  const [error, setError] = useState<string | null>(null);

  const groupedSlots = useMemo(() => {
    const groups = new Map<string, Array<{ startAt: string; endAt: string }>>();
    for (const slot of availability.data?.slots ?? []) {
      const label = dayLabel(slot.startAt, timezone);
      groups.set(label, [...(groups.get(label) ?? []), slot]);
    }
    return Array.from(groups.entries());
  }, [availability.data?.slots, timezone]);

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (!selectedSlot) {
      setError("Choose a time before booking your conversation.");
      return;
    }
    try {
      await book.mutateAsync({ ...form, currentBrokerage: form.currentBrokerage || null, message: form.message || null, startAt: new Date(selectedSlot.startAt), timezone });
    } catch (err: any) {
      setError(err.message || "We could not confirm that time. Please choose another slot.");
      availability.refetch();
    }
  };

  if (book.data?.success) {
    return (
      <main className="min-h-screen bg-slate-950 px-5 py-10 text-white sm:px-8">
        <div className="mx-auto flex min-h-[80vh] max-w-2xl items-center justify-center">
          <section className="w-full rounded-3xl border border-cyan-300/20 bg-white p-8 text-slate-950 shadow-2xl sm:p-12">
            <CheckCircle2 className="h-12 w-12 text-emerald-600" />
            <p className="mt-7 text-sm font-bold uppercase tracking-[0.2em] text-cyan-700">Savvy STR Agents</p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight sm:text-4xl">You’re booked.</h1>
            <p className="mt-4 text-lg leading-8 text-slate-600">Your recruiting conversation with {book.data.hostName} is confirmed for <strong className="text-slate-900">{formatSlot(book.data.startAt.toString(), book.data.timezone)}</strong>.</p>
            <p className="mt-4 text-sm leading-6 text-slate-500">We sent the details to your email. Your calendar invitation is on the way as well.</p>
          </section>
        </div>
      </main>
    );
  }

  return (
    <main className="min-h-screen bg-slate-950 text-white">
      <header className="border-b border-white/10">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-5 sm:px-8">
          <div className="text-lg font-bold tracking-tight">SAVVY <span className="text-cyan-300">STR AGENTS</span></div>
          <div className="text-sm text-slate-300">A conversation for exceptional agents</div>
        </div>
      </header>
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-10 sm:px-8 lg:grid-cols-[0.82fr_1.18fr] lg:py-16">
        <section className="lg:py-8">
          <p className="text-sm font-bold uppercase tracking-[0.2em] text-cyan-300">Let’s talk</p>
          <h1 className="mt-5 text-4xl font-bold tracking-tight sm:text-5xl">Build the next chapter of your real estate business.</h1>
          <p className="mt-6 max-w-xl text-lg leading-8 text-slate-300">Trish is looking to connect with serious agents who want to build a sharper short-term rental investment business, backed by a real operating platform.</p>
          <div className="mt-10 space-y-4 text-sm text-slate-300">
            <div className="flex gap-3"><CalendarDays className="h-5 w-5 shrink-0 text-cyan-300" /><span>Choose a practical 30-minute recruiting conversation.</span></div>
            <div className="flex gap-3"><Clock3 className="h-5 w-5 shrink-0 text-cyan-300" /><span>Available times are shown in <strong className="text-white">your timezone: {timezone}</strong>.</span></div>
            <div className="flex gap-3"><ShieldCheck className="h-5 w-5 shrink-0 text-cyan-300" /><span>Your information is used only to coordinate this recruiting conversation.</span></div>
          </div>
        </section>
        <section className="rounded-3xl bg-white p-5 text-slate-950 shadow-2xl sm:p-8">
          <h2 className="text-2xl font-bold">Book a conversation with Trish</h2>
          <p className="mt-2 text-sm text-slate-500">A few details, then choose a time that works.</p>
          {availability.isLoading ? <div className="flex h-72 items-center justify-center"><Loader2 className="h-7 w-7 animate-spin text-cyan-700" /></div> : !availability.data?.connected ? <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm leading-6 text-amber-900">Online scheduling is being set up. Please check back shortly.</div> : (
            <form className="mt-7 space-y-6" onSubmit={submit}>
              <div className="space-y-3">
                <Label>Choose a time</Label>
                <p className="text-xs text-slate-500">Times are displayed in {timezone}.</p>
                {groupedSlots.length ? <div className="max-h-64 space-y-4 overflow-y-auto rounded-xl border border-slate-200 p-3">
                  {groupedSlots.map(([day, slots]) => <div key={day}><p className="mb-2 text-sm font-semibold text-slate-700">{day}</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-3">{slots.map(slot => <button key={slot.startAt} type="button" onClick={() => setSelectedSlot(slot)} className={`rounded-lg border px-2 py-2 text-sm font-medium transition-colors ${selectedSlot?.startAt === slot.startAt ? "border-cyan-700 bg-cyan-700 text-white" : "border-slate-200 hover:border-cyan-500 hover:bg-cyan-50"}`}>{new Intl.DateTimeFormat("en-US", { timeZone: timezone, hour: "numeric", minute: "2-digit" }).format(new Date(slot.startAt))}</button>)}</div></div>)}
                </div> : <p className="rounded-lg border border-dashed p-4 text-sm text-slate-500">No times are currently available. Please try again soon.</p>}
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="sm:col-span-2"><Label htmlFor="recruit-name">Full name</Label><Input id="recruit-name" className="mt-1.5" required value={form.name} onChange={event => setForm({ ...form, name: event.target.value })} /></div>
                <div><Label htmlFor="recruit-email">Email</Label><Input id="recruit-email" type="email" className="mt-1.5" required value={form.email} onChange={event => setForm({ ...form, email: event.target.value })} /></div>
                <div><Label htmlFor="recruit-phone">Phone</Label><Input id="recruit-phone" type="tel" className="mt-1.5" required value={form.phone} onChange={event => setForm({ ...form, phone: event.target.value })} /></div>
                <div><Label htmlFor="recruit-brokerage">Current brokerage</Label><Input id="recruit-brokerage" className="mt-1.5" value={form.currentBrokerage} onChange={event => setForm({ ...form, currentBrokerage: event.target.value })} /></div>
                <div><Label htmlFor="recruit-market">Primary market</Label><Input id="recruit-market" className="mt-1.5" required value={form.primaryMarket} onChange={event => setForm({ ...form, primaryMarket: event.target.value })} /></div>
                <div className="sm:col-span-2"><Label htmlFor="recruit-message">Anything you want Trish to know? <span className="font-normal text-slate-400">Optional</span></Label><Textarea id="recruit-message" className="mt-1.5 min-h-24" value={form.message} onChange={event => setForm({ ...form, message: event.target.value })} /></div>
              </div>
              {selectedSlot && <div className="rounded-xl bg-cyan-50 px-4 py-3 text-sm text-cyan-950"><strong>Selected:</strong> {formatSlot(selectedSlot.startAt, timezone)}</div>}
              {error && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
              <Button className="h-12 w-full bg-cyan-700 text-base hover:bg-cyan-800" disabled={book.isPending || !selectedSlot || !groupedSlots.length}>{book.isPending ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />Confirming with calendar…</> : "Confirm conversation"}</Button>
            </form>
          )}
        </section>
      </div>
    </main>
  );
}
