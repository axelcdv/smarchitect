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

describe("Items", () => {
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
    setPlanBounds(plan);
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
    setPlanBounds(plan);
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
});
