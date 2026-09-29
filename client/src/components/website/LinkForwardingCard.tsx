import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ArrowRight, Link2, Loader2 } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { trpc } from "@/lib/trpc";
import {
  FORWARD_SOURCE_BASE,
  FORWARD_SOURCE_HOST,
  forwardingExample,
  normalizeTargetOrigin,
} from "@shared/websiteLinkForwarding";

/**
 * Website Studio > CMS: forward links to home.savvy-agents.com/newsite to the
 * site's new address after launch. Off until switched on here, and switching
 * on is refused until the new address already serves the site.
 */
export function LinkForwardingCard() {
  const utils = trpc.useUtils();
  const { data, isLoading } = trpc.website.linkForwarding.useQuery();
  const [targetOrigin, setTargetOrigin] = useState("");
  const [keepBasePath, setKeepBasePath] = useState(false);
  useEffect(() => {
    if (!data) return;
    setTargetOrigin(data.targetOrigin ?? "");
    setKeepBasePath(!!data.keepBasePath);
  }, [data]);

  const save = trpc.website.saveLinkForwarding.useMutation({
    onSuccess: async saved => {
      await utils.website.linkForwarding.invalidate();
      toast.success(saved.enabled ? "Forwarding is on." : "Saved. Forwarding is off.");
    },
    onError: error => toast.error(error.message),
  });

  const enabled = !!data?.enabled;
  const address = normalizeTargetOrigin(targetOrigin);
  const addressError = targetOrigin.trim() && "error" in address ? address.error : null;
  const example = forwardingExample({ targetOrigin, keepBasePath });
  const changed =
    !!data && ((data.targetOrigin ?? "") !== ("origin" in address ? address.origin : targetOrigin.trim()) || !!data.keepBasePath !== keepBasePath);

  const submit = (nextEnabled: boolean) =>
    save.mutate({ enabled: nextEnabled, targetOrigin: targetOrigin.trim() || null, keepBasePath });

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-wrap items-center gap-2">
          <CardTitle className="flex items-center gap-2">
            <Link2 className="h-5 w-5" />
            Old /newsite links
          </CardTitle>
          <Badge variant={enabled ? "default" : "secondary"}>{enabled ? "Forwarding on" : "Off"}</Badge>
        </div>
        <CardDescription>
          Links to {FORWARD_SOURCE_HOST}
          {FORWARD_SOURCE_BASE} are already published in social posts and emails. After launch, turn this on so every
          one of them goes to the same page on the new site address, with its UTMs kept. Only turn it on once the new
          address is live: SavvyOS checks that it answers first.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : data && !data.ready ? (
          <p className="text-sm text-muted-foreground">This setting becomes available after the next deploy.</p>
        ) : (
          <>
            <div className="space-y-2">
              <Label htmlFor="forward-target">New site address</Label>
              <Input
                id="forward-target"
                placeholder="https://savvy-agents.com"
                value={targetOrigin}
                disabled={enabled}
                onChange={event => setTargetOrigin(event.target.value)}
              />
              {addressError ? <p className="text-sm text-rose-600">{addressError}</p> : null}
            </div>
            <div className="flex items-center gap-3">
              <Switch
                id="forward-keep-base"
                checked={keepBasePath}
                disabled={enabled}
                onCheckedChange={value => setKeepBasePath(value)}
              />
              <Label htmlFor="forward-keep-base">The new address still has {FORWARD_SOURCE_BASE} in it</Label>
            </div>
            {example.to ? (
              <div className="rounded-md border bg-muted/40 p-3 text-xs">
                <p className="mb-1 font-semibold">Example</p>
                <p className="break-all">{example.from}</p>
                <p className="my-1 flex items-center gap-1 text-muted-foreground">
                  <ArrowRight className="h-3 w-3" /> goes to
                </p>
                <p className="break-all">{example.to}</p>
              </div>
            ) : null}
            <div className="flex flex-wrap gap-2">
              {enabled ? (
                <Button variant="outline" disabled={save.isPending} onClick={() => submit(false)}>
                  {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                  Turn forwarding off
                </Button>
              ) : (
                <>
                  <Button
                    variant="outline"
                    disabled={save.isPending || !!addressError || !changed}
                    onClick={() => submit(false)}
                  >
                    Save address (stays off)
                  </Button>
                  <Button
                    disabled={save.isPending || !targetOrigin.trim() || !!addressError}
                    onClick={() => {
                      if (
                        window.confirm(
                          `Turn forwarding on? Every ${FORWARD_SOURCE_HOST}${FORWARD_SOURCE_BASE} page will send visitors to the new address.`
                        )
                      )
                        submit(true);
                    }}
                  >
                    {save.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
                    Check and turn on
                  </Button>
                </>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}
