// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor
} from "@testing-library/react";
import { ProjectWorkspace } from "@smarchitect/core";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { App } from "./App.js";

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("smarchitect");
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});

describe("minimal Project Workspace", () => {
  it("creates, renames, and exposes a single-Level Project Document", async () => {
    render(<App />);

    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Our apartment" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    expect(await screen.findByRole("heading", {
      name: "Our apartment"
    })).toBeInTheDocument();
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

    expect(await screen.findByRole("heading", {
      name: "Kitchen remodel"
    })).toBeInTheDocument();
    expect(
      (screen.getByLabelText("Project Document YAML") as HTMLTextAreaElement)
        .value
    ).toContain("name: Kitchen remodel");
    expect(
      screen.getByText(/early-stage space planning/i)
    ).toBeInTheDocument();
  });

  it("draws, selects, numerically edits, and deletes a Wall while updating YAML", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Wall editor" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    Object.defineProperty(plan, "getBoundingClientRect", {
      value: () => ({
        left: 0, top: 0, width: 800, height: 520,
        right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({})
      })
    });
    fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
    fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });

    expect(await screen.findByText("1 wall")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Wall length (mm)"), {
      target: { value: "4200" }
    });
    await waitFor(() => expect(screen.getByLabelText("Wall length (mm)"))
      .toHaveValue(4200));
    fireEvent.change(screen.getByLabelText("Wall thickness (mm)"), {
      target: { value: "220" }
    });
    await waitFor(() => expect(screen.getByLabelText("Wall thickness (mm)"))
      .toHaveValue(220));
    fireEvent.change(screen.getByLabelText("Wall angle (deg)"), {
      target: { value: "53.13" }
    });
    await waitFor(() => expect(screen.getByLabelText("Wall angle (deg)"))
      .toHaveValue(53.13));
    fireEvent.change(screen.getByLabelText("Wall height (mm)"), {
      target: { value: "2800" }
    });
    await waitFor(() => expect(screen.getByLabelText("Wall height (mm)"))
      .toHaveValue(2800));

    fireEvent.change(screen.getByLabelText("Start Y (mm)"), {
      target: { value: "200" }
    });
    await waitFor(() => expect(screen.getByLabelText("Start Y (mm)"))
      .toHaveValue(200));
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

  it("adds, graphically moves, edits, deletes, and restores Opening types", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Opening editor" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));

    const plan = await screen.findByLabelText("Ground floor wall editor");
    Object.defineProperty(plan, "getBoundingClientRect", {
      value: () => ({
        left: 0, top: 0, width: 800, height: 520,
        right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({})
      })
    });
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
