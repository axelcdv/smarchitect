import type { EditorMode } from "./editor-types.js";

export interface PlanToolbarProps {
  mode: EditorMode;
  isSaving: boolean;
  hasSelectedWall: boolean;
  wallCount: number;
  roomCount: number;
  openingCount: number;
  furniturePlacementCount: number;
  fixturePlacementCount: number;
  onModeChange(mode: Extract<EditorMode, "draw" | "select" | "label">): void;
  onAddOpening(kind: "door" | "window" | "passage"): void;
  onZoom(factor: number): void;
  onPan(direction: "left" | "right" | "up" | "down"): void;
}

export function PlanToolbar({
  mode,
  isSaving,
  hasSelectedWall,
  wallCount,
  roomCount,
  openingCount,
  furniturePlacementCount,
  fixturePlacementCount,
  onModeChange,
  onAddOpening,
  onZoom,
  onPan
}: PlanToolbarProps) {
  return (
    <div className="plan-toolbar">
      <button disabled={isSaving} className={mode === "draw" ? "tool-active" : ""} type="button" onClick={() => onModeChange("draw")}>Draw wall</button>
      <button disabled={isSaving} className={mode === "select" ? "tool-active" : ""} type="button" onClick={() => onModeChange("select")}>Select</button>
      <button disabled={isSaving} className={mode === "label" ? "tool-active" : ""} type="button" onClick={() => onModeChange("label")}>Add room label</button>
      <span className="plan-count">
        <span>{`${wallCount} ${wallCount === 1 ? "wall" : "walls"}`}</span>
        {" · "}
        <span>{`${roomCount} ${roomCount === 1 ? "room" : "rooms"}`}</span>
      </span>
      <button disabled={isSaving || !hasSelectedWall} type="button" onClick={() => onAddOpening("door")}>Add door</button>
      <button disabled={isSaving || !hasSelectedWall} type="button" onClick={() => onAddOpening("window")}>Add window</button>
      <button disabled={isSaving || !hasSelectedWall} type="button" onClick={() => onAddOpening("passage")}>Add passage</button>
      <span>{openingCount} {openingCount === 1 ? "opening" : "openings"}</span>
      <span>
        {`${furniturePlacementCount} Furniture ${furniturePlacementCount === 1 ? "Placement" : "Placements"}`}
      </span>
      <span>
        {`${fixturePlacementCount} Fixture ${fixturePlacementCount === 1 ? "Placement" : "Placements"}`}
      </span>
      <button type="button" aria-label="Zoom in" onClick={() => onZoom(.8)}>+</button>
      <button type="button" aria-label="Zoom out" onClick={() => onZoom(1.25)}>−</button>
      <button type="button" aria-label="Pan left" onClick={() => onPan("left")}>←</button>
      <button type="button" aria-label="Pan right" onClick={() => onPan("right")}>→</button>
      <button type="button" aria-label="Pan up" onClick={() => onPan("up")}>↑</button>
      <button type="button" aria-label="Pan down" onClick={() => onPan("down")}>↓</button>
    </div>
  );
}
