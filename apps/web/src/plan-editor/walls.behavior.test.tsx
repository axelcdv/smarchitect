// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../App.js";
import {
  FailableProjectRepository,
  setPlanBounds
} from "../test/app-test-setup.js";

describe("Walls", () => {
  it("draws, selects, numerically edits, and deletes a Wall while updating YAML", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Wall editor" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });

    expect(await screen.findByText("1 wall")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Wall length (mm)"), {
      target: { value: "4200" }
    });
    fireEvent.blur(screen.getByLabelText("Wall length (mm)"));
    await waitFor(() => expect((screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value).toContain("x: 1200"));
    fireEvent.change(screen.getByLabelText("Wall thickness (mm)"), {
      target: { value: "220" }
    });
    fireEvent.blur(screen.getByLabelText("Wall thickness (mm)"));
    await waitFor(() => expect((screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value).toContain("thicknessMm: 220"));
    fireEvent.change(screen.getByLabelText("Wall angle (deg)"), {
      target: { value: "53.13" }
    });
    fireEvent.blur(screen.getByLabelText("Wall angle (deg)"));
    await waitFor(() => {
      expect(screen.getByLabelText("Wall angle (deg)")).toHaveValue(53.13);
      expect(screen.getByLabelText("Wall angle (deg)")).not.toBeDisabled();
    });
    fireEvent.change(screen.getByLabelText("Wall height (mm)"), {
      target: { value: "2800" }
    });
    fireEvent.blur(screen.getByLabelText("Wall height (mm)"));
    await waitFor(() => expect((screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value).toContain("heightMm: 2800"));

    fireEvent.change(screen.getByLabelText("Start Y (mm)"), {
      target: { value: "200" }
    });
    fireEvent.blur(screen.getByLabelText("Start Y (mm)"));
    await waitFor(() => expect((screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value).toContain("y: 200"));
    const yaml = (screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value;
    expect(yaml).toContain("thicknessMm: 220");
    expect(yaml).toContain("heightMm: 2800");

    fireEvent.click(screen.getByRole("button", { name: "Delete wall" }));
    expect(await screen.findByText("0 walls")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("1 wall")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
        .value
    ).toContain("heightMm: 2800");

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(await screen.findByText("0 walls")).toBeInTheDocument();
  });

  it("selects a Wall without nudging it and previews deliberate dragging", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Wall gestures" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByText("1 wall");

    const selectedWall = plan.querySelector(".selected-wall");
    const initialPoints = selectedWall?.getAttribute("points");
    fireEvent.pointerDown(plan, { clientX: 250, clientY: 260 });
    fireEvent.pointerMove(plan, { clientX: 252, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 252, clientY: 260 });
    expect(plan.querySelector(".selected-wall")).toHaveAttribute(
      "points",
      initialPoints
    );

    fireEvent.pointerDown(plan, { clientX: 250, clientY: 260 });
    fireEvent.pointerMove(plan, { clientX: 350, clientY: 210 });
    expect(plan.querySelector(".selected-wall")?.getAttribute("points"))
      .not.toBe(initialPoints);
    fireEvent.pointerMove(plan, { clientX: 250, clientY: 260 });
    expect(plan.querySelector(".selected-wall")).toHaveAttribute(
      "points",
      initialPoints
    );
    fireEvent.pointerUp(plan, { clientX: 250, clientY: 260 });
    await waitFor(() => expect(screen.getByLabelText("Start X (mm)"))
      .toHaveValue(-3000));

    fireEvent.pointerDown(plan, { clientX: 250, clientY: 260 });
    fireEvent.pointerMove(plan, { clientX: 350, clientY: 210 });
    fireEvent.pointerUp(plan, { clientX: 350, clientY: 210 });
    await waitFor(() => expect(screen.getByLabelText("Start X (mm)"))
      .toHaveValue(-2000));
  });

  it("keeps a numeric field focused while composing a multi-character edit", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Buffered editing" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByText("1 wall");

    const length = screen.getByLabelText("Wall length (mm)");
    length.focus();
    for (const value of ["4", "42", "420", "4200"]) {
      fireEvent.change(length, { target: { value } });
      expect(length).toHaveFocus();
      expect(length).toHaveValue(Number(value));
    }
    expect((screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value).toContain("end: { x: 0");

    fireEvent.blur(length);
    await waitFor(() => expect((screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value).toContain("end: { x: 1200"));
  });

  it("keeps editor selection when plan and history persistence fail", async () => {
    const repository = new FailableProjectRepository();
    render(<App projectRepository={repository} />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Durable selection" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByLabelText("Wall length (mm)");

    repository.failSaving = true;
    fireEvent.change(screen.getByLabelText("New Design Proposal name"), {
      target: { value: "Rejected proposal" }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Create from Existing State"
    }));
    expect(await screen.findByText("Autosave failed: storage unavailable"))
      .toBeInTheDocument();
    expect(screen.getByLabelText("Wall length (mm)")).toBeInTheDocument();

    const saveAttempts = repository.saveAttempts;
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    await waitFor(() => expect(repository.saveAttempts)
      .toBe(saveAttempts + 1));
    expect(screen.getByLabelText("Wall length (mm)")).toBeInTheDocument();
  });

  it("does not reset an inspector draft when persistence errors change", async () => {
    const repository = new FailableProjectRepository();
    render(<App projectRepository={repository} />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Durable inspector draft" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByLabelText("Wall length (mm)");
    fireEvent.change(screen.getByLabelText("New Design Proposal name"), {
      target: { value: "Draft plan" }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Create from Existing State"
    }));
    await screen.findByText("Design Proposal");

    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.pointerDown(plan, { clientX: 250, clientY: 260 });
    const length = await screen.findByLabelText("Wall length (mm)");
    fireEvent.change(length, { target: { value: "4200" } });
    expect(length).toHaveValue(4200);

    repository.failSaving = true;
    fireEvent.change(screen.getByLabelText("Rename Design Proposal"), {
      target: { value: "Rejected rename" }
    });
    expect(await screen.findByText("Autosave failed: storage unavailable"))
      .toBeInTheDocument();
    expect(length).toHaveValue(4200);
  });
});
