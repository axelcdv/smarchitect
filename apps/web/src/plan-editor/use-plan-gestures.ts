import {
  distanceAlongWallPath,
  exceedsWallDragThreshold,
  findRoomLabelAtPoint,
  findWallAtPoint,
  findWallEndpointAtPoint,
  furniturePlacementContainsPoint,
  snapAngle,
  snapPoint,
  wallPathLength,
  type FixtureDefinition,
  type FurnitureDefinition,
  type FurniturePlacement,
  type Opening,
  type PointMm,
  type ProjectWorkspace,
  type Wall,
  type WallUpdate
} from "@smarchitect/core";
import {
  useState,
  type PointerEvent,
  type WheelEvent
} from "react";
import type {
  EditorMode,
  PlanCanvasView,
  PlanGesture,
  PlacingItem
} from "./editor-types.js";
import { moveWallForDrag } from "./plan-geometry.js";

const INITIAL_VIEW: PlanCanvasView = {
  x: -4000,
  y: -2600,
  width: 8000,
  height: 5200
};

function findPlacementAtPoint<
  Definition extends FurnitureDefinition,
  Placement extends FurniturePlacement
>(
  definitions: readonly Definition[] | undefined,
  placements: readonly Placement[],
  point: PointMm
): Placement | undefined {
  return [...placements].reverse().find((placement) => {
    const definition = definitions?.find(
      ({ id }) => id === placement.definitionId
    );
    return definition
      ? furniturePlacementContainsPoint(definition, placement, point)
      : false;
  });
}

function snappedDrawEnd(
  start: PointMm,
  point: PointMm,
  walls: Wall[],
  snapToleranceMm: number
): PointMm {
  const exactSnap = snapPoint(point, walls, snapToleranceMm);
  return exactSnap.x !== point.x || exactSnap.y !== point.y
    ? exactSnap
    : snapAngle(start, point);
}

export function movedPlacement<
  Placement extends FurniturePlacement
>(
  placements: readonly Placement[],
  placementId: string,
  start: PointMm,
  end: PointMm
): Pick<Placement, "id"> & { position: PointMm } | undefined {
  const placement = placements.find(({ id }) => id === placementId);
  return placement
    ? {
      id: placement.id,
      position: {
        x: placement.position.x + end.x - start.x,
        y: placement.position.y + end.y - start.y
      }
    }
    : undefined;
}

export interface PlanGestureCommands {
  commit(next: ProjectWorkspace): Promise<ProjectWorkspace | undefined>;
  attemptWallUpdate(wallId: string, update: WallUpdate): Promise<void>;
  isTransitionPending(): boolean;
  selectWall(wallId?: string): void;
  selectOpening(openingId: string, hostWallId: string): void;
  selectRoomLabel(roomLabelId: string): void;
  selectFurniture(placementId: string): void;
  selectFixture(placementId: string): void;
}

export interface UsePlanGesturesOptions extends PlanGestureCommands {
  workspace?: ProjectWorkspace;
  selectedWall?: Wall;
  furnitureLibrary: readonly FurnitureDefinition[];
  fixtureLibrary: readonly FixtureDefinition[];
}

export function clientPoint(
  svg: SVGSVGElement,
  clientX: number,
  clientY: number,
  view: PlanCanvasView
): PointMm {
  const bounds = svg.getBoundingClientRect();
  return {
    x: Math.round(view.x + (clientX - bounds.left) / bounds.width * view.width),
    y: Math.round(-(view.y
      + (clientY - bounds.top) / bounds.height * view.height))
  };
}

export function usePlanGestures({
  workspace,
  selectedWall,
  furnitureLibrary,
  fixtureLibrary,
  commit,
  attemptWallUpdate,
  isTransitionPending,
  selectWall,
  selectOpening,
  selectRoomLabel,
  selectFurniture,
  selectFixture
}: UsePlanGesturesOptions) {
  const [mode, setMode] = useState<EditorMode>("draw");
  const [view, setView] = useState<PlanCanvasView>(INITIAL_VIEW);
  const [gesture, setGesture] = useState<PlanGesture>();
  const [placingItem, setPlacingItem] = useState<PlacingItem>();
  const activePlan = workspace?.activePlan;
  const activeLevel = workspace?.activeLevel;
  const walls = activeLevel?.walls ?? [];
  const roomLabels = activeLevel?.roomLabels ?? [];
  const openings = activeLevel?.openings ?? [];
  const furniturePlacements = activeLevel?.furniturePlacements ?? [];
  const fixturePlacements = activeLevel?.fixturePlacements ?? [];
  const previewWorkspace = workspace
    && gesture?.kind === "move"
    && gesture.current
    ? moveWallForDrag(
      workspace,
      gesture.wallId,
      gesture.start,
      gesture.current,
      view.width / 80
    )
    : workspace;
  const wallPreview = workspace
    && gesture?.kind === "draw"
    && gesture.current
    ? (() => {
      const end = snappedDrawEnd(
        gesture.start,
        gesture.current,
        walls,
        view.width / 80
      );
      return end.x !== gesture.start.x || end.y !== gesture.start.y
        ? {
          id: "wall-preview",
          path: { kind: "straight" as const, start: gesture.start, end },
          thicknessMm: 150,
          heightMm: workspace.activeLevel.defaultWallHeightMm,
          extensions: {}
        }
        : undefined;
    })()
    : undefined;

  function eventPoint(event: PointerEvent<SVGSVGElement>): PointMm {
    return clientPoint(
      event.currentTarget,
      event.clientX,
      event.clientY,
      view
    );
  }

  async function beginPlanGesture(
    event: PointerEvent<SVGSVGElement>
  ): Promise<void> {
    if (isTransitionPending()) return;
    const point = eventPoint(event);
    const snapTolerance = view.width / 80;
    if (mode === "placeItem") {
      if (!workspace || !placingItem) return;
      const next = placingItem.kind === "furniture"
        ? (() => {
          const definition = furnitureLibrary.find(
            ({ id }) => id === placingItem.definitionId
          );
          return definition
            ? workspace.placeFurniture(definition, { position: point })
            : undefined;
        })()
        : (() => {
          const definition = fixtureLibrary.find(
            ({ id }) => id === placingItem.definitionId
          );
          return definition
            ? workspace.placeFixture(definition, { position: point })
            : undefined;
        })();
      if (!next) return;
      const durable = await commit(next);
      if (durable) {
        if (placingItem.kind === "furniture") {
          const placementId =
            durable.activeLevel.furniturePlacements?.at(-1)?.id;
          if (placementId) selectFurniture(placementId);
        } else {
          const placementId =
            durable.activeLevel.fixturePlacements?.at(-1)?.id;
          if (placementId) selectFixture(placementId);
        }
        setMode("select");
        setPlacingItem(undefined);
      }
      return;
    }
    if (mode === "draw") {
      setGesture({
        kind: "draw",
        start: snapPoint(point, walls, snapTolerance)
      });
      return;
    }
    if (mode === "label") {
      setGesture({ kind: "add-label" });
      return;
    }

    const label = findRoomLabelAtPoint(point, roomLabels, view.width / 80);
    if (label) {
      selectRoomLabel(label.id);
      setGesture({ kind: "move-label", labelId: label.id, start: point });
      return;
    }

    const fixture = findPlacementAtPoint(
      activePlan?.fixtureDefinitions,
      fixturePlacements,
      point
    );
    if (fixture) {
      selectFixture(fixture.id);
      setGesture({
        kind: "fixtureMove",
        placementId: fixture.id,
        start: point
      });
      return;
    }

    const furniture = findPlacementAtPoint(
      activePlan?.furnitureDefinitions,
      furniturePlacements,
      point
    );
    if (furniture) {
      selectFurniture(furniture.id);
      setGesture({
        kind: "furnitureMove",
        placementId: furniture.id,
        start: point
      });
      return;
    }

    const endpointHit = selectedWall
      ? findWallEndpointAtPoint(point, [selectedWall], view.width / 160)
      : undefined;
    if (endpointHit) {
      setGesture({
        kind: "endpoint",
        wallId: endpointHit.wallId,
        endpoint: endpointHit.endpoint
      });
      return;
    }

    const wall = findWallAtPoint(point, walls, view.width / 400);
    selectWall(wall?.id);
    if (wall) {
      setGesture({ kind: "move", wallId: wall.id, start: point });
    }
  }

  async function finishPlanGesture(
    event: PointerEvent<SVGSVGElement>
  ): Promise<void> {
    if (!workspace || !gesture || isTransitionPending()) return;
    const point = eventPoint(event);
    if (gesture.kind === "add-label") {
      const next = workspace.addRoomLabel({
        name: `Room ${roomLabels.length + 1}`,
        position: point
      });
      const durable = await commit(next);
      if (durable) {
        const roomLabelId = durable.activeLevel.roomLabels.at(-1)?.id;
        if (roomLabelId) selectRoomLabel(roomLabelId);
        setMode("select");
      }
    } else if (gesture.kind === "draw") {
      const snapped = snappedDrawEnd(
        gesture.start,
        point,
        walls,
        view.width / 80
      );
      if (snapped.x !== gesture.start.x || snapped.y !== gesture.start.y) {
        const next = workspace.addWall({ start: gesture.start, end: snapped });
        const durable = await commit(next);
        if (durable) {
          const wallId = durable.activeLevel.walls.at(-1)?.id;
          if (wallId) selectWall(wallId);
          setMode("select");
        }
      }
    } else if (gesture.kind === "move") {
      const wall = walls.find(({ id }) => id === gesture.wallId);
      const movedFarEnough = gesture.current !== undefined
        || exceedsWallDragThreshold(
          gesture.start,
          point,
          view.width / 200
        );
      if (wall && movedFarEnough) {
        const next = moveWallForDrag(
          workspace,
          gesture.wallId,
          gesture.start,
          point,
          view.width / 80
        );
        if (next !== workspace) await commit(next);
      }
    } else if (gesture.kind === "endpoint") {
      const wall = walls.find(({ id }) => id === gesture.wallId);
      if (wall) {
        const other = gesture.endpoint === "start"
          ? wall.path.end
          : wall.path.start;
        const candidates = walls.filter(({ id }) => id !== wall.id);
        const snapped = snapPoint(point, candidates, view.width / 80);
        const hasExactSnap = snapped.x !== point.x || snapped.y !== point.y;
        await attemptWallUpdate(wall.id, {
          [gesture.endpoint]: hasExactSnap
            ? snapped
            : snapAngle(other, point)
        });
      }
    } else if (gesture.kind === "opening") {
      const opening = openings.find(({ id }) => id === gesture.openingId);
      const wall = opening
        ? walls.find(({ id }) => id === opening.hostWallId)
        : undefined;
      if (opening && wall) {
        const pointerDelta = distanceAlongWallPath(wall, point)
          - distanceAlongWallPath(wall, gesture.start);
        const nextPosition = Math.max(
          0,
          Math.min(
            wallPathLength(wall) - opening.widthMm,
            Math.round(gesture.startPositionMm + pointerDelta)
          )
        );
        await commit(workspace.updateOpening(opening.id, {
          positionMm: nextPosition
        }));
      }
    } else if (gesture.kind === "furnitureMove") {
      const placement = movedPlacement(
        furniturePlacements,
        gesture.placementId,
        gesture.start,
        point
      );
      if (placement) {
        await commit(workspace.updateFurniturePlacement(placement.id, {
          position: placement.position
        }));
      }
    } else if (gesture.kind === "move-label") {
      await commit(workspace.moveRoomLabel(gesture.labelId, {
        x: point.x - gesture.start.x,
        y: point.y - gesture.start.y
      }));
    } else {
      const placement = movedPlacement(
        fixturePlacements,
        gesture.placementId,
        gesture.start,
        point
      );
      if (placement) {
        await commit(workspace.updateFixturePlacement(placement.id, {
          position: placement.position
        }));
      }
    }
    setGesture(undefined);
  }

  function previewPlanGesture(
    event: PointerEvent<SVGSVGElement>
  ): void {
    if (gesture?.kind === "draw") {
      setGesture({ ...gesture, current: eventPoint(event) });
      return;
    }
    if (gesture?.kind !== "move") return;
    const point = eventPoint(event);
    if (
      !gesture.current
      && !exceedsWallDragThreshold(
        gesture.start,
        point,
        view.width / 200
      )
    ) {
      return;
    }
    setGesture({ ...gesture, current: point });
  }

  function beginOpeningGesture(
    event: PointerEvent<SVGGElement>,
    opening: Opening
  ): void {
    if (isTransitionPending()) return;
    const svg = event.currentTarget.ownerSVGElement;
    if (!svg) return;
    event.stopPropagation();
    selectOpening(opening.id, opening.hostWallId);
    setMode("select");
    setGesture({
      kind: "opening",
      openingId: opening.id,
      start: clientPoint(svg, event.clientX, event.clientY, view),
      startPositionMm: opening.positionMm
    });
  }

  function beginItemPlacement(item: PlacingItem): void {
    setPlacingItem(item);
    setMode("placeItem");
  }

  function resetInteraction(): void {
    setGesture(undefined);
    setPlacingItem(undefined);
    setMode("select");
  }

  function zoom(factor: number): void {
    setView((current) => ({
      ...current,
      width: current.width * factor,
      height: current.height * factor
    }));
  }

  function pan(direction: "left" | "right" | "up" | "down"): void {
    setView((current) => {
      if (direction === "left") {
        return { ...current, x: current.x - current.width / 10 };
      }
      if (direction === "right") {
        return { ...current, x: current.x + current.width / 10 };
      }
      if (direction === "up") {
        return { ...current, y: current.y - current.height / 10 };
      }
      return { ...current, y: current.y + current.height / 10 };
    });
  }

  function handleWheel(event: WheelEvent<SVGSVGElement>): void {
    event.preventDefault();
    zoom(event.deltaY > 0 ? 1.1 : .9);
  }

  return {
    mode,
    setMode,
    view,
    previewWorkspace,
    wallPreview,
    beginItemPlacement,
    resetInteraction,
    zoom,
    pan,
    beginPlanGesture,
    previewPlanGesture,
    finishPlanGesture,
    cancelPlanGesture: () => setGesture(undefined),
    handleWheel,
    beginOpeningGesture
  };
}
