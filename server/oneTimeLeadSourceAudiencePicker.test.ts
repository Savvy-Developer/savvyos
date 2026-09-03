import { describe, expect, it } from "vitest";
import {
  sourceIdsForTopLevel,
  toggleSelectedSourceIds,
} from "../client/src/components/OneTimeLeadSourceAudiencePicker";

const sources = [
  { id: 10, name: "Partner Referrals", parentId: null },
  { id: 11, name: "Partner A", parentId: 10 },
  { id: 12, name: "Partner B", parentId: 10 },
  { id: 20, name: "Website", parentId: null },
] as const;

describe("one-time lead-source audience picker", () => {
  it("includes the top-level source and every sub-source when selecting a group", () => {
    expect(sourceIdsForTopLevel(sources[0], [...sources])).toEqual([10, 11, 12]);
  });

  it("adds an entire group without removing selections from another group", () => {
    expect(toggleSelectedSourceIds([20], [10, 11, 12]).sort((a, b) => a - b)).toEqual([
      10, 11, 12, 20,
    ]);
  });

  it("clears only the group when every source in that group is already selected", () => {
    expect(toggleSelectedSourceIds([10, 11, 12, 20], [10, 11, 12])).toEqual([20]);
  });

  it("allows a sub-source to be selected or cleared independently", () => {
    expect(toggleSelectedSourceIds([], [11])).toEqual([11]);
    expect(toggleSelectedSourceIds([11, 20], [11])).toEqual([20]);
  });
});
