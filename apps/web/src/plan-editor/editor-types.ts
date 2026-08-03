import type { PointMm } from "@smarchitect/core";

export type EditorMode = "draw" | "select" | "label" | "placeItem";

export interface PlanCanvasView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export type PlacingItem = {
  kind: "furniture" | "fixture";
  definitionId: string;
};

export type PlanGesture =
  | { kind: "draw"; start: PointMm; current?: PointMm }
  | { kind: "move"; wallId: string; start: PointMm; current?: PointMm }
  | { kind: "endpoint"; wallId: string; endpoint: "start" | "end" }
  | { kind: "add-label" }
  | { kind: "move-label"; labelId: string; start: PointMm }
  | {
      kind: "opening";
      openingId: string;
      start: PointMm;
      startPositionMm: number;
    }
  | { kind: "furnitureMove"; placementId: string; start: PointMm }
  | { kind: "fixtureMove"; placementId: string; start: PointMm };
