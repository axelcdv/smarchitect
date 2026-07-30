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
    fireEvent.blur(screen.getByLabelText("Rename project"));

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
    Object.defineProperty(plan, "getBoundingClientRect", {
      value: () => ({
        left: 0, top: 0, width: 800, height: 520,
        right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({})
      })
    });
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
    Object.defineProperty(plan, "getBoundingClientRect", {
      value: () => ({
        left: 0, top: 0, width: 800, height: 520,
        right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({})
      })
    });
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

  it("requires an explicit resolution when a Wall edit invalidates hosted Openings", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Opening conflicts" }
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
    const yaml = workspace.exportYaml();
    const file = new File([yaml], "rooms.yaml", { type: "application/yaml" });
    Object.defineProperty(file, "text", { value: async () => yaml });

    render(<App />);
    fireEvent.change(screen.getByLabelText("Import Project Document"), {
      target: { files: [file] }
    });

    const plan = await screen.findByLabelText("Ground floor wall editor");
    Object.defineProperty(plan, "getBoundingClientRect", {
      value: () => ({
        left: 0, top: 0, width: 800, height: 520,
        right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({})
      })
    });
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

  it("creates reusable Furniture, places and edits it, and persists it through Undo", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Furnished apartment" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await screen.findByRole("heading", { name: "Furnished apartment" });

    fireEvent.change(screen.getByLabelText("New Furniture name"), {
      target: { value: "Dining table" }
    });
    fireEvent.change(screen.getByLabelText("New Furniture widthMm"), {
      target: { value: "1800" }
    });
    fireEvent.change(screen.getByLabelText("New Furniture depthMm"), {
      target: { value: "900" }
    });
    fireEvent.change(screen.getByLabelText("New Furniture heightMm"), {
      target: { value: "750" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Furniture" }));

    await screen.findByRole("button", { name: "Place" });
    fireEvent.click(screen.getByRole("button", { name: "Delete" }));
    await waitFor(() => {
      expect(screen.queryByRole("button", { name: "Place" })).not.toBeInTheDocument();
    });
    fireEvent.click(screen.getByRole("button", { name: "Undo Item Library" }));
    const place = await screen.findByRole("button", { name: "Place" });
    fireEvent.click(place);
    const plan = screen.getByLabelText("Ground floor wall editor");
    Object.defineProperty(plan, "getBoundingClientRect", {
      value: () => ({
        left: 0, top: 0, width: 800, height: 520,
        right: 800, bottom: 520, x: 0, y: 0, toJSON: () => ({})
      })
    });
    fireEvent.pointerDown(plan, { clientX: 400, clientY: 260 });

    expect(await screen.findByText("1 Furniture Placement")).toBeInTheDocument();
    expect(screen.getByLabelText("Furniture elevation (mm)")).toHaveValue(0);
    fireEvent.change(screen.getByLabelText("Furniture rotation (deg)"), {
      target: { value: "45" }
    });
    fireEvent.blur(screen.getByLabelText("Furniture rotation (deg)"));
    await waitFor(() => expect((screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value).toContain("rotationDeg: 45"));
    fireEvent.change(screen.getByLabelText("Furniture elevation (mm)"), {
      target: { value: "120" }
    });
    fireEvent.blur(screen.getByLabelText("Furniture elevation (mm)"));
    await waitFor(() => expect((screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value).toContain("elevationMm: 120"));
    const yaml = (screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value;
    expect(yaml).toContain("furnitureDefinitions:");
    expect(yaml).toContain("definitionId:");
    expect(yaml).toContain("rotationDeg: 45");
    expect(yaml).toContain("elevationMm: 120");

    fireEvent.click(screen.getByRole("button", {
      name: "Delete Furniture Placement"
    }));
    expect(await screen.findByText("0 Furniture Placements")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("1 Furniture Placement")).toBeInTheDocument();
  });

  it("synchronizes controlled Item Library fields after Undo and Redo", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Library history" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await screen.findByRole("heading", { name: "Library history" });

    fireEvent.change(screen.getByLabelText("New Furniture name"), {
      target: { value: "Chair" }
    });
    fireEvent.change(screen.getByLabelText("New Furniture widthMm"), {
      target: { value: "450" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Furniture" }));

    const name = await screen.findByLabelText("Chair name");
    expect(screen.getByLabelText("Chair widthMm")).toHaveValue(450);
    fireEvent.change(name, { target: { value: "Armchair" } });
    fireEvent.blur(name);
    await screen.findByLabelText("Armchair name");
    fireEvent.change(screen.getByLabelText("Armchair widthMm"), {
      target: { value: "600" }
    });
    fireEvent.blur(screen.getByLabelText("Armchair widthMm"));
    await waitFor(() => expect(screen.getByLabelText("Armchair widthMm"))
      .toHaveValue(600));

    fireEvent.click(screen.getByRole("button", { name: "Undo Item Library" }));
    await waitFor(() => expect(screen.getByLabelText("Armchair widthMm"))
      .toHaveValue(450));
    fireEvent.click(screen.getByRole("button", { name: "Undo Item Library" }));
    await waitFor(() => expect(screen.getByLabelText("Chair name"))
      .toHaveValue("Chair"));
    expect(screen.getByLabelText("Chair widthMm")).toHaveValue(450);

    fireEvent.click(screen.getByRole("button", { name: "Redo Item Library" }));
    await waitFor(() => expect(screen.getByLabelText("Armchair name"))
      .toHaveValue("Armchair"));
    fireEvent.click(screen.getByRole("button", { name: "Redo Item Library" }));
    await waitFor(() => expect(screen.getByLabelText("Armchair widthMm"))
      .toHaveValue(600));
  });

  it("rejects invalid Item Library dimensions at the browser acceptance seam", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Valid library" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await screen.findByRole("heading", { name: "Valid library" });

    fireEvent.change(screen.getByLabelText("New Furniture name"), {
      target: { value: "Broken chair" }
    });
    fireEvent.change(screen.getByLabelText("New Furniture widthMm"), {
      target: { value: "0" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Furniture" }));

    expect(await screen.findByText(/positive integer millimetres/i))
      .toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Place" }))
      .not.toBeInTheDocument();
  });
});
