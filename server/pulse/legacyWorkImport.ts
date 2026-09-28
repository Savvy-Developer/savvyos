export type LegacyPulseWorkImportSource = {
  sourceKey: string;
  legacyId: string;
  sourceMeetingName: string;
  sourceOwnerName: string | null;
};

const markerPrefix = "Legacy Pulse Export Key:";

export function legacyPulseImportMarker(sourceKey: string) {
  return `${markerPrefix} ${sourceKey}`;
}

export function withLegacyPulseImportProvenance(
  description: string | null | undefined,
  source: LegacyPulseWorkImportSource,
) {
  const content = description?.trim() ?? "";
  const owner = source.sourceOwnerName ? `; Legacy owner: ${source.sourceOwnerName}` : "; Legacy owner: unresolved";
  const provenance = `<p><em>${legacyPulseImportMarker(source.sourceKey)}; Legacy Pulse Export ID: ${source.legacyId}; Source meeting: ${source.sourceMeetingName}${owner}</em></p>`;
  return `${content}${content ? "\n" : ""}${provenance}`;
}

export function isLegacyPulseImportSourceKey(sourceKey: string) {
  return /^pulse-open-l10-work-export-2026-09-28:(todo|issue):\d+:[a-z0-9-]+$/.test(sourceKey);
}
