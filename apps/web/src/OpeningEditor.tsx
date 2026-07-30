import {
  deriveOpeningPlanGeometry,
  wallPathLength,
  type Opening,
  type OpeningInput,
  type OpeningUpdate,
  type Wall
} from "@smarchitect/core";
import type { PointerEvent } from "react";
import { BufferedInput } from "./BufferedInput.js";

type OpeningEditField = "positionMm" | "widthMm" | "heightMm" | "sillHeightMm";
type OperationKind = "fixed" | "hinged" | "sliding";

const OPERATION_OPTIONS: Record<Opening["kind"], OperationKind[]> = {
  door: ["hinged", "sliding"],
  window: ["fixed", "hinged", "sliding"],
  passage: []
};

function defaultOperation(kind: OperationKind): NonNullable<OpeningUpdate["operation"]> {
  return kind === "fixed"
    ? { kind: "fixed" }
    : kind === "hinged"
      ? { kind: "hinged", hingeSide: "start", swingDirection: "inward" }
      : { kind: "sliding", slideDirection: "start" };
}

export function createDefaultOpeningInput(
  kind: Opening["kind"],
  wall: Wall
): OpeningInput {
  const length = wallPathLength(wall);
  const widthMm = Math.min(kind === "passage" ? 1000 : 900, length);
  const positionMm = Math.round((length - widthMm) / 2);
  const heightMm = Math.min(kind === "window" ? 1200 : 2100, wall.heightMm);
  if (kind === "door") {
    return {
      kind,
      hostWallId: wall.id,
      positionMm,
      widthMm,
      heightMm,
      operation: {
        kind: "hinged",
        hingeSide: "start",
        swingDirection: "inward"
      }
    };
  }
  if (kind === "window") {
    return {
      kind,
      hostWallId: wall.id,
      positionMm,
      widthMm,
      heightMm,
      sillHeightMm: Math.max(0, Math.min(900, wall.heightMm - heightMm)),
      operation: defaultOperation("fixed")
    };
  }
  return { kind, hostWallId: wall.id, positionMm, widthMm, heightMm };
}

function Segment({
  segment,
  className
}: {
  segment: { start: { x: number; y: number }; end: { x: number; y: number } };
  className: string;
}) {
  return (
    <line
      className={className}
      x1={segment.start.x}
      y1={-segment.start.y}
      x2={segment.end.x}
      y2={-segment.end.y}
    />
  );
}

export function OpeningSymbol({
  opening,
  wall,
  selected,
  onPointerDown
}: {
  opening: Opening;
  wall: Wall;
  selected: boolean;
  onPointerDown: (event: PointerEvent<SVGGElement>) => void;
}) {
  const geometry = deriveOpeningPlanGeometry(opening, wall);
  const slideArrow = geometry.slideArrow
    ? `M ${geometry.slideArrow.tail.x} ${-geometry.slideArrow.tail.y} L ${geometry.slideArrow.tip.x} ${-geometry.slideArrow.tip.y} M ${geometry.slideArrow.firstWing.x} ${-geometry.slideArrow.firstWing.y} L ${geometry.slideArrow.tip.x} ${-geometry.slideArrow.tip.y} L ${geometry.slideArrow.secondWing.x} ${-geometry.slideArrow.secondWing.y}`
    : undefined;
  return (
    <g
      role="button"
      tabIndex={0}
      aria-label={`${opening.kind[0]!.toUpperCase()}${opening.kind.slice(1)} opening`}
      className={`opening-symbol opening-${opening.kind} opening-${geometry.operationKind}${selected ? " selected-opening" : ""}`}
      data-operation={geometry.operationKind}
      onPointerDown={onPointerDown}
    >
      <line
        className="opening-cut"
        x1={geometry.start.x}
        y1={-geometry.start.y}
        x2={geometry.end.x}
        y2={-geometry.end.y}
        strokeWidth={wall.thicknessMm + 36}
      />
      {geometry.jambs.map((segment, index) => (
        <Segment key={`jamb-${index}`} segment={segment} className="opening-jamb" />
      ))}
      {geometry.panes.map((segment, index) => (
        <Segment key={`pane-${index}`} segment={segment} className={index ? "window-pane window-pane-offset" : "window-pane"} />
      ))}
      {geometry.slidingPanels.map((segment, index) => (
        <Segment key={`panel-${index}`} segment={segment} className="sliding-panel" />
      ))}
      {geometry.hinge && geometry.leafEnd ? (
        <Segment
          segment={{ start: geometry.hinge, end: geometry.leafEnd }}
          className="opening-leaf"
        />
      ) : null}
      {geometry.swingArcStart && geometry.leafEnd ? (
        <path
          className="door-swing"
          d={`M ${geometry.swingArcStart.x} ${-geometry.swingArcStart.y} A ${opening.widthMm} ${opening.widthMm} 0 0 ${geometry.swingClockwise ? 1 : 0} ${geometry.leafEnd.x} ${-geometry.leafEnd.y}`}
        />
      ) : null}
      {slideArrow ? <path className="slide-direction" d={slideArrow} /> : null}
    </g>
  );
}

export function OpeningProperties({
  opening,
  isSaving,
  onEdit,
  onDelete
}: {
  opening: Opening;
  isSaving: boolean;
  onEdit: (update: OpeningUpdate) => void;
  onDelete: () => void;
}) {
  function editNumber(field: OpeningEditField, value: string): void {
    const numeric = Number(value);
    if (!value || !Number.isFinite(numeric)) return;
    onEdit({ [field]: Math.round(numeric) });
  }
  const numericFields: [OpeningEditField, string, number][] = [
    ["positionMm", "Opening position (mm)", opening.positionMm],
    ["widthMm", "Opening width (mm)", opening.widthMm],
    ["heightMm", "Opening height (mm)", opening.heightMm],
    ...(opening.kind === "window"
      ? [["sillHeightMm", "Window sill height (mm)", opening.sillHeightMm] as [OpeningEditField, string, number]]
      : [])
  ];
  const operation = opening.kind === "passage" ? undefined : opening.operation;
  return (
    <div className="opening-properties" aria-label="Selected Opening properties">
      <label><span>Opening type</span><input aria-label="Opening type" readOnly value={opening.kind} /></label>
      <label><span>Host Wall</span><input aria-label="Host Wall" readOnly value={opening.hostWallId} /></label>
      {numericFields.map(([field, label, value]) => (
        <label key={field}>
          <span>{label}</span>
          <BufferedInput
            aria-label={label}
            disabled={isSaving}
            type="number"
            step="1"
            value={value}
            onCommit={(value) => editNumber(field, value)}
          />
        </label>
      ))}
      {operation ? (
        <label>
          <span>{opening.kind === "door" ? "Door operation" : "Window operation"}</span>
          <select
            disabled={isSaving}
            aria-label={opening.kind === "door" ? "Door operation" : "Window operation"}
            value={operation.kind}
            onChange={(event) => onEdit({ operation: defaultOperation(event.target.value as OperationKind) })}
          >
            {OPERATION_OPTIONS[opening.kind].map((kind) => (
              <option key={kind} value={kind}>{kind[0]!.toUpperCase() + kind.slice(1)}</option>
            ))}
          </select>
        </label>
      ) : null}
      {operation?.kind === "hinged" ? (
        <>
          <label>
            <span>Hinge side</span>
            <select disabled={isSaving} aria-label="Hinge side" value={operation.hingeSide} onChange={(event) => onEdit({ operation: { ...operation, hingeSide: event.target.value as "start" | "end" } })}>
              <option value="start">Wall path start</option>
              <option value="end">Wall path end</option>
            </select>
          </label>
          <label>
            <span>Swing direction</span>
            <select disabled={isSaving} aria-label="Swing direction" value={operation.swingDirection} onChange={(event) => onEdit({ operation: { ...operation, swingDirection: event.target.value as "inward" | "outward" } })}>
              <option value="inward">Inward</option>
              <option value="outward">Outward</option>
            </select>
          </label>
        </>
      ) : null}
      {operation?.kind === "sliding" ? (
        <label>
          <span>Slide direction</span>
          <select disabled={isSaving} aria-label="Slide direction" value={operation.slideDirection} onChange={(event) => onEdit({ operation: { ...operation, slideDirection: event.target.value as "start" | "end" } })}>
            <option value="start">Toward Wall path start</option>
            <option value="end">Toward Wall path end</option>
          </select>
        </label>
      ) : null}
      <button type="button" className="danger-button" disabled={isSaving} onClick={onDelete}>Delete opening</button>
    </div>
  );
}
