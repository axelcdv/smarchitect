// @vitest-environment jsdom

import {
  act,
  renderHook
} from "@testing-library/react";
import {
  ProjectWorkspace,
  type FurniturePlacement
} from "@smarchitect/core";
import type { PointerEvent as ReactPointerEvent } from "react";
import { describe, expect, it, vi } from "vitest";
import type { PlanCanvasView } from "./editor-types.js";
import {
  clientPoint,
  movedPlacement,
  usePlanGestures,
  type UsePlanGesturesOptions
} from "./use-plan-gestures.js";

const VIEW: PlanCanvasView = {
  x: -4000,
  y: -2600,
  width: 8000,
  height: 5200
};

function planElement(width = 800, height = 520): SVGSVGElement {
  const svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
  Object.defineProperty(svg, "getBoundingClientRect", {
    value: () => ({
      left: 10,
      top: 20,
      width,
      height,
      right: 10 + width,
      bottom: 20 + height,
      x: 10,
      y: 20,
      toJSON: () => ({})
    })
  });
  return svg;
}

function pointerEvent(
  currentTarget: SVGSVGElement,
  clientX: number,
  clientY: number,
  buttons = 1
): ReactPointerEvent<SVGSVGElement> {
  return { currentTarget, clientX, clientY, buttons, pointerId: 7 } as
    ReactPointerEvent<SVGSVGElement>;
}

function options(
  workspace: ProjectWorkspace,
  overrides: Partial<UsePlanGesturesOptions> = {}
): UsePlanGesturesOptions {
  return {
    workspace,
    furnitureLibrary: [],
    fixtureLibrary: [],
    commit: vi.fn(async (next) => next),
    attemptWallUpdate: vi.fn(async () => undefined),
    isTransitionPending: () => false,
    selectWall: vi.fn(),
    selectOpening: vi.fn(),
    selectRoomLabel: vi.fn(),
    selectFurniture: vi.fn(),
    selectFixture: vi.fn(),
    ...overrides
  };
}

describe("plan gesture transformations", () => {
  it("maps client coordinates into millimetres and inverts the plan Y axis", () => {
    const svg = planElement();

    const centre = clientPoint(svg, 410, 280, VIEW);
    expect(centre.x).toBe(0);
    expect(Math.abs(centre.y)).toBe(0);
    expect(clientPoint(svg, 110, 120, VIEW)).toEqual({
      x: -3000,
      y: 1600
    });
  });

  it("accounts for horizontal letterboxing when mapping pointer coordinates", () => {
    const svg = planElement(1000, 520);

    expect(clientPoint(svg, 210, 120, VIEW)).toEqual({
      x: -3000,
      y: 1600
    });
    const centre = clientPoint(svg, 510, 280, VIEW);
    expect(centre.x).toBe(0);
    expect(Math.abs(centre.y)).toBe(0);
  });

  it("accounts for vertical letterboxing when mapping pointer coordinates", () => {
    const svg = planElement(800, 720);

    expect(clientPoint(svg, 110, 220, VIEW)).toEqual({
      x: -3000,
      y: 1600
    });
    const centre = clientPoint(svg, 410, 380, VIEW);
    expect(centre.x).toBe(0);
    expect(Math.abs(centre.y)).toBe(0);
  });

  it("moves a placement by the pointer delta without mutating its source", () => {
    const placement = {
      id: "furniture_1",
      definitionId: "furniture_definition_1",
      position: { x: 100, y: 200 },
      rotationDeg: 0,
      elevationMm: 0,
      extensions: {}
    } satisfies FurniturePlacement;

    expect(movedPlacement(
      [placement],
      placement.id,
      { x: 20, y: 30 },
      { x: 120, y: -20 }
    )).toEqual({
      id: placement.id,
      position: { x: 200, y: 150 }
    });
    expect(placement.position).toEqual({ x: 100, y: 200 });
    expect(movedPlacement(
      [placement],
      "missing",
      { x: 0, y: 0 },
      { x: 1, y: 1 }
    )).toBeUndefined();
  });
});

describe("usePlanGestures", () => {
  it("draws and commits a snapped wall before returning to select mode", async () => {
    const workspace = ProjectWorkspace.create("Gesture draw");
    const commit = vi.fn(async (next: ProjectWorkspace) => next);
    const selectWall = vi.fn();
    const svg = planElement();
    const { result } = renderHook(() => usePlanGestures(options(workspace, {
      commit,
      selectWall
    })));

    await act(async () => {
      await result.current.beginPlanGesture(pointerEvent(svg, 110, 280));
    });
    act(() => {
      result.current.previewPlanGesture(pointerEvent(svg, 410, 280));
    });

    expect(result.current.wallPreview?.path.kind).toBe("straight");
    expect(result.current.wallPreview?.path.start.x).toBe(-3000);
    expect(Math.abs(result.current.wallPreview?.path.start.y ?? NaN)).toBe(0);
    expect(result.current.wallPreview?.path.end).toEqual({ x: 0, y: 0 });
    const previewPath = result.current.wallPreview?.path;
    expect(commit).not.toHaveBeenCalled();

    await act(async () => {
      await result.current.finishPlanGesture(pointerEvent(svg, 410, 280));
    });

    expect(commit).toHaveBeenCalledOnce();
    const committed = commit.mock.calls[0]![0];
    const path = committed.activeLevel.walls[0]!.path;
    expect(path).toEqual(previewPath);
    expect(path.start.x).toBe(-3000);
    expect(Math.abs(path.start.y)).toBe(0);
    expect(path.end).toEqual({ x: 0, y: 0 });
    expect(selectWall).toHaveBeenCalledWith(
      committed.activeLevel.walls[0]!.id
    );
    expect(result.current.mode).toBe("select");
  });

  it("starts wall previews only after the deliberate-drag threshold", async () => {
    const workspace = ProjectWorkspace.create("Gesture move").addWall({
      start: { x: -3000, y: 0 },
      end: { x: 0, y: 0 }
    });
    const wall = workspace.activeLevel.walls[0]!;
    const svg = planElement();
    const { result } = renderHook(() => usePlanGestures(options(workspace, {
      selectedWall: wall
    })));

    act(() => result.current.setMode("select"));
    await act(async () => {
      await result.current.beginPlanGesture(pointerEvent(svg, 260, 280));
    });
    act(() => {
      result.current.previewPlanGesture(pointerEvent(svg, 262, 280));
    });
    expect(result.current.previewWorkspace).toBe(workspace);

    act(() => {
      result.current.previewPlanGesture(pointerEvent(svg, 360, 230));
    });
    expect(result.current.previewWorkspace).not.toBe(workspace);
    expect(result.current.previewWorkspace?.activeLevel.walls[0]!.path.start)
      .toEqual({ x: -2000, y: 500 });
  });

  it("ends an outside-released draw before the pointer re-enters", async () => {
    const workspace = ProjectWorkspace.create("Outside release");
    const svg = planElement();
    const setPointerCapture = vi.fn();
    const releasePointerCapture = vi.fn();
    Object.assign(svg, { setPointerCapture, releasePointerCapture });
    const { result } = renderHook(() => usePlanGestures(options(workspace)));

    await act(async () => {
      await result.current.beginPlanGesture(pointerEvent(svg, 110, 280));
    });
    act(() => {
      result.current.previewPlanGesture(pointerEvent(svg, 410, 280));
    });
    expect(result.current.wallPreview).toBeDefined();
    expect(setPointerCapture).toHaveBeenCalledWith(7);

    await act(async () => {
      await result.current.finishPlanGesture(pointerEvent(svg, 900, 280, 0));
    });
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(result.current.wallPreview).toBeUndefined();

    act(() => {
      result.current.previewPlanGesture(pointerEvent(svg, 410, 280, 0));
    });
    expect(result.current.wallPreview).toBeUndefined();
  });

  it("cancels a draw on re-entry when the primary button is up", async () => {
    const workspace = ProjectWorkspace.create("Lost outside release");
    const svg = planElement();
    const releasePointerCapture = vi.fn();
    Object.assign(svg, {
      setPointerCapture: vi.fn(),
      releasePointerCapture
    });
    const commit = vi.fn(async (next: ProjectWorkspace) => next);
    const { result } = renderHook(() => usePlanGestures(options(workspace, {
      commit
    })));

    await act(async () => {
      await result.current.beginPlanGesture(pointerEvent(svg, 110, 280));
    });
    act(() => {
      result.current.previewPlanGesture(pointerEvent(svg, 410, 280));
    });
    expect(result.current.wallPreview).toBeDefined();

    act(() => {
      result.current.previewPlanGesture(pointerEvent(svg, 410, 280, 0));
    });
    expect(result.current.wallPreview).toBeUndefined();
    expect(releasePointerCapture).toHaveBeenCalledWith(7);
    expect(commit).not.toHaveBeenCalled();
  });

  it("resets placement state and updates the viewport through public controls", () => {
    const workspace = ProjectWorkspace.create("Gesture controls");
    const { result } = renderHook(() => usePlanGestures(options(workspace)));

    act(() => {
      result.current.beginItemPlacement({
        kind: "furniture",
        definitionId: "furniture_definition_1"
      });
    });
    expect(result.current.mode).toBe("placeItem");

    act(() => {
      result.current.zoom(.5);
      result.current.pan("right");
    });
    expect(result.current.view).toEqual({
      x: -3600,
      y: -2600,
      width: 4000,
      height: 2600
    });

    act(() => result.current.resetInteraction());
    expect(result.current.mode).toBe("select");
  });
});
