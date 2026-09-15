import { AlertTriangle, Link2, Loader2, Unlink, UserCheck } from "lucide-react";
import { toast } from "sonner";

import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { trpc } from "@/lib/trpc";

/**
 * Connecting a contact to their investor account on the public website.
 *
 * This is the switch that lets someone outside the company see a transaction,
 * so it is a decision a person makes here rather than something the system
 * infers. A matching email address is offered as a suggestion and nothing
 * more: signing up on the website does not prove you own the address you typed,
 * so an automatic match would hand one person another person's purchase.
 *
 * Whoever is looking at this contact record is the one who can tell whether it
 * is really the same human being. That judgement is the safeguard.
 */
export function ContactWebsiteAccountPanel({
  contactId,
}: {
  contactId: number;
}) {
  const utils = trpc.useUtils();
  const query = trpc.websiteAccount.accountsForContact.useQuery({ contactId });

  const refresh = () => utils.websiteAccount.accountsForContact.invalidate();
  const link = trpc.websiteAccount.linkAccountToContact.useMutation({
    onSuccess: () => {
      toast.success("Account connected. They can now see this deal.");
      refresh();
    },
    onError: error => toast.error(error.message),
  });
  const unlink = trpc.websiteAccount.unlinkAccount.useMutation({
    onSuccess: () => {
      toast.success("Account disconnected.");
      refresh();
    },
    onError: error => toast.error(error.message),
  });

  const linked = query.data?.linked ?? [];
  const suggestion = query.data?.suggestion ?? null;

  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <UserCheck className="h-4 w-4" />
          Website account
        </CardTitle>
        <CardDescription>
          Connecting an account lets this person sign in to the public website
          and follow their own transaction. They see the property, the price,
          the contract and closing dates, and their agent. They never see
          commission, payouts or any internal note.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        {query.isLoading && (
          <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
        )}

        {!query.isLoading && linked.length === 0 && !suggestion && (
          <p className="text-sm text-muted-foreground">
            No website account is connected. If this person has registered on
            the site with a different email address, find them there and connect
            it from their contact record.
          </p>
        )}

        {linked.map(account => (
          <div
            key={account.id}
            className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-muted/40 p-3"
          >
            <div className="min-w-0">
              <p className="text-sm font-semibold">
                {[account.firstName, account.lastName]
                  .filter(Boolean)
                  .join(" ") || account.email}
              </p>
              <p className="text-xs text-muted-foreground">{account.email}</p>
              <p className="mt-0.5 text-xs text-muted-foreground">
                {account.lastSignInAt
                  ? `Last signed in ${new Date(account.lastSignInAt).toLocaleDateString()}`
                  : "Has not signed in yet"}
              </p>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={unlink.isPending}
              onClick={() => unlink.mutate({ accountId: account.id })}
            >
              <Unlink className="mr-2 h-3.5 w-3.5" />
              Disconnect
            </Button>
          </div>
        ))}

        {suggestion && (
          <div className="rounded-lg border border-amber-200 bg-amber-50 p-3">
            <div className="flex gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-amber-950">
                  A website account uses this email address.
                </p>
                <p className="mt-0.5 text-xs text-amber-900">
                  {suggestion.email}
                </p>
                <p className="mt-2 text-xs text-amber-900">
                  Matching email is not proof it is the same person. Connect it
                  only if you know it is. Once connected they can see this
                  contact's transactions.
                </p>
              </div>
            </div>
            <Button
              type="button"
              size="sm"
              className="mt-3"
              disabled={link.isPending}
              onClick={() =>
                link.mutate({ accountId: suggestion.id, contactId })
              }
            >
              {link.isPending ? (
                <Loader2 className="mr-2 h-3.5 w-3.5 animate-spin" />
              ) : (
                <Link2 className="mr-2 h-3.5 w-3.5" />
              )}
              Connect this account
            </Button>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
