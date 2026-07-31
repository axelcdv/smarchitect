// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import type {
  FixtureDefinition,
  FixturePlacement,
  FurnitureDefinition,
  FurniturePlacement,
  Opening,
  Room,
  RoomLabel,
  Wall
} from "@smarchitect/core";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PlanCanvas } from "./PlanCanvas.js";

const wall: Wall = {
  id: "wall-1",
  path: {
    kind: "straight",
    start: { x: 0, y: 0 },
    end: { x: 3000, y: 0 }
  },
  thicknessMm: 200,
  heightMm: 2500,
  extensions: {}
};
const room: Room = {
  id: "room-1",
  boundary: [
    { x: 0, y: 0 },
    { x: 3000, y: 0 },
    { x: 3000, y: 2000 },
    { x: 0, y: 2000 }
  ],
  areaMm2: 6_000_000,
  dimensionsMm: { width: 3000, depth: 2000 },
  wallIds: [wall.id],
  labelIds: ["label-1"]
};
const opening: Opening = {
  id: "opening-1",
  kind: "door",
  hostWallId: wall.id,
  positionMm: 1000,
  widthMm: 900,
  heightMm: 2100,
  operation: {
    kind: "hinged",
    hingeSide: "start",
    swingDirection: "inward"
  },
  extensions: {}
};
const roomLabel: RoomLabel = {
  id: "label-1",
  name: "Kitchen",
  position: { x: 1500, y: 1000 },
  extensions: {}
};
const furnitureDefinition: FurnitureDefinition = {
  id: "chair",
  name: "Chair",
  widthMm: 500,
  depthMm: 500,
  heightMm: 800,
  extensions: {}
};
const furniturePlacement: FurniturePlacement = {
  id: "placed-chair",
  definitionId: furnitureDefinition.id,
  position: { x: 500, y: 500 },
  rotationDeg: 0,
  elevationMm: 0,
  extensions: {}
};
const fixtureDefinition: FixtureDefinition = {
  id: "sink",
  name: "Sink",
  widthMm: 600,
  depthMm: 400,
  heightMm: 900,
  extensions: {}
};
const fixturePlacement: FixturePlacement = {
  id: "placed-sink",
  definitionId: fixtureDefinition.id,
  position: { x: 1500, y: 500 },
  rotationDeg: 0,
  elevationMm: 0,
  extensions: {}
};

afterEach(cleanup);

describe("PlanCanvas", () => {
  it("renders plan layers from controlled data with the existing semantics", () => {
    const { container } = render(
      <PlanCanvas
        levelName="Ground floor"
        view={{ x: -1000, y: -1000, width: 5000, height: 4000 }}
        rooms={[room]}
        walls={[wall]}
        openings={[opening]}
        roomLabels={[roomLabel]}
        furnitureDefinitions={[furnitureDefinition]}
        furniturePlacements={[furniturePlacement]}
        fixtureDefinitions={[]}
        fixturePlacements={[]}
        selection={{ kind: "wall", wallId: wall.id }}
        onPointerDown={() => undefined}
        onPointerMove={() => undefined}
        onPointerUp={() => undefined}
        onPointerCancel={() => undefined}
        onWheel={() => undefined}
        onOpeningPointerDown={() => undefined}
      />
    );

    const plan = screen.getByRole("application", {
      name: "Ground floor wall editor"
    });
    expect(plan).toHaveAttribute("viewBox", "-1000 -1000 5000 4000");
    expect(plan).toHaveClass("wall-plan");
    expect(container.querySelector(".derived-room")).toHaveTextContent(
      "6.00 m² · 3000 × 2000 mm"
    );
    expect(container.querySelector(".wall-surface")).toBeInTheDocument();
    expect(container.querySelector(".selected-wall")).toBeInTheDocument();
    expect(container.querySelector(".endpoint-handle")).toBeInTheDocument();
    expect(container.querySelector(".furniture-footprint"))
      .toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Door opening" }))
      .toBeInTheDocument();
    expect(container.querySelector(".room-label")).toHaveTextContent("Kitchen");

    const layerClasses = [...plan.children]
      .map((element) => element.getAttribute("class"))
      .filter(Boolean);
    expect(layerClasses.indexOf("derived-room"))
      .toBeLessThan(layerClasses.indexOf("wall-surface"));
    expect(layerClasses.indexOf("wall-surface"))
      .toBeLessThan(layerClasses.indexOf("selected-wall"));
  });

  it("forwards canvas events and Opening pointer-down as interaction intents", () => {
    const onPointerDown = vi.fn();
    const onWheel = vi.fn();
    const onOpeningPointerDown = vi.fn();
    render(
      <PlanCanvas
        levelName="Ground floor"
        view={{ x: 0, y: 0, width: 5000, height: 4000 }}
        rooms={[]}
        walls={[wall]}
        openings={[opening]}
        roomLabels={[]}
        furnitureDefinitions={[]}
        furniturePlacements={[]}
        fixtureDefinitions={[]}
        fixturePlacements={[]}
        selection={{ kind: "opening", openingId: opening.id, hostWallId: wall.id }}
        onPointerDown={onPointerDown}
        onPointerMove={() => undefined}
        onPointerUp={() => undefined}
        onPointerCancel={() => undefined}
        onWheel={onWheel}
        onOpeningPointerDown={onOpeningPointerDown}
      />
    );

    const plan = screen.getByRole("application");
    fireEvent.pointerDown(plan);
    fireEvent.wheel(plan, { deltaY: 10 });
    fireEvent.pointerDown(screen.getByRole("button", {
      name: "Door opening"
    }));

    expect(onPointerDown).toHaveBeenCalled();
    expect(onWheel).toHaveBeenCalled();
    expect(onOpeningPointerDown).toHaveBeenCalledWith(
      expect.anything(),
      opening
    );
  });

  it("renders furniture and fixture footprint layers independently", () => {
    const { container } = render(
      <PlanCanvas
        levelName="Ground floor"
        view={{ x: 0, y: 0, width: 5000, height: 4000 }}
        rooms={[]}
        walls={[]}
        openings={[]}
        roomLabels={[]}
        furnitureDefinitions={[furnitureDefinition]}
        furniturePlacements={[furniturePlacement]}
        fixtureDefinitions={[fixtureDefinition]}
        fixturePlacements={[fixturePlacement]}
        selection={{ kind: "fixture", placementId: fixturePlacement.id }}
        onPointerDown={() => undefined}
        onPointerMove={() => undefined}
        onPointerUp={() => undefined}
        onPointerCancel={() => undefined}
        onWheel={() => undefined}
        onOpeningPointerDown={() => undefined}
      />
    );

    const furniture = container.querySelector(".furniture-footprint");
    const fixture = container.querySelector(".fixture-footprint");
    expect(furniture).toHaveAttribute(
      "points",
      "250,-250 750,-250 750,-750 250,-750"
    );
    expect(furniture).not.toHaveClass("selected-furniture");
    expect(fixture).toHaveAttribute(
      "points",
      "1200,-300 1800,-300 1800,-700 1200,-700"
    );
    expect(fixture).toHaveClass("selected-fixture");
    expect(furniture?.compareDocumentPosition(fixture!))
      .toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });
});
