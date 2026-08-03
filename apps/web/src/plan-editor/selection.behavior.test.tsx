// @vitest-environment jsdom

import {
  fireEvent,
  render,
  screen
} from "@testing-library/react";
import { ProjectWorkspace } from "@smarchitect/core";
import { describe, expect, it } from "vitest";
import { setPlanBounds } from "../test/app-test-setup.js";
import {
  PlanEditorTestHarness
} from "../test/plan-editor-test-harness.js";

describe("Selection", () => {
  it("keeps Opening and Fixture selection mutually exclusive in both orders", async () => {
    const fixture = {
      id: "fixture_definition_00000000-0000-4000-8000-000000000001",
      name: "Radiator",
      widthMm: 1000,
      depthMm: 150,
      heightMm: 600,
      extensions: {}
    };
    let workspace = ProjectWorkspace.create("Exclusive selection").addWall({
      start: { x: -3000, y: 0 },
      end: { x: 0, y: 0 }
    });
    const wallId = workspace.activeLevel.walls[0]!.id;
    workspace = workspace.addOpening({
      kind: "door",
      hostWallId: wallId,
      positionMm: 1050,
      widthMm: 900,
      heightMm: 2100,
      operation: {
        kind: "hinged",
        hingeSide: "start",
        swingDirection: "inward"
      }
    }).placeFixture(fixture, {
      position: { x: 2000, y: 0 }
    });

    render(
      <PlanEditorTestHarness
        fixtureDefinitions={[fixture]}
        initialWorkspace={workspace}
      />
    );
    const plan = screen.getByLabelText("Ground floor wall editor");
    setPlanBounds(plan);
    fireEvent.click(screen.getByRole("button", { name: "Select" }));
    fireEvent.pointerDown(plan, { clientX: 600, clientY: 260 });
    expect(await screen.findByLabelText("Fixture rotation (deg)"))
      .toBeInTheDocument();

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
});
