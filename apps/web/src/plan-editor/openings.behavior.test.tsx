// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { App } from "../App.js";
import { setPlanBounds } from "../test/app-test-setup.js";

describe("Openings", () => {
  it("adds, graphically moves, edits, deletes, and restores Opening types", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Opening editor" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByText("1 wall");

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
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Opening conflicts" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByText("1 wall");
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

  it("resolves Opening conflicts while editing a Design Proposal", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Proposal opening conflicts" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    const plan = await screen.findByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
    await screen.findByText("1 wall");
    fireEvent.click(screen.getByRole("button", { name: "Add door" }));
    await screen.findByText("1 opening");
    fireEvent.change(screen.getByLabelText("New Design Proposal name"), {
      target: { value: "Short wall" }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Create from Existing State"
    }));
    await screen.findByText("Design Proposal");
    fireEvent.pointerDown(plan, { clientX: 250, clientY: 260 });

    fireEvent.change(screen.getByLabelText("Wall length (mm)"), {
      target: { value: "600" }
    });
    fireEvent.blur(screen.getByLabelText("Wall length (mm)"));
    const resolution = await screen.findByRole("alert", {
      name: "Opening conflict resolution"
    });
    expect(resolution).toHaveTextContent("door opening_");
    fireEvent.click(screen.getByRole("button", {
      name: "Fit openings and apply"
    }));

    await waitFor(() => {
      expect(screen.getByLabelText("Wall length (mm)")).toHaveValue(600);
      expect((screen.getByLabelText(
        "Project Document YAML"
      ) as HTMLTextAreaElement).value).toContain("widthMm: 600");
      expect(screen.queryByRole("alert", {
        name: "Opening conflict resolution"
      })).not.toBeInTheDocument();
    });
  });
});
