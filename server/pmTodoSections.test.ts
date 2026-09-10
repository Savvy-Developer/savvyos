import { describe, expect, it } from "vitest";
import {
  collectTaskFamilyIds,
  normalizeProjectTodoLayout,
} from "./pmTodoSections";

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

  it("normalizes standalone todos and section rows into one root order", () => {
    expect(
      normalizeProjectTodoLayout(
        [
          { type: "task", id: 1 },
          { type: "section", id: 10, taskIds: [2, 3] },
          { type: "task", id: 4 },
          { type: "section", id: 20, taskIds: [] },
        ],
        [10, 20],
        [
          { id: 1, parentTaskId: null },
          { id: 2, parentTaskId: null },
          { id: 3, parentTaskId: null },
          { id: 4, parentTaskId: null },
          { id: 5, parentTaskId: 2 },
        ]
      )
    ).toEqual({
      sectionChanges: [
        { id: 10, sortOrder: 1 },
        { id: 20, sortOrder: 3 },
      ],
      taskChanges: [
        { id: 1, sectionId: null, sortOrder: 0 },
        { id: 2, sectionId: 10, sortOrder: 0 },
        { id: 3, sectionId: 10, sortOrder: 1 },
        { id: 4, sectionId: null, sortOrder: 2 },
      ],
    });
  });

  it("rejects duplicated or omitted top-level todos", () => {
    const tasks = [
      { id: 1, parentTaskId: null },
      { id: 2, parentTaskId: null },
    ];

    expect(() =>
      normalizeProjectTodoLayout(
        [
          { type: "task", id: 1 },
          { type: "section", id: 10, taskIds: [1, 2] },
        ],
        [10],
        tasks
      )
    ).toThrow("Each top-level todo must appear exactly once.");

    expect(() =>
      normalizeProjectTodoLayout(
        [{ type: "section", id: 10, taskIds: [1] }],
        [10],
        tasks
      )
    ).toThrow("The layout must include every top-level project todo.");
  });
});
