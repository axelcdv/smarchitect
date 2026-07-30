import {
  editorSelectionReducer,
  resolveEditorSelection,
  type EditorSelection
} from "./use-editor-selection.js";
import { describe, expect, it } from "vitest";

const walls = [
  {
    id: "wall-1",
    path: {
      kind: "straight" as const,
      start: { x: 0, y: 0 },
      end: { x: 3000, y: 0 }
    },
    thicknessMm: 100,
    heightMm: 2400,
    extensions: {}
  }
];
const openings = [
  {
    id: "opening-1",
    hostWallId: "wall-1",
    kind: "door" as const,
    positionMm: 500,
    widthMm: 900,
    heightMm: 2100,
    operation: {
      kind: "hinged" as const,
      hingeSide: "start" as const,
      swingDirection: "inward" as const
    },
    extensions: {}
  }
];
const roomLabels = [
  {
    id: "label-1",
    name: "Kitchen",
    position: { x: 1000, y: 1000 },
    extensions: {}
  }
];
const furniturePlacements = [
  {
    id: "furniture-1",
    definitionId: "chair",
    position: { x: 500, y: 500 },
    rotationDeg: 0,
    elevationMm: 0,
    extensions: {}
  }
];
const fixturePlacements = [
  {
    id: "fixture-1",
    definitionId: "sink",
    position: { x: 1500, y: 500 },
    rotationDeg: 0,
    elevationMm: 0,
    extensions: {}
  }
];
const entities = {
  walls,
  openings,
  roomLabels,
  furniturePlacements,
  fixturePlacements
};

describe("editorSelectionReducer", () => {
  it.each([
    [
      { type: "selectWall", wallId: "wall-1" },
      { kind: "wall", wallId: "wall-1" }
    ],
    [
      {
        type: "selectOpening",
        openingId: "opening-1",
        hostWallId: "wall-1"
      },
      {
        kind: "opening",
        openingId: "opening-1",
        hostWallId: "wall-1"
      }
    ],
    [
      { type: "selectRoomLabel", roomLabelId: "label-1" },
      { kind: "roomLabel", roomLabelId: "label-1" }
    ],
    [
      { type: "selectFurniture", placementId: "furniture-1" },
      { kind: "furniture", placementId: "furniture-1" }
    ],
    [
      { type: "selectFixture", placementId: "fixture-1" },
      { kind: "fixture", placementId: "fixture-1" }
    ],
    [
      { type: "clear" },
      { kind: "none" }
    ]
  ] as const)("replaces the previous selection for $type", (action, expected) => {
    const previous: EditorSelection = {
      kind: "opening",
      openingId: "another-opening",
      hostWallId: "another-wall"
    };

    expect(editorSelectionReducer(previous, action)).toEqual(expected);
  });

  it("can retain an Opening's host Wall after the Opening is deleted", () => {
    const openingSelection: EditorSelection = {
      kind: "opening",
      openingId: "opening-1",
      hostWallId: "wall-1"
    };

    expect(editorSelectionReducer(openingSelection, {
      type: "selectWall",
      wallId: openingSelection.hostWallId
    })).toEqual({ kind: "wall", wallId: "wall-1" });
  });
});

describe("resolveEditorSelection", () => {
  it("resolves an Opening together with its host Wall", () => {
    expect(resolveEditorSelection({
      kind: "opening",
      openingId: "opening-1",
      hostWallId: "wall-1"
    }, entities)).toMatchObject({
      wall: walls[0],
      opening: openings[0]
    });
  });

  it.each([
    [{ kind: "wall", wallId: "wall-1" }, "wall", walls[0]],
    [{ kind: "roomLabel", roomLabelId: "label-1" }, "roomLabel", roomLabels[0]],
    [
      { kind: "furniture", placementId: "furniture-1" },
      "furniture",
      furniturePlacements[0]
    ],
    [
      { kind: "fixture", placementId: "fixture-1" },
      "fixture",
      fixturePlacements[0]
    ]
  ] as const)("only resolves the selected %s entity", (selection, key, entity) => {
    const resolved = resolveEditorSelection(selection, entities);

    expect(resolved[key]).toBe(entity);
    expect(Object.values(resolved).filter(Boolean)).toEqual([entity]);
  });

  it("returns no selected entities for missing durable IDs", () => {
    expect(resolveEditorSelection({
      kind: "opening",
      openingId: "missing-opening",
      hostWallId: "missing-wall"
    }, entities)).toEqual({});
  });
});
