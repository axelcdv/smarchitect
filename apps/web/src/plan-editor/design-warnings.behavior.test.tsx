// @vitest-environment jsdom

import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  ProjectWorkspace,
  type EntityKind,
  type FurnitureDefinition,
  type IdFactory
} from "@smarchitect/core";
import { PlanEditorTestHarness } from "../test/plan-editor-test-harness.js";
import "../test/app-test-setup.js";

function ids(): IdFactory {
  let sequence = 0;
  return (kind: EntityKind) =>
    `${kind}_00000000-0000-4000-8000-${String(++sequence).padStart(12, "0")}`;
}

describe("Design warnings", () => {
  it("distinguishes advisory guidance and focuses an affected stable entity", () => {
    const definition: FurnitureDefinition = {
      id: "furniture_definition_00000000-0000-4000-8000-000000000100",
      name: "Warning table",
      widthMm: 1000,
      depthMm: 1000,
      heightMm: 750,
      extensions: {}
    };
    const workspace = ProjectWorkspace.create("Warnings", { idFactory: ids() })
      .addWall({ start: { x: 0, y: 0 }, end: { x: 4000, y: 0 } })
      .placeFurniture(definition, { position: { x: 500, y: 0 } });

    render(
      <PlanEditorTestHarness initialWorkspace={workspace} />
    );

    expect(screen.getByRole("heading", { name: "Design warnings" }))
      .toBeInTheDocument();
    expect(screen.getByText(/not professional structural advice/i))
      .toBeInTheDocument();
    expect(screen.getAllByText(new RegExp(
      workspace.activeLevel.furniturePlacements![0]!.id
    )).length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", {
      name: "Focus warning placement.wall-overlap"
    }));
    expect(screen.getByRole("heading", { name: "Warning table" }))
      .toBeInTheDocument();
  });
});
