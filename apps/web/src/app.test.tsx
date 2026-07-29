// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { ProjectWorkspace } from "@smarchitect/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("minimal Project Workspace", () => {
  it("creates, renames, and exposes a single-Level Project Document", () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Our apartment" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(
      screen.getByRole("heading", { name: "Our apartment" })
    ).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { name: "Ground floor" })
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
        .value
    ).toContain("name: Our apartment");

    fireEvent.change(screen.getByLabelText("Rename project"), {
      target: { value: "Kitchen remodel" }
    });

    expect(
      screen.getByRole("heading", { name: "Kitchen remodel" })
    ).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
        .value
    ).toContain("name: Kitchen remodel");
    expect(
      screen.getByText(/early-stage space planning/i)
    ).toBeInTheDocument();
  });

  it("draws, selects, numerically edits, and deletes a Wall while updating YAML", () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Wall editor" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = screen.getByLabelText("Ground floor wall editor");
    Object.defineProperty(plan, "getBoundingClientRect", {
      value: () => ({
        left: 0, top: 0, width: 800, height: 520,
        right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({})
      })
    });
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });

    expect(screen.getByText("1 wall")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Wall length (mm)"), {
      target: { value: "4200" }
    });
    fireEvent.change(screen.getByLabelText("Wall thickness (mm)"), {
      target: { value: "220" }
    });
    fireEvent.change(screen.getByLabelText("Wall angle (deg)"), {
      target: { value: "53.13" }
    });
    fireEvent.change(screen.getByLabelText("Wall height (mm)"), {
      target: { value: "2800" }
    });
    expect(screen.getByLabelText("Wall angle (deg)")).toHaveValue(53.13);
    expect(screen.getByLabelText("Wall height (mm)")).toHaveValue(2800);

    fireEvent.change(screen.getByLabelText("Start Y (mm)"), {
      target: { value: "200" }
    });
    fireEvent.pointerDown(plan, { clientX: 226, clientY: 82 });
    fireEvent.pointerUp(plan, { clientX: 276, clientY: 82 });

    const yaml = (screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value;
    expect(yaml).toContain("thicknessMm: 220");
    expect(yaml).toContain("heightMm: 2800");
    expect(yaml).toContain("x: -2500");

    fireEvent.click(screen.getByRole("button", { name: "Delete wall" }));
    expect(screen.getByText("0 walls")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(screen.getByText("1 wall")).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
        .value
    ).toContain("heightMm: 2800");

    fireEvent.click(screen.getByRole("button", { name: "Redo" }));
    expect(screen.getByText("0 walls")).toBeInTheDocument();
  });

  it("imports a Project Document and exports it as YAML", async () => {
    const yaml = ProjectWorkspace.create("Imported apartment").exportYaml();
    const file = new File([yaml], "apartment.yaml", {
      type: "application/yaml"
    });
    Object.defineProperty(file, "text", {
      value: async () => yaml
    });
    const createObjectUrl = vi.fn(() => "blob:project-document");
    const revokeObjectUrl = vi.fn();
    const click = vi
      .spyOn(HTMLAnchorElement.prototype, "click")
      .mockImplementation(() => undefined);
    Object.defineProperty(URL, "createObjectURL", {
      configurable: true,
      value: createObjectUrl
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      configurable: true,
      value: revokeObjectUrl
    });

    render(<App />);
    fireEvent.change(screen.getByLabelText("Import Project Document"), {
      target: { files: [file] }
    });

    expect(
      await screen.findByRole("heading", { name: "Imported apartment" })
    ).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Export YAML" }));

    expect(createObjectUrl).toHaveBeenCalledOnce();
    expect(click).toHaveBeenCalledOnce();
    expect(revokeObjectUrl).toHaveBeenCalledWith("blob:project-document");
  });
});
