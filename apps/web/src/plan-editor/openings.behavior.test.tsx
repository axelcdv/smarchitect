// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { ProjectWorkspace } from "@smarchitect/core";
import { describe, expect, it } from "vitest";
import { drawDefaultWall } from "../test/app-test-setup.js";
import {
  PlanEditorTestHarness
} from "../test/plan-editor-test-harness.js";

function renderOpeningEditor(name: string): void {
  render(
    <PlanEditorTestHarness
      initialWorkspace={ProjectWorkspace.create(name)}
    />
  );
}

describe("Openings", () => {
  it("adds, graphically moves, edits, deletes, and restores Opening types", async () => {
    renderOpeningEditor("Opening editor");

    const plan = screen.getByLabelText("Ground floor wall editor");
    await drawDefaultWall(plan);

    fireEvent.click(screen.getByRole("button", { name: "Add door" }));
    expect(await screen.findByText("1 opening")).toBeInTheDocument();
    expect(screen.getByLabelText("Opening type")).toHaveValue("door");
    expect(screen.getByLabelText("Door operation")).toHaveValue("hinged");

    fireEvent.change(screen.getByLabelText("Door operation"), {
      target: { value: "sliding" }
    });
    await waitFor(() => expect(screen.getByLabelText("Door operation"))
      .toHaveValue("sliding"));
    fireEvent.change(screen.getByLabelText("Slide direction"), {
      target: { value: "end" }
    });
    await waitFor(() => expect(screen.getByLabelText("Slide direction"))
      .toHaveValue("end"));
    fireEvent.pointerDown(screen.getByRole("button", { name: "Door opening" }), {
      clientX: 205,
      clientY: 260
    });
    fireEvent.pointerUp(plan, { clientX: 225, clientY: 260 });
    await waitFor(() => expect(screen.getByLabelText("Opening position (mm)"))
      .toHaveValue(1250));

    fireEvent.click(screen.getByRole("button", { name: "Delete opening" }));
    expect(await screen.findByText("0 openings")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("1 opening")).toBeInTheDocument();
    expect((screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
      .value).toContain("slideDirection: end");
    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(await screen.findByText("0 openings")).toBeInTheDocument();
  });

  it("requires an explicit resolution when a Wall edit invalidates hosted Openings", async () => {
    renderOpeningEditor("Opening conflicts");
    const plan = screen.getByLabelText("Ground floor wall editor");
    await drawDefaultWall(plan);
    fireEvent.click(screen.getByRole("button", { name: "Add door" }));
    await screen.findByText("1 opening");

    fireEvent.change(screen.getByLabelText("Wall length (mm)"), {
      target: { value: "600" }
    });
    fireEvent.blur(screen.getByLabelText("Wall length (mm)"));
    const resolution = await screen.findByRole("alert", {
      name: "Opening conflict resolution"
    });
    expect(resolution).toHaveTextContent("door opening_");
    expect(screen.getByRole("button", {
      name: "Delete conflicting openings and apply"
    })).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Cancel wall edit" }));
    expect(screen.getByLabelText("Wall length (mm)")).toHaveValue(3000);

    fireEvent.change(screen.getByLabelText("Wall length (mm)"), {
      target: { value: "600" }
    });
    fireEvent.blur(screen.getByLabelText("Wall length (mm)"));
    fireEvent.click(await screen.findByRole("button", {
      name: "Fit openings and apply"
    }));
    await waitFor(() => {
      expect(screen.getByLabelText("Wall length (mm)")).toHaveValue(600);
      expect(screen.getByLabelText("Opening width (mm)")).toHaveValue(600);
      expect(screen.getByLabelText("Opening position (mm)")).toHaveValue(0);
    });
    expect(screen.queryByRole("alert", {
      name: "Opening conflict resolution"
    })).not.toBeInTheDocument();
  });
});
