import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import PageHeader from "@/components/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Handshake, Info } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";

// ─── Helpers ─────────────────────────────────────────────────────────────────
function fmt(pct: number) {
  return `${pct.toFixed(1).replace(/\.0$/, "")}%`;
}

function calcBreakdown(
  referralPct: number,
  agentCommissionSplit: number | null,
  groupLeaderSplit: number | null
) {
  // GCI = 100% (we work in percentages of GCI)
  // Referral fee comes off the top first
  const afterReferral = 100 - referralPct;

  // Agent's share of what's left (their commission split %)
  const agentSplit = agentCommissionSplit ?? 70; // default 70% if not set
  const agentNet = (afterReferral * agentSplit) / 100;

  // Group leader's cut (taken from agent's share)
  const glSplit = groupLeaderSplit ?? 0;
  const glAmount = (agentNet * glSplit) / 100;
  const agentFinal = agentNet - glAmount;

  // Savvy's share
  const savvyNet = afterReferral - agentNet;

  return {
    referral: referralPct,
    agent: agentFinal,
    groupLeader: glAmount,
    savvy: savvyNet,
    total: referralPct + agentFinal + glAmount + savvyNet,
  };
}

// ─── Component ───────────────────────────────────────────────────────────────
export default function ReferralPartnersPage() {
  const { user } = useAuth();
  const { data: partners = [], isLoading } = trpc.leadSources.referralPartners.useQuery();
  const { data: groupInfo } = trpc.groups.myGroupInfo.useQuery();

  const agentSplit = user?.commissionSplit ?? null;
  const glSplit = groupInfo
    ? (groupInfo.leaderSplitOverride ?? groupInfo.leaderCommissionSplit ?? null)
    : null;
  const inGroup = !!groupInfo;
  const isLeader = groupInfo?.isLeader ?? false;

  return (
    <TooltipProvider>
      <div className="p-6 space-y-6 max-w-5xl mx-auto">
        <PageHeader
          title="Referral Partners"
          subtitle="Commission breakdown for leads from each referral partner"
        />

        {/* Info card */}
        <Card className="border-primary/20 bg-primary/5">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-start gap-3">
              <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
              <div className="text-sm text-muted-foreground space-y-1">
                <p>
                  The table below shows how a transaction GCI would be split for each referral partner.
                  Referral fees are deducted first, then your commission split applies to the remainder.
                  {inGroup && !isLeader && groupInfo?.groupName && (
                    <> Your group leader (<strong>{groupInfo.groupName}</strong>) takes{" "}
                    {fmt(glSplit ?? 0)} of your share.</>
                  )}
                  {isLeader && (
                    <> As a group leader, the "Group Leader" column shows what you earn from your members' transactions.</>
                  )}
                </p>
                {!agentSplit && (
                  <p className="text-amber-600 dark:text-amber-400">
                    Your commission split has not been configured yet. Estimates use a default of 70%.
                    Contact your admin to set your split.
                  </p>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Table */}
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-base">
              <Handshake className="h-4 w-4 text-primary" />
              Referral Partner Fee Breakdown
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {isLoading ? (
              <div className="p-8 text-center text-muted-foreground text-sm">Loading referral partners…</div>
            ) : partners.length === 0 ? (
              <div className="p-8 text-center text-muted-foreground text-sm">
                No referral partners have been configured yet. Ask your admin to add them under Lead Sources.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b bg-muted/30">
                      <th className="text-left px-4 py-3 font-medium text-muted-foreground">Referral Partner</th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 mx-auto">
                            Referral Fee <Info className="h-3 w-3" />
                          </TooltipTrigger>
                          <TooltipContent>Percentage of GCI paid to the referral partner off the top</TooltipContent>
                        </Tooltip>
                      </th>
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 mx-auto">
                            Your Commission <Info className="h-3 w-3" />
                          </TooltipTrigger>
                          <TooltipContent>Your net share of GCI after referral fee and group leader cut</TooltipContent>
                        </Tooltip>
                      </th>
                      {inGroup && (
                        <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                          <Tooltip>
                            <TooltipTrigger className="flex items-center gap-1 mx-auto">
                              Group Leader <Info className="h-3 w-3" />
                            </TooltipTrigger>
                            <TooltipContent>
                              {isLeader
                                ? "Your earnings as group leader from member transactions"
                                : `${groupInfo?.groupName ?? "Group leader"}'s cut from your commission`}
                            </TooltipContent>
                          </Tooltip>
                        </th>
                      )}
                      <th className="text-center px-4 py-3 font-medium text-muted-foreground">
                        <Tooltip>
                          <TooltipTrigger className="flex items-center gap-1 mx-auto">
                            Savvy's Split <Info className="h-3 w-3" />
                          </TooltipTrigger>
                          <TooltipContent>Savvy Realty's share of GCI after referral fee</TooltipContent>
                        </Tooltip>
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {partners.map((partner, idx) => {
                      const refPct = partner.referralPercent ?? 0;
                      const bd = calcBreakdown(refPct, agentSplit, inGroup ? glSplit : null);
                      return (
                        <tr key={partner.id} className={`border-b last:border-0 hover:bg-muted/20 transition-colors ${idx % 2 === 0 ? "" : "bg-muted/10"}`}>
                          <td className="px-4 py-3 font-medium">{partner.name}</td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className="text-orange-600 border-orange-300 bg-orange-50 dark:bg-orange-950/30">
                              {fmt(bd.referral)}
                            </Badge>
                          </td>
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className="text-green-600 border-green-300 bg-green-50 dark:bg-green-950/30 font-semibold">
                              {fmt(bd.agent)}
                            </Badge>
                          </td>
                          {inGroup && (
                            <td className="px-4 py-3 text-center">
                              <Badge variant="outline" className="text-blue-600 border-blue-300 bg-blue-50 dark:bg-blue-950/30">
                                {fmt(bd.groupLeader)}
                              </Badge>
                            </td>
                          )}
                          <td className="px-4 py-3 text-center">
                            <Badge variant="outline" className="text-purple-600 border-purple-300 bg-purple-50 dark:bg-purple-950/30">
                              {fmt(bd.savvy)}
                            </Badge>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  <tfoot>
                    <tr className="bg-muted/20 border-t">
                      <td colSpan={inGroup ? 5 : 4} className="px-4 py-2 text-xs text-muted-foreground italic">
                        * Percentages are of Gross Commission Income (GCI). Your commission split:{" "}
                        <strong>{agentSplit ? `${agentSplit}%` : "not set (using 70% default)"}</strong>
                        {inGroup && glSplit != null && (
                          <>, group leader cut: <strong>{fmt(glSplit)}</strong> of your share</>
                        )}
                      </td>
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </TooltipProvider>
  );
}
