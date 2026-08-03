// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { ProjectWorkspace } from "@smarchitect/core";
import { describe, expect, it } from "vitest";
import { setPlanBounds } from "../test/app-test-setup.js";
import {
  PlanEditorTestHarness
} from "../test/plan-editor-test-harness.js";

describe("Room labels", () => {
  it("adds, edits, moves, deletes, and restores a Room Label", async () => {
    let workspace = ProjectWorkspace.create("Rooms");
    for (const [start, end] of [
      [[0, 0], [4000, 0]],
      [[4000, 0], [4000, 3000]],
      [[4000, 3000], [0, 3000]],
      [[0, 3000], [0, 0]]
    ] as const) {
      workspace = workspace.addWall({
        start: { x: start[0], y: start[1] },
        end: { x: end[0], y: end[1] }
      });
    }
    render(<PlanEditorTestHarness initialWorkspace={workspace} />);

    const plan = screen.getByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    expect(screen.getByText("1 room")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Add room label" }));
    fireEvent.pointerDown(plan, { clientX: 500, clientY: 110 });
    fireEvent.pointerUp(plan, { clientX: 500, clientY: 110 });

    expect(await screen.findByLabelText("Room Label name")).toHaveValue("Room 1");
    fireEvent.change(screen.getByLabelText("Room Label name"), {
      target: { value: "Kitchen" }
    });
    fireEvent.blur(screen.getByLabelText("Room Label name"));
    await waitFor(() => expect((screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value).toContain("name: Kitchen"));

    fireEvent.pointerDown(plan, { clientX: 500, clientY: 110 });
    fireEvent.pointerUp(plan, { clientX: 600, clientY: 110 });
    await waitFor(() => expect(screen.getByLabelText("Room Label X (mm)"))
      .toHaveValue(2000));
    expect((screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
      .value).toContain("name: Kitchen");

    fireEvent.click(screen.getByRole("button", { name: "Delete room label" }));
    await waitFor(() => expect(screen.queryByLabelText("Room Label name"))
      .not.toBeInTheDocument());

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(
      (screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement).value
    ).toContain("name: Kitchen"));
  });
});
