import { useMemo, useState } from "react";
import { ArrowLeft, Eye, Mail, MonitorSmartphone, Send } from "lucide-react";
import { Link } from "wouter";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";

const templateLabels: Record<string, { title: string; when: string; receives: string }> = {
  meeting_reminder: { title: "Meeting reminder", when: "The reminder day and time set for a meeting", receives: "Meeting members" },
  todo_assigned: { title: "To-do assigned", when: "A Pulse to-do is assigned", receives: "The assignee" },
  cascade_sent: { title: "Cascading message", when: "A meeting sends a cascading message", receives: "Members of receiving meetings" },
  overdue_digest: { title: "Overdue digest", when: "Weekly", receives: "People with overdue Pulse items" },
  mention: { title: "Mention", when: "Someone mentions a person in a Pulse item", receives: "The mentioned person" },
  rock_completed: { title: "Rock completed", when: "A meeting rock is marked done", receives: "That meeting’s owner and administrator" },
  welcome: { title: "Welcome", when: "A person is added to Pulse", receives: "The new member" },
};

function DeliveryMeaning({ inApp, email }: { inApp: boolean; email: boolean }) {
  const text = inApp && email ? "Right now: shows in Pulse and sends email." : inApp ? "Right now: shows in Pulse, no email sent." : email ? "Right now: sends email, no Pulse item." : "Right now: no Pulse item and no email sent.";
  return <p className="mt-3 rounded-md bg-muted/60 p-3 text-sm text-muted-foreground">{text}</p>;
}

function Preview({ templateKey }: { templateKey: any }) {
  const preview = trpc.pulse.notifications.templatePreview.useQuery({ templateKey });
  return <Dialog><DialogTrigger asChild><Button variant="outline" className="min-h-11"><Eye className="mr-2 h-4 w-4" />Preview</Button></DialogTrigger><DialogContent className="max-h-[90vh] max-w-3xl overflow-y-auto"><DialogHeader><DialogTitle>{templateLabels[templateKey]?.title ?? templateKey} preview</DialogTitle><DialogDescription>Rendered from the live Pulse template using clear sample meeting data.</DialogDescription></DialogHeader>{preview.isLoading ? <Skeleton className="h-96 w-full" /> : preview.error ? <p className="text-sm text-destructive">{preview.error.message}</p> : <><p className="text-sm text-muted-foreground">Subject: <span className="font-medium text-foreground">{preview.data?.subject}</span></p><iframe title={`${templateKey} email preview`} className="h-[560px] w-full rounded-lg border border-border bg-white" srcDoc={preview.data?.html ?? ""} sandbox="" /></>}</DialogContent></Dialog>;
}

export default function PulseNotificationPreferencesPage() {
  const utils = trpc.useUtils();
  const preferences = trpc.pulse.notifications.preferences.useQuery();
  const setPreference = trpc.pulse.notifications.setPreference.useMutation({ onSuccess: () => utils.pulse.notifications.preferences.invalidate() });
  const sendTest = trpc.pulse.notifications.sendTemplateTest.useMutation({ onSuccess: (data) => toast(`Test email sent to ${data.recipientEmail}.`) });
  const rows = useMemo(() => preferences.data ?? [], [preferences.data]);
  if (preferences.isLoading) return <main className="mx-auto max-w-5xl space-y-4"><Skeleton className="h-20 w-full" /><Skeleton className="h-96 w-full" /></main>;
  if (preferences.error) return <main className="mx-auto max-w-3xl"><Card><CardContent className="p-6"><p className="font-medium">This Pulse page is not available.</p><p className="mt-1 text-sm text-muted-foreground">Only Pulse settings users can review delivery controls.</p><Link className="mt-3 inline-block underline" href="/pulse/settings">Return to Pulse settings</Link></CardContent></Card></main>;
  return <main className="mx-auto max-w-5xl space-y-6 pb-10"><header className="border-b border-border pb-5"><Button asChild variant="ghost" className="-ml-3 min-h-11"><Link href="/pulse/settings"><ArrowLeft className="mr-2 h-4 w-4" />Pulse settings</Link></Button><p className="mt-3 text-sm font-medium text-primary">Pulse</p><h1 className="mt-1 text-2xl font-semibold tracking-tight sm:text-3xl">Email transparency</h1><p className="mt-2 max-w-3xl text-base leading-6 text-muted-foreground">Every email Pulse can send is shown here. The two delivery choices are independent, and every test sends the real template only to you.</p></header><Card><CardContent className="overflow-x-auto p-0"><table className="w-full min-w-[760px] text-left text-sm"><thead className="border-b border-border bg-muted/40 text-muted-foreground"><tr><th className="px-4 py-3 font-medium">Email</th><th className="px-4 py-3 font-medium">When it sends</th><th className="px-4 py-3 font-medium">Who receives it</th><th className="px-4 py-3 font-medium">Preview and test</th></tr></thead><tbody>{rows.map((preference: any) => { const copy = templateLabels[preference.templateKey] ?? { title: preference.templateKey, when: "When Pulse sends this notice", receives: "The relevant Pulse recipient" }; return <tr key={preference.templateKey} className="border-b border-border align-top last:border-0"><td className="px-4 py-4 font-medium text-foreground">{copy.title}</td><td className="px-4 py-4 text-muted-foreground">{copy.when}</td><td className="px-4 py-4 text-muted-foreground">{copy.receives}</td><td className="px-4 py-3"><div className="flex flex-wrap gap-2"><Preview templateKey={preference.templateKey} /><Button variant="outline" className="min-h-11" disabled={sendTest.isPending} onClick={() => sendTest.mutate({ templateKey: preference.templateKey })}><Send className="mr-2 h-4 w-4" />Send test to me</Button></div>{sendTest.error ? <p className="mt-2 text-xs text-destructive">{sendTest.error.message}</p> : null}</td></tr>; })}</tbody></table></CardContent></Card><section className="space-y-4"><div><h2 className="text-xl font-semibold">Your delivery controls</h2><p className="mt-1 text-base text-muted-foreground">These switches are intentionally separate. Changing one never changes the other.</p></div>{rows.map((preference: any) => { const copy = templateLabels[preference.templateKey] ?? { title: preference.templateKey }; return <Card key={preference.templateKey}><CardHeader className="pb-3"><CardTitle className="text-lg">{copy.title}</CardTitle><CardDescription>Choose exactly how you receive this Pulse notice.</CardDescription></CardHeader><CardContent><div className="grid gap-3 sm:grid-cols-2"><div className="rounded-lg border border-primary/25 bg-primary/5 p-3"><label className="flex min-h-11 items-center justify-between gap-3"><span className="flex items-center gap-2 font-medium"><MonitorSmartphone className="h-5 w-5" />Show in Pulse</span><Switch checked={preference.inApp} disabled={setPreference.isPending} onCheckedChange={(inApp) => setPreference.mutate({ templateKey: preference.templateKey, inApp })} /></label><p className="mt-2 text-sm text-muted-foreground">Creates a Pulse notification for you to see in the app.</p></div><div className="rounded-lg border border-sky-500/25 bg-sky-500/5 p-3"><label className="flex min-h-11 items-center justify-between gap-3"><span className="flex items-center gap-2 font-medium"><Mail className="h-5 w-5" />Send email</span><Switch checked={preference.email} disabled={setPreference.isPending} onCheckedChange={(email) => setPreference.mutate({ templateKey: preference.templateKey, email })} /></label><p className="mt-2 text-sm text-muted-foreground">Delivers the actual Pulse email to your inbox.</p></div></div><DeliveryMeaning inApp={preference.inApp} email={preference.email} /></CardContent></Card>; })}</section></main>;
}
