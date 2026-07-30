import {
  useCallback,
  useReducer
} from "react";
import type {
  FixturePlacement,
  FurniturePlacement,
  Opening,
  RoomLabel,
  Wall
} from "@smarchitect/core";

export type EditorSelection =
  | { kind: "none" }
  | { kind: "wall"; wallId: string }
  | { kind: "opening"; openingId: string; hostWallId: string }
  | { kind: "roomLabel"; roomLabelId: string }
  | { kind: "furniture"; placementId: string }
  | { kind: "fixture"; placementId: string };

export type EditorSelectionAction =
  | { type: "clear" }
  | { type: "selectWall"; wallId: string }
  | { type: "selectOpening"; openingId: string; hostWallId: string }
  | { type: "selectRoomLabel"; roomLabelId: string }
  | { type: "selectFurniture"; placementId: string }
  | { type: "selectFixture"; placementId: string };

export interface EditorSelectionEntities {
  walls: readonly Wall[];
  openings: readonly Opening[];
  roomLabels: readonly RoomLabel[];
  furniturePlacements: readonly FurniturePlacement[];
  fixturePlacements: readonly FixturePlacement[];
}

export interface ResolvedEditorSelection {
  wall?: Wall;
  opening?: Opening;
  roomLabel?: RoomLabel;
  furniture?: FurniturePlacement;
  fixture?: FixturePlacement;
}

const noSelection: EditorSelection = { kind: "none" };

export function editorSelectionReducer(
  _selection: EditorSelection,
  action: EditorSelectionAction
): EditorSelection {
  switch (action.type) {
    case "clear":
      return noSelection;
    case "selectWall":
      return { kind: "wall", wallId: action.wallId };
    case "selectOpening":
      return {
        kind: "opening",
        openingId: action.openingId,
        hostWallId: action.hostWallId
      };
    case "selectRoomLabel":
      return { kind: "roomLabel", roomLabelId: action.roomLabelId };
    case "selectFurniture":
      return { kind: "furniture", placementId: action.placementId };
    case "selectFixture":
      return { kind: "fixture", placementId: action.placementId };
  }
}

export function resolveEditorSelection(
  selection: EditorSelection,
  entities: EditorSelectionEntities
): ResolvedEditorSelection {
  switch (selection.kind) {
    case "none":
      return {};
    case "wall":
      return {
        wall: entities.walls.find(({ id }) => id === selection.wallId)
      };
    case "opening":
      return {
        wall: entities.walls.find(({ id }) => id === selection.hostWallId),
        opening: entities.openings.find(({ id }) => id === selection.openingId)
      };
    case "roomLabel":
      return {
        roomLabel: entities.roomLabels.find(
          ({ id }) => id === selection.roomLabelId
        )
      };
    case "furniture":
      return {
        furniture: entities.furniturePlacements.find(
          ({ id }) => id === selection.placementId
        )
      };
    case "fixture":
      return {
        fixture: entities.fixturePlacements.find(
          ({ id }) => id === selection.placementId
        )
      };
  }
}

export function useEditorSelection(entities: EditorSelectionEntities) {
  const [selection, dispatch] = useReducer(
    editorSelectionReducer,
    noSelection
  );
  const selectedEntities = resolveEditorSelection(selection, entities);
  const clearSelection = useCallback(() => dispatch({ type: "clear" }), []);
  const selectWall = useCallback((wallId?: string) => {
    dispatch(wallId ? { type: "selectWall", wallId } : { type: "clear" });
  }, []);
  const selectOpening = useCallback((
    openingId: string,
    hostWallId: string
  ) => {
    dispatch({ type: "selectOpening", openingId, hostWallId });
  }, []);
  const selectRoomLabel = useCallback((roomLabelId: string) => {
    dispatch({ type: "selectRoomLabel", roomLabelId });
  }, []);
  const selectFurniture = useCallback((placementId: string) => {
    dispatch({ type: "selectFurniture", placementId });
  }, []);
  const selectFixture = useCallback((placementId: string) => {
    dispatch({ type: "selectFixture", placementId });
  }, []);

  return {
    selection,
    ...selectedEntities,
    clearSelection,
    selectWall,
    selectOpening,
    selectRoomLabel,
    selectFurniture,
    selectFixture
  };
}
