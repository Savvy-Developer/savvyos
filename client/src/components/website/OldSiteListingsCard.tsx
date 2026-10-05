import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, Download, Loader2, Rocket, Search } from "lucide-react";

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
 * Website Studio > CMS: bring the live listings from the old savvy-agents.com
 * into SavvyOS. "Check" only reads the old site and reports. "Import as
 * drafts" creates the properties and website listings, credited to the same
 * agents, as drafts. "Publish the ready ones" then publishes the imported
 * drafts that have a photo, price, beds, baths, city, state and ZIP.
 * Safe to run again: anything already imported is skipped. A listing that
 * looks like a property SavvyOS already has, written differently, is listed
 * as a possible duplicate and skipped.
 */
export function OldSiteListingsCard() {
  const utils = trpc.useUtils();
  const [report, setReport] = useState<any>(null);
  const counts = trpc.website.importedOldSiteListingCounts.useQuery();
  const run = trpc.website.importOldSiteListings.useMutation({
    onSuccess: (result, variables) => {
      setReport(result);
      if (!variables.dryRun) {
        toast.success(`Imported ${result.created + result.attached} listings as drafts.`);
        void utils.website.importedOldSiteListingCounts.invalidate();
        void utils.website.adminOverview.invalidate();
      }
    },
    onError: error => toast.error(error.message),
  });
  const publish = trpc.website.publishReadyImportedListings.useMutation({
    onSuccess: result => {
      toast.success(`Published ${result.published} listings. ${result.notReady} still need details.`);
      void utils.website.importedOldSiteListingCounts.invalidate();
      void utils.website.adminOverview.invalidate();
    },
    onError: error => toast.error(error.message),
  });
  const busy = run.isPending || publish.isPending;
  const imported = counts.data;

  return (
    <Card>
      <CardHeader>
        <CardTitle>Listings from the old site</CardTitle>
        <CardDescription>
          The live listings on savvy-agents.com, brought into SavvyOS with their photos, details and agent. They come in
          as drafts. Check first: it only reads the old site.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        {imported && imported.draft + imported.published + imported.archived > 0 ? (
          <p className="text-sm">
            Imported so far: <span className="font-semibold">{imported.published}</span> live,{" "}
            <span className="font-semibold">{imported.draft}</span> drafts
            {imported.archived ? `, ${imported.archived} archived` : ""}.
          </p>
        ) : null}
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" disabled={busy} onClick={() => run.mutate({ dryRun: true, publishReady: false })}>
            {run.isPending && run.variables?.dryRun ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Search className="mr-2 h-4 w-4" />}
            Check
          </Button>
          <Button
            disabled={busy || !report || report.toCreate + report.toAttach === 0}
            title={!report ? "Run Check first" : undefined}
            onClick={() => {
              if (window.confirm(`Import ${report.toCreate + report.toAttach} listings as drafts?`))
                run.mutate({ dryRun: false, publishReady: false });
            }}
          >
            {run.isPending && run.variables && !run.variables.dryRun ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Download className="mr-2 h-4 w-4" />
            )}
            Import as drafts
          </Button>
          <Button
            variant="outline"
            disabled={busy || !imported || imported.draft === 0}
            onClick={() => {
              if (
                window.confirm(
                  "Publish every imported draft that has a photo, price, beds, baths, city, state and ZIP? They go live on the website right away."
                )
              )
                publish.mutate();
            }}
          >
            {publish.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Rocket className="mr-2 h-4 w-4" />}
            Publish the ready ones
          </Button>
        </div>
        {run.isPending ? <p className="text-sm text-slate-500">Reading the old site. This can take a minute.</p> : null}

        {report && (
          <div className="space-y-3 text-sm">
            <p>
              The old site has <span className="font-semibold">{report.found}</span> live listings
              {report.oldSiteCount != null && report.oldSiteCount !== report.found ? ` (it reports ${report.oldSiteCount})` : ""}.{" "}
              {report.dryRun ? (
                <>
                  <span className="font-semibold">{report.toCreate}</span> would be added,{" "}
                  <span className="font-semibold">{report.toAttach}</span> would be linked to a property SavvyOS already has,{" "}
                  {report.alreadyOnNewSite} are already on the new site.
                </>
              ) : (
                <>
                  Added <span className="font-semibold">{report.created}</span>, linked{" "}
                  <span className="font-semibold">{report.attached}</span> to existing properties
                  {report.published ? `, published ${report.published}` : ""}. {report.alreadyOnNewSite} were already on the
                  new site.
                </>
              )}
            </p>
            <p>
              {report.notReadyToPublish} are missing something the publish checklist needs
              {report.missingZip ? ` (${report.missingZip} have no ZIP code)` : ""}. They stay drafts until an agent fills
              them in.
            </p>
            {report.agentsNotFound.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-semibold">Agents not found in SavvyOS (their listings come in with no agent credited):</p>
                <ul className="mt-1 list-disc pl-5">
                  {report.agentsNotFound.slice(0, 20).map((item: any) => (
                    <li key={item.agent}>
                      {item.agent}: {item.listings}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.slugTaken.length > 0 && (
              <p className="text-amber-800">
                Skipped {report.slugTaken.length} whose web address is already used by a different property.
              </p>
            )}
            {report.possibleDuplicates?.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-semibold">
                  {report.dryRun ? "Will skip" : "Skipped"} {report.possibleDuplicates.length} that look like a property
                  SavvyOS already has, with the address written differently. Check each one and fix the address if it is
                  the same home:
                </p>
                <ul className="mt-1 list-disc pl-5">
                  {report.possibleDuplicates.map((item: any) => (
                    <li key={item.slug}>
                      {item.address} ({item.slug}): {item.message}
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {report.failed.length > 0 && (
              <div className="flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Could not import {report.failed.length}:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {report.failed.slice(0, 20).map((item: any) => (
                      <li key={item.slug}>
                        {item.slug}: {item.reason}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
