import { describe, expect, it } from "vitest";
import {
  buildProjectTodoLayout,
  moveProjectTodo,
  moveProjectTodoSection,
  type ProjectTodoLayoutItem,
} from "../client/src/components/ProjectTodoBoard";

const initialLayout: ProjectTodoLayoutItem[] = [
  { type: "task", id: 1 },
  { type: "section", id: 10, taskIds: [2, 3] },
  { type: "task", id: 4 },
  { type: "section", id: 20, taskIds: [5] },
];

describe("project todo drag layout", () => {
  it("builds one root order containing standalone todos and section rows", () => {
    expect(
      buildProjectTodoLayout(
        [
          { id: 10, title: "First", sortOrder: 1 },
          { id: 20, title: "Second", sortOrder: 3 },
        ],
        [
          {
            id: 1,
            title: "One",
            sectionId: null,
            sortOrder: 0,
            completed: false,
          },
          {
            id: 2,
            title: "Two",
            sectionId: 10,
            sortOrder: 1,
            completed: false,
          },
          {
            id: 3,
            title: "Three",
            sectionId: 10,
            sortOrder: 0,
            completed: false,
          },
          {
            id: 4,
            title: "Four",
            sectionId: null,
            sortOrder: 2,
            completed: false,
          },
        ]
      )
    ).toEqual([
      { type: "task", id: 1 },
      { type: "section", id: 10, taskIds: [3, 2] },
      { type: "task", id: 4 },
      { type: "section", id: 20, taskIds: [] },
    ]);
  });

  it("moves a section and keeps every grouped todo with it", () => {
    expect(
      moveProjectTodoSection(initialLayout, 10, {
        type: "task",
        taskId: 4,
      })
    ).toEqual([
      { type: "task", id: 1 },
      { type: "task", id: 4 },
      { type: "section", id: 10, taskIds: [2, 3] },
      { type: "section", id: 20, taskIds: [5] },
    ]);
  });

  it("places a section at an exact root insertion slot", () => {
    expect(
      moveProjectTodoSection(initialLayout, 20, {
        type: "root-slot",
        index: 1,
      })
    ).toEqual([
      { type: "task", id: 1 },
      { type: "section", id: 20, taskIds: [5] },
      { type: "section", id: 10, taskIds: [2, 3] },
      { type: "task", id: 4 },
    ]);
  });

  it("moves a todo from one section into another section", () => {
    expect(
      moveProjectTodo(initialLayout, 3, {
        type: "container",
        sectionId: 20,
      })
    ).toEqual([
      { type: "task", id: 1 },
      { type: "section", id: 10, taskIds: [2] },
      { type: "task", id: 4 },
      { type: "section", id: 20, taskIds: [5, 3] },
    ]);
  });

  it("moves a section todo into the shared root order", () => {
    expect(
      moveProjectTodo(initialLayout, 2, {
        type: "task",
        taskId: 4,
      })
    ).toEqual([
      { type: "task", id: 1 },
      { type: "section", id: 10, taskIds: [3] },
      { type: "task", id: 2 },
      { type: "task", id: 4 },
      { type: "section", id: 20, taskIds: [5] },
    ]);
  });

  it("reorders a standalone todo around section rows without changing membership", () => {
    expect(
      moveProjectTodo(initialLayout, 4, {
        type: "root-slot",
        index: 1,
      })
    ).toEqual([
      { type: "task", id: 1 },
      { type: "task", id: 4 },
      { type: "section", id: 10, taskIds: [2, 3] },
      { type: "section", id: 20, taskIds: [5] },
    ]);
  });
});
