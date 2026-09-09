import { describe, expect, it } from "vitest";
import { collectTaskFamilyIds, moveSectionInOrder } from "./pmTodoSections";

describe("project todo section ordering", () => {
  it("moves a section higher without changing the remaining order", () => {
    expect(moveSectionInOrder([11, 22, 33], 22, "up")).toEqual([22, 11, 33]);
  });

  it("moves a section lower without changing the remaining order", () => {
    expect(moveSectionInOrder([11, 22, 33], 22, "down")).toEqual([11, 33, 22]);
  });

  it("keeps first and last sections in place at their boundaries", () => {
    expect(moveSectionInOrder([11, 22, 33], 11, "up")).toEqual([11, 22, 33]);
    expect(moveSectionInOrder([11, 22, 33], 33, "down")).toEqual([11, 22, 33]);
  });

  it("rejects a section that is outside the project order", () => {
    expect(() => moveSectionInOrder([11, 22, 33], 44, "up")).toThrow(
      "Section is not part of the supplied order."
    );
  });
});

describe("project todo section membership", () => {
  it("collects the parent todo and every nested sub-todo", () => {
    const tasks = [
      { id: 1, parentTaskId: null },
      { id: 2, parentTaskId: 1 },
      { id: 3, parentTaskId: 2 },
      { id: 4, parentTaskId: null },
    ];

    expect(collectTaskFamilyIds(tasks, 1)).toEqual([1, 2, 3]);
  });
});
