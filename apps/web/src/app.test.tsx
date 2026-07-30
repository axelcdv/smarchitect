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
    await waitFor(() => expect(screen.getByLabelText("Room Label name"))
      .toHaveValue("Kitchen"));

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
    await waitFor(() => {
      expect(screen.getByLabelText("Furniture rotation (deg)")).toHaveValue(45);
    });
    fireEvent.change(screen.getByLabelText("Furniture elevation (mm)"), {
      target: { value: "120" }
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Furniture rotation (deg)")).toHaveValue(45);
      expect(screen.getByLabelText("Furniture elevation (mm)")).toHaveValue(120);
    });
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

  it("undoes Item Library changes in chronological order across tabs", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Combined library history" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await screen.findByRole("heading", { name: "Combined library history" });

    fireEvent.change(screen.getByLabelText("New Furniture name"), {
      target: { value: "Chair" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Furniture" }));
    await screen.findByLabelText("Chair name");

    fireEvent.click(screen.getByRole("tab", { name: "Fixtures" }));
    fireEvent.change(screen.getByLabelText("New Fixture name"), {
      target: { value: "Radiator" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Fixture" }));
    await screen.findByLabelText("Radiator name");

    fireEvent.click(screen.getByRole("tab", { name: "Furniture" }));
    fireEvent.click(screen.getByRole("button", { name: "Undo Item Library" }));
    expect(await screen.findByLabelText("Chair name")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("tab", { name: "Fixtures" }));
    await waitFor(() => {
      expect(screen.queryByLabelText("Radiator name")).not.toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Redo Item Library" }));
    expect(await screen.findByLabelText("Radiator name")).toBeInTheDocument();
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

  it("creates, places, updates, makes unique, and undoes Fixtures", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Installed apartment" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create project" }));
    await screen.findByRole("heading", { name: "Installed apartment" });

    fireEvent.click(screen.getByRole("tab", { name: "Fixtures" }));
    fireEvent.change(screen.getByLabelText("New Fixture name"), {
      target: { value: "Kitchen sink" }
    });
    fireEvent.change(screen.getByLabelText("New Fixture widthMm"), {
      target: { value: "800" }
    });
    fireEvent.change(screen.getByLabelText("New Fixture depthMm"), {
      target: { value: "500" }
    });
    fireEvent.change(screen.getByLabelText("New Fixture heightMm"), {
      target: { value: "220" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Fixture" }));

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

    expect(await screen.findByText("1 Fixture Placement")).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("Fixture rotation (deg)"), {
      target: { value: "45" }
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Fixture rotation (deg)")).toHaveValue(45));
    fireEvent.change(screen.getByLabelText("Fixture elevation (mm)"), {
      target: { value: "850" }
    });
    await waitFor(() => {
      expect(screen.getByLabelText("Fixture elevation (mm)")).toHaveValue(850);
    });

    fireEvent.change(screen.getByLabelText("Kitchen sink widthMm"), {
      target: { value: "900" }
    });
    fireEvent.blur(screen.getByLabelText("Kitchen sink widthMm"));
    await waitFor(() =>
      expect(screen.getByLabelText("Kitchen sink widthMm")).toHaveValue(900));
    const updateFromLibrary = screen.getByRole("button", {
      name: "Update from Item Library"
    });
    await waitFor(() => expect(updateFromLibrary).toBeEnabled());
    expect(screen.getByLabelText("Fixture width (mm)")).toHaveValue(800);
    fireEvent.click(updateFromLibrary);
    await waitFor(() =>
      expect(screen.getByLabelText("Fixture width (mm)")).toHaveValue(900));
    fireEvent.change(screen.getByLabelText("Fixture name"), {
      target: { value: "Basin" }
    });
    await screen.findByRole("heading", { name: "Basin" });
    const makeUnique = screen.getByRole("button", { name: "Make unique" });
    await waitFor(() => expect(makeUnique).toBeEnabled());
    fireEvent.click(makeUnique);
    await screen.findByRole("heading", { name: "Basin copy" });

    const yaml = (screen.getByLabelText(
      "Project Document YAML"
    ) as HTMLTextAreaElement).value;
    expect(yaml).toContain("fixtureDefinitions:");
    expect(yaml).toContain("fixturePlacements:");
    expect(yaml).toContain("fixture_definition_");
    expect(yaml).toContain("fixture_placement_");

    fireEvent.click(screen.getByRole("button", {
      name: "Delete Fixture Placement"
    }));
    expect(await screen.findByText("0 Fixture Placements")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByText("1 Fixture Placement")).toBeInTheDocument();
  });

  it("keeps Opening and Fixture selection mutually exclusive in both orders", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Exclusive selection" }
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
    await screen.findByRole("button", { name: "Door opening" });

    fireEvent.click(screen.getByRole("tab", { name: "Fixtures" }));
    fireEvent.change(screen.getByLabelText("New Fixture name"), {
      target: { value: "Radiator" }
    });
    fireEvent.click(screen.getByRole("button", { name: "Create Fixture" }));
    fireEvent.click(await screen.findByRole("button", { name: "Place" }));
    fireEvent.pointerDown(plan, { clientX: 600, clientY: 260 });
    await screen.findByLabelText("Fixture rotation (deg)");

    fireEvent.pointerDown(screen.getByRole("button", { name: "Door opening" }), {
      clientX: 205,
      clientY: 260
    });
    expect(await screen.findByLabelText("Opening position (mm)"))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("Fixture rotation (deg)"))
      .not.toBeInTheDocument();

    fireEvent.pointerDown(plan, { clientX: 600, clientY: 260 });
    expect(await screen.findByLabelText("Fixture rotation (deg)"))
      .toBeInTheDocument();
    expect(screen.queryByLabelText("Opening position (mm)"))
      .not.toBeInTheDocument();
  });

  it("creates, selects, renames, stales, deletes, and restores Design Proposals", async () => {
    render(<App />);
    fireEvent.change(screen.getByLabelText("Project name"), {
      target: { value: "Proposal project" }
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

    fireEvent.change(screen.getByLabelText("New Design Proposal name"), {
      target: { value: "Open kitchen" }
    });
    fireEvent.click(screen.getByRole("button", {
      name: "Create from Existing State"
    }));
    await screen.findByText("1 proposals");
    expect(screen.getByText("Design Proposal")).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("Rename Design Proposal"), {
      target: { value: "Kitchen and dining" }
    });
    await screen.findByRole("button", { name: /Kitchen and dining/ });

    fireEvent.click(screen.getByRole("button", {
      name: /^Existing StateRevision/
    }));
    await waitFor(() =>
      expect(screen.queryByText("Design Proposal")).not.toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.pointerDown(plan, { clientX: 250, clientY: 260 });
    fireEvent.change(await screen.findByLabelText("Wall length (mm)"), {
      target: { value: "4200" }
    });
    await waitFor(() =>
      expect(screen.getByLabelText("Wall length (mm)")).toHaveValue(4200));

    fireEvent.click(screen.getByRole("button", {
      name: /Kitchen and dining/
    }));
    expect(await screen.findByRole("status")).toHaveTextContent(
      /proposal is stale/i
    );
    expect(screen.getByText("1 wall")).toBeInTheDocument();
    expect(screen.queryByLabelText("Wall length (mm)")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", {
      name: "Delete Design Proposal"
    }));
    await waitFor(() => expect(screen.getByText("0 proposals")).toBeInTheDocument());
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(await screen.findByRole("button", {
      name: /Kitchen and dining/
    })).toBeInTheDocument();
  });
});
