import { useState } from "react";
import { toast } from "sonner";
import { AlertTriangle, ImageDown, Loader2, Search } from "lucide-react";

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
 * Website Studio > CMS: copy the images that still live on the old
 * savvy-agents.com storage into SavvyOS, before the old site is shut down.
 * "Check" only counts. "Move images" copies them and points the records at
 * the copies. Safe to run again.
 */
export function MoveOldImagesCard() {
  const utils = trpc.useUtils();
  const [report, setReport] = useState<any>(null);
  const move = trpc.website.moveOldSiteImages.useMutation({
    onSuccess: (result, variables) => {
      setReport(result);
      if (!variables.dryRun) {
        if (result.failed.length) toast.warning(`Moved ${result.moved} images. ${result.failed.length} could not be moved.`);
        else toast.success(`Moved ${result.moved} images into SavvyOS.`);
        void utils.website.adminOverview.invalidate();
      }
    },
    onError: error => toast.error(error.message),
  });

  return (
    <Card>
      <CardHeader>
        <CardTitle>Images from the old site</CardTitle>
        <CardDescription>
          Photos on the imported agents, case studies and blog posts still load
          from the old site's storage. Move them into SavvyOS before the old
          site is shut down, or they will stop showing.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-2">
          <Button
            variant="outline"
            disabled={move.isPending}
            onClick={() => move.mutate({ dryRun: true })}
          >
            {move.isPending && move.variables?.dryRun ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <Search className="mr-2 h-4 w-4" />
            )}
            Check
          </Button>
          <Button
            disabled={move.isPending || !report || report.toMove.total === 0}
            onClick={() => move.mutate({ dryRun: false })}
            title={!report ? "Run Check first" : undefined}
          >
            {move.isPending && move.variables && !move.variables.dryRun ? (
              <Loader2 className="mr-2 h-4 w-4 animate-spin" />
            ) : (
              <ImageDown className="mr-2 h-4 w-4" />
            )}
            Move images
          </Button>
        </div>

        {report && (
          <div className="space-y-3 text-sm">
            {report.dryRun ? (
              <p>
                <span className="font-semibold">{report.toMove.total}</span> images to move:{" "}
                {report.toMove.agentPhotos} agent photos, {report.toMove.caseStudyImages} case
                study images, {report.toMove.postImages} blog images.
              </p>
            ) : (
              <p>
                Moved <span className="font-semibold">{report.moved}</span> images and updated{" "}
                {report.recordsUpdated} records.
                {report.toMove.total === 0 ? " Nothing was left to move." : ""}
              </p>
            )}
            {report.failed.length > 0 && (
              <div className="rounded-md border border-amber-200 bg-amber-50 p-3 text-amber-900">
                <p className="font-semibold">Could not move {report.failed.length}:</p>
                <ul className="mt-1 list-disc pl-5">
                  {report.failed.slice(0, 20).map((item: any, index: number) => (
                    <li key={index}>
                      {item.record}: {item.reason}
                    </li>
                  ))}
                </ul>
                <p className="mt-1 text-xs">These keep their old link. Run Move images again, or replace the photo by hand.</p>
              </div>
            )}
            {report.brokenRefs.length > 0 && (
              <div className="flex gap-2 rounded-md border border-rose-200 bg-rose-50 p-3 text-rose-900">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <div>
                  <p className="font-semibold">Broken images to fix by hand:</p>
                  <ul className="mt-1 list-disc pl-5">
                    {report.brokenRefs.map((item: any, index: number) => (
                      <li key={index}>
                        {item.record}: "{item.value}"
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
