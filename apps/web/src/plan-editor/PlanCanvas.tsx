import {
  deriveWallJunctions,
  furnitureFootprintCorners,
  type FixtureDefinition,
  type FixturePlacement,
  type FurnitureDefinition,
  type FurniturePlacement,
  type Opening,
  type Room,
  type RoomLabel,
  type Wall
} from "@smarchitect/core";
import type {
  PointerEvent,
  PointerEventHandler,
  WheelEventHandler
} from "react";
import { OpeningSymbol } from "../OpeningEditor.js";
import type { EditorSelection } from "./use-editor-selection.js";
import {
  planPolygonPoints,
  wallPolygonPoints,
  wallSurfacePath
} from "./plan-geometry.js";

export interface PlanCanvasView {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PlanCanvasProps {
  levelName: string;
  view: PlanCanvasView;
  rooms: readonly Room[];
  walls: readonly Wall[];
  openings: readonly Opening[];
  roomLabels: readonly RoomLabel[];
  furnitureDefinitions: readonly FurnitureDefinition[];
  furniturePlacements: readonly FurniturePlacement[];
  fixtureDefinitions: readonly FixtureDefinition[];
  fixturePlacements: readonly FixturePlacement[];
  selection: EditorSelection;
  onPointerDown: PointerEventHandler<SVGSVGElement>;
  onPointerMove: PointerEventHandler<SVGSVGElement>;
  onPointerUp: PointerEventHandler<SVGSVGElement>;
  onPointerCancel: PointerEventHandler<SVGSVGElement>;
  onWheel: WheelEventHandler<SVGSVGElement>;
  onOpeningPointerDown: (
    event: PointerEvent<SVGGElement>,
    opening: Opening
  ) => void;
}

export function PlanCanvas({
  levelName,
  view,
  rooms,
  walls,
  openings,
  roomLabels,
  furnitureDefinitions,
  furniturePlacements,
  fixtureDefinitions,
  fixturePlacements,
  selection,
  onPointerDown,
  onPointerMove,
  onPointerUp,
  onPointerCancel,
  onWheel,
  onOpeningPointerDown
}: PlanCanvasProps) {
  const selectedWallId = selection.kind === "wall"
    ? selection.wallId
    : selection.kind === "opening"
      ? selection.hostWallId
      : undefined;
  const selectedWall = walls.find(({ id }) => id === selectedWallId);
  const selectedOpeningId = selection.kind === "opening"
    ? selection.openingId
    : undefined;
  const selectedRoomLabelId = selection.kind === "roomLabel"
    ? selection.roomLabelId
    : undefined;
  const selectedFurnitureId = selection.kind === "furniture"
    ? selection.placementId
    : undefined;
  const selectedFixtureId = selection.kind === "fixture"
    ? selection.placementId
    : undefined;

  return (
    <svg
      className="wall-plan"
      viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
      role="application"
      aria-label={`${levelName} wall editor`}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={onPointerUp}
      onPointerCancel={onPointerCancel}
      onWheel={onWheel}
    >
      <defs>
        <pattern
          id="grid"
          width="500"
          height="500"
          patternUnits="userSpaceOnUse"
        >
          <path d="M 500 0 L 0 0 0 500" fill="none" />
        </pattern>
      </defs>
      <rect
        x={view.x}
        y={view.y}
        width={view.width}
        height={view.height}
        fill="url(#grid)"
      />
      {rooms.map((room) => (
        <g key={room.id} className="derived-room">
          <polygon points={planPolygonPoints(room.boundary)} />
          <text
            x={room.boundary.reduce((sum, { x }) => sum + x, 0)
              / room.boundary.length}
            y={-room.boundary.reduce((sum, { y }) => sum + y, 0)
              / room.boundary.length}
          >
            {(room.areaMm2 / 1_000_000).toFixed(2)} m² ·{" "}
            {room.dimensionsMm.width} × {room.dimensionsMm.depth} mm
          </text>
        </g>
      ))}
      <path className="wall-surface" d={wallSurfacePath(walls)} />
      {furniturePlacements.map((placement) => {
        const definition = furnitureDefinitions.find(
          ({ id }) => id === placement.definitionId
        );
        if (!definition) return null;
        return (
          <polygon
            key={placement.id}
            className={placement.id === selectedFurnitureId
              ? "furniture-footprint selected-furniture"
              : "furniture-footprint"}
            points={planPolygonPoints(
              furnitureFootprintCorners(definition, placement)
            )}
          />
        );
      })}
      {fixturePlacements.map((placement) => {
        const definition = fixtureDefinitions.find(
          ({ id }) => id === placement.definitionId
        );
        if (!definition) return null;
        return (
          <polygon
            key={placement.id}
            className={placement.id === selectedFixtureId
              ? "fixture-footprint selected-fixture"
              : "fixture-footprint"}
            points={planPolygonPoints(
              furnitureFootprintCorners(definition, placement)
            )}
          />
        );
      })}
      {selectedWall ? (
        <polygon
          className="selected-wall"
          points={wallPolygonPoints(selectedWall)}
        />
      ) : null}
      {openings.map((opening) => {
        const host = walls.find(({ id }) => id === opening.hostWallId);
        return host ? (
          <OpeningSymbol
            key={opening.id}
            opening={opening}
            wall={host}
            selected={opening.id === selectedOpeningId}
            onPointerDown={(event) => onOpeningPointerDown(event, opening)}
          />
        ) : null;
      })}
      {deriveWallJunctions([...walls]).map(({ point }) => (
        <circle
          className="junction"
          key={`${point.x}:${point.y}`}
          cx={point.x}
          cy={-point.y}
          r={view.width / 220}
        />
      ))}
      {selectedWall ? (["start", "end"] as const).map((endpoint) => (
        <circle
          key={endpoint}
          className="endpoint-handle"
          cx={selectedWall.path[endpoint].x}
          cy={-selectedWall.path[endpoint].y}
          r={view.width / 160}
        />
      )) : null}
      {roomLabels.map((label) => (
        <g
          className={label.id === selectedRoomLabelId
            ? "room-label selected-room-label"
            : "room-label"}
          key={label.id}
        >
          <circle
            cx={label.position.x}
            cy={-label.position.y}
            r={view.width / 100}
          />
          <text
            x={label.position.x}
            y={-label.position.y - view.width / 70}
          >
            {label.name}
          </text>
        </g>
      ))}
    </svg>
  );
}
