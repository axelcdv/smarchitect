import {
  deriveWallDragDelta,
  deriveWallFaces,
  deriveWallJunctions,
  exceedsWallDragThreshold,
  findRoomLabelAtPoint,
  distanceAlongWallPath,
  findWallAtPoint,
  findWallEndpointAtPoint,
  furnitureFootprintCorners,
  furniturePlacementContainsPoint,
  ProjectValidationError,
  ProjectWorkspace,
  snapAngle,
  snapPoint,
  wallPathLength,
  type Opening,
  type OpeningUpdate,
  type PointMm,
  type RoomLabel,
  type FixtureDefinitionUpdate,
  type FixturePlacementUpdate,
  type FurnitureDefinitionUpdate,
  type FurniturePlacementUpdate,
  type Wall,
  type WallUpdate
} from "@smarchitect/core";
import {
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
  type WheelEvent
} from "react";
import { useAutosavedProject } from "./use-autosaved-project.js";
import { useItemLibrary } from "./use-item-library.js";
import {
  createDefaultOpeningInput,
  OpeningSymbol
} from "./OpeningEditor.js";
import { ProjectDocumentPanel } from "./project/ProjectDocumentPanel.js";
import { ProjectSidebar } from "./project/ProjectSidebar.js";
import { WelcomeScreen } from "./project/WelcomeScreen.js";
import { WorkspaceHeader } from "./project/WorkspaceHeader.js";
import type { OpeningConflict } from "./plan-editor/OpeningConflictPanel.js";
import {
  SelectionInspector
} from "./plan-editor/SelectionInspector.js";
import { useEditorSelection } from "./plan-editor/use-editor-selection.js";
import type {
  RoomLabelEditField
} from "./plan-editor/RoomLabelInspector.js";
import type { WallEditField } from "./plan-editor/WallInspector.js";
import "./styles.css";

function wallPolygonPoints(wall: Wall): string {
  return deriveWallFaces(wall)
    .map(({ x, y }) => `${x},${-y}`)
    .join(" ");
}

function moveWallForDrag(
  workspace: ProjectWorkspace,
  wallId: string,
  start: PointMm,
  current: PointMm,
  snapToleranceMm: number
): ProjectWorkspace {
  const wall = workspace.activeLevel.walls.find(({ id }) => id === wallId);
  if (!wall) return workspace;
  const delta = deriveWallDragDelta(
    wall,
    start,
    current,
    workspace.activeLevel.walls.filter(({ id }) => id !== wall.id),
    snapToleranceMm
  );
  return delta.x || delta.y ? workspace.moveWall(wall.id, delta) : workspace;
}

export function App() {
  const [draftName, setDraftName] = useState("");
  const [proposalName, setProposalName] = useState("");
  const [operationError, setOperationError] = useState("");
  const [openingConflict, setOpeningConflict] = useState<OpeningConflict>();
  const [placingItem, setPlacingItem] = useState<{
    kind: "furniture" | "fixture";
    definitionId: string;
  }>();
  const library = useItemLibrary(setOperationError);
  const [mode, setMode] = useState<
    "draw" | "select" | "label" | "placeItem"
  >("draw");
  const [view, setView] = useState({ x: -4000, y: -2600, width: 8000, height: 5200 });
  const [gesture, setGesture] = useState<
    | { kind: "draw"; start: PointMm }
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
    | { kind: "fixtureMove"; placementId: string; start: PointMm }
  >();
  const importInput = useRef<HTMLInputElement>(null);
  const autosavedProject = useAutosavedProject();
  const {
    workspace,
    yaml,
    persistenceError,
    isSaving,
    canUndo,
    canRedo,
    isTransitionPending
  } = autosavedProject;
  const error = persistenceError || operationError;
  const document = workspace?.document;
  const activePlan = workspace?.activePlan;
  const activeLevel = workspace?.activeLevel;
  const activeProposal = workspace?.activeDesignProposal;
  const proposalStaleness = workspace?.activeProposalStaleness;
  const diagnostics = workspace?.diagnostics ?? [];
  const walls = activeLevel?.walls ?? [];
  const roomLabels = activeLevel?.roomLabels ?? [];
  const previewWorkspace = workspace && gesture?.kind === "move" && gesture.current
    ? moveWallForDrag(
        workspace,
        gesture.wallId,
        gesture.start,
        gesture.current,
        view.width / 80
      )
    : workspace;
  const displayedWalls = previewWorkspace?.activeLevel.walls ?? walls;
  const rooms = previewWorkspace?.rooms ?? workspace?.rooms ?? [];
  const openings = activeLevel?.openings ?? [];
  const furniturePlacements = activeLevel?.furniturePlacements ?? [];
  const fixturePlacements = activeLevel?.fixturePlacements ?? [];
  const {
    selection,
    wall: selectedWall,
    opening: selectedOpening,
    roomLabel: selectedRoomLabel,
    furniture: selectedFurniture,
    fixture: selectedFixture,
    clearSelection,
    selectWall,
    selectOpening,
    selectRoomLabel,
    selectFurniture,
    selectFixture
  } = useEditorSelection({
    walls,
    openings,
    roomLabels,
    furniturePlacements,
    fixturePlacements
  });
  const displayedSelectedWall = displayedWalls.find(
    ({ id }) => id === selectedWall?.id
  );
  const selectedFurnitureDefinition = activePlan?.furnitureDefinitions?.find(
    ({ id }) => id === selectedFurniture?.definitionId
  );
  const selectedLibraryDefinition = library.furnitureDefinitions.find(
    ({ id }) => id === selectedFurnitureDefinition?.id
  );
  const selectedFixtureDefinition = activePlan?.fixtureDefinitions?.find(
    ({ id }) => id === selectedFixture?.definitionId
  );
  const selectedFixtureLibraryDefinition = library.fixtureDefinitions.find(
    ({ id }) => id === selectedFixtureDefinition?.id
  );

  async function commit(next: ProjectWorkspace): Promise<ProjectWorkspace | undefined> {
    const durable = await autosavedProject.commit(next);
    if (durable) setOperationError("");
    return durable;
  }

  async function startAutosave(next: ProjectWorkspace): Promise<boolean> {
    const started = await autosavedProject.startAutosave(next);
    if (started) setOperationError("");
    return started;
  }

  async function navigateHistory(direction: "undo" | "redo"): Promise<void> {
    const restored = await autosavedProject.navigateHistory(direction);
    if (restored) {
      clearPlanSelection();
      setOperationError("");
    }
  }

  function clearPlanSelection(): void {
    clearSelection();
    setOpeningConflict(undefined);
    setPlacingItem(undefined);
    setMode("select");
  }

  async function changeActivePlan(next: ProjectWorkspace): Promise<void> {
    if (await commit(next)) clearPlanSelection();
  }

  function clientPoint(svg: SVGSVGElement, clientX: number, clientY: number): PointMm {
    const bounds = svg.getBoundingClientRect();
    return {
      x: Math.round(view.x + (clientX - bounds.left) / bounds.width * view.width),
      y: Math.round(-(view.y + (clientY - bounds.top) / bounds.height * view.height))
    };
  }

  function eventPoint(event: PointerEvent<SVGSVGElement>): PointMm {
    return clientPoint(event.currentTarget, event.clientX, event.clientY);
  }

  async function beginPlanGesture(event: PointerEvent<SVGSVGElement>): Promise<void> {
    if (isTransitionPending()) return;
    const point = eventPoint(event);
    const snapTolerance = view.width / 80;
    if (mode === "placeItem") {
      if (!workspace || !placingItem) return;
      const definition = placingItem.kind === "furniture"
        ? library.furnitureDefinitions.find(({ id }) =>
          id === placingItem.definitionId)
        : library.fixtureDefinitions.find(({ id }) =>
          id === placingItem.definitionId);
      if (!definition) return;
      const next = placingItem.kind === "furniture"
        ? workspace.placeFurniture(definition, { position: point })
        : workspace.placeFixture(definition, { position: point });
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
      setGesture({ kind: "draw", start: snapPoint(point, walls, snapTolerance) });
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

    const fixture = [...fixturePlacements].reverse().find((placement) => {
      const definition = activePlan?.fixtureDefinitions?.find(
        ({ id }) => id === placement.definitionId
      );
      return definition
        ? furniturePlacementContainsPoint(definition, placement, point)
        : false;
    });
    if (fixture) {
      selectFixture(fixture.id);
      setGesture({
        kind: "fixtureMove",
        placementId: fixture.id,
        start: point
      });
      return;
    }

    const furniture = [...furniturePlacements].reverse().find((placement) => {
      const definition = activePlan?.furnitureDefinitions?.find(
        ({ id }) => id === placement.definitionId
      );
      return definition
        ? furniturePlacementContainsPoint(definition, placement, point)
        : false;
    });
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

  async function finishPlanGesture(event: PointerEvent<SVGSVGElement>): Promise<void> {
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
      const exactSnap = snapPoint(point, walls, view.width / 80);
      const snapped = exactSnap.x !== point.x || exactSnap.y !== point.y
        ? exactSnap
        : snapAngle(gesture.start, point);
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
        const other = gesture.endpoint === "start" ? wall.path.end : wall.path.start;
        const candidates = walls.filter(({ id }) => id !== wall.id);
        const snapped = snapPoint(point, candidates, view.width / 80);
        const hasExactSnap = snapped.x !== point.x || snapped.y !== point.y;
        await attemptWallUpdate(wall.id, {
          [gesture.endpoint]: hasExactSnap ? snapped : snapAngle(other, point)
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
      const placement = furniturePlacements.find(
        ({ id }) => id === gesture.placementId
      );
      if (placement) {
        await commit(workspace.updateFurniturePlacement(placement.id, {
          position: {
            x: placement.position.x + point.x - gesture.start.x,
            y: placement.position.y + point.y - gesture.start.y
          }
        }));
      }
    } else if (gesture.kind === "move-label") {
      await commit(workspace.moveRoomLabel(gesture.labelId, {
        x: point.x - gesture.start.x,
        y: point.y - gesture.start.y
      }));
    } else {
      const placement = fixturePlacements.find(
        ({ id }) => id === gesture.placementId
      );
      if (placement) {
        await commit(workspace.updateFixturePlacement(placement.id, {
          position: {
            x: placement.position.x + point.x - gesture.start.x,
            y: placement.position.y + point.y - gesture.start.y
          }
        }));
      }
    }
    setGesture(undefined);
  }

  function previewPlanGesture(event: PointerEvent<SVGSVGElement>): void {
    if (gesture?.kind !== "move") return;
    const point = eventPoint(event);
    if (
      !gesture.current
      && !exceedsWallDragThreshold(gesture.start, point, view.width / 200)
    ) {
      return;
    }
    setGesture({ ...gesture, current: point });
  }

  async function editFurniturePlacement(
    update: FurniturePlacementUpdate
  ): Promise<void> {
    if (!workspace || !selectedFurniture) return;
    await commit(workspace.updateFurniturePlacement(selectedFurniture.id, update));
  }

  async function editEmbeddedDefinition(
    update: FurnitureDefinitionUpdate
  ): Promise<void> {
    if (!workspace || !selectedFurnitureDefinition) return;
    await commit(workspace.updateFurnitureDefinition(
      selectedFurnitureDefinition.id,
      update
    ));
  }

  async function editFixturePlacement(
    update: FixturePlacementUpdate
  ): Promise<void> {
    if (!workspace || !selectedFixture) return;
    await commit(workspace.updateFixturePlacement(selectedFixture.id, update));
  }

  async function editEmbeddedFixtureDefinition(
    update: FixtureDefinitionUpdate
  ): Promise<void> {
    if (!workspace || !selectedFixtureDefinition) return;
    await commit(workspace.updateFixtureDefinition(
      selectedFixtureDefinition.id,
      update
    ));
  }

  async function editSelected(field: WallEditField, value: string): Promise<void> {
    if (!workspace || !selectedWall || !value) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const update = field === "startX" ? { start: { ...selectedWall.path.start, x: Math.round(numeric) } }
      : field === "startY" ? { start: { ...selectedWall.path.start, y: Math.round(numeric) } }
      : field === "endX" ? { end: { ...selectedWall.path.end, x: Math.round(numeric) } }
      : field === "endY" ? { end: { ...selectedWall.path.end, y: Math.round(numeric) } }
      : { [field]: field === "angleDeg" ? numeric : Math.round(numeric) };
    await attemptWallUpdate(selectedWall.id, update);
  }

  async function attemptWallUpdate(wallId: string, update: WallUpdate): Promise<void> {
    if (!workspace) return;
    try {
      const durable = await commit(workspace.updateWall(wallId, update));
      if (durable) setOpeningConflict(undefined);
    } catch (cause) {
      if (cause instanceof ProjectValidationError) {
        const openingIds = cause.diagnostics.flatMap(({ path }) => {
          const match =
            /^(?:\/designProposals\/\d+)?\/levels\/\d+\/openings\/(\d+)\//
              .exec(path);
          const opening = match ? openings[Number(match[1])] : undefined;
          return opening ? [opening.id] : [];
        });
        if (openingIds.length) {
          setOpeningConflict({
            wallId,
            update,
            openingIds: [...new Set(openingIds)]
          });
          setOperationError(
            "Wall edit conflicts with hosted Openings. Choose an explicit resolution."
          );
          return;
        }
      }
      setOperationError(cause instanceof Error ? cause.message : "Unable to edit Wall.");
    }
  }

  async function resolveOpeningConflict(
    resolution: "fit" | "delete"
  ): Promise<void> {
    if (!workspace || !openingConflict) return;
    const durable = await commit(workspace.updateWallResolvingOpenings(
      openingConflict.wallId,
      openingConflict.update,
      resolution
    ));
    if (durable) setOpeningConflict(undefined);
  }

  async function editOpening(update: OpeningUpdate): Promise<void> {
    if (!workspace || !selectedOpening) return;
    try {
      await commit(workspace.updateOpening(selectedOpening.id, update));
    } catch (cause) {
      setOperationError(cause instanceof ProjectValidationError
        ? cause.diagnostics.map(({ message }) => message).join(" ")
        : cause instanceof Error ? cause.message : "Unable to edit Opening.");
    }
  }

  async function addOpening(kind: Opening["kind"]): Promise<void> {
    if (!workspace || !selectedWall) return;
    try {
      const durable = await commit(workspace.addOpening(
        createDefaultOpeningInput(kind, selectedWall)
      ));
      if (durable) {
        const opening = durable.activeLevel.openings.at(-1);
        if (opening) selectOpening(opening.id, opening.hostWallId);
        setMode("select");
      }
    } catch (cause) {
      setOperationError(cause instanceof ProjectValidationError
        ? cause.diagnostics.map(({ message }) => message).join(" ")
        : cause instanceof Error ? cause.message : "Unable to add Opening.");
    }
  }

  async function editSelectedRoomLabel(
    field: RoomLabelEditField,
    value: string
  ): Promise<void> {
    if (!workspace || !selectedRoomLabel || !value) return;
    if (field === "name") {
      await commit(workspace.updateRoomLabel(selectedRoomLabel.id, { name: value }));
      return;
    }
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    await commit(workspace.updateRoomLabel(selectedRoomLabel.id, {
      position: {
        ...selectedRoomLabel.position,
        [field]: Math.round(numeric)
      }
    }));
  }

  async function createProject(): Promise<void> {
    try {
      const created = ProjectWorkspace.create(draftName);
      await startAutosave(created);
    } catch (cause) {
      setOperationError(cause instanceof Error
        ? cause.message
        : "Unable to create project.");
    }
  }

  async function renameProject(value: string): Promise<void> {
    if (!workspace) {
      return;
    }

    try {
      const renamedWorkspace = workspace.rename(value);
      await commit(renamedWorkspace);
    } catch (cause) {
      setOperationError(cause instanceof Error
        ? cause.message
        : "Unable to rename project.");
    }
  }

  async function importProject(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const imported = ProjectWorkspace.importYaml(await file.text());
      if (await startAutosave(imported)) {
        setDraftName(imported.document.name);
      }
    } catch (cause) {
      if (cause instanceof ProjectValidationError) {
        setOperationError(cause.diagnostics.map(({ message }) => message).join(" "));
      } else {
        setOperationError(cause instanceof Error
          ? cause.message
          : "Unable to import project.");
      }
    } finally {
      event.target.value = "";
    }
  }

  if (!workspace || !document || !activePlan || !activeLevel) {
    return (
      <WelcomeScreen
        draftName={draftName}
        error={error}
        importInputRef={importInput}
        isSaving={isSaving}
        onCreate={() => void createProject()}
        onDraftNameChange={setDraftName}
        onImport={(event) => void importProject(event)}
      />
    );
  }

  return (
    <main className="workspace-shell">
      <WorkspaceHeader
        canRedo={canRedo}
        canUndo={canUndo}
        importInputRef={importInput}
        isDesignProposal={Boolean(activeProposal)}
        isSaving={isSaving}
        onImport={(event) => void importProject(event)}
        onNavigateHistory={(direction) => void navigateHistory(direction)}
        projectName={document.name}
        yaml={yaml}
      />

      <section className="workspace-grid">
        <ProjectSidebar
          activeLevel={activeLevel}
          activeProposal={activeProposal}
          diagnostics={diagnostics}
          document={document}
          error={error}
          isSaving={isSaving}
          library={library}
          onCreateProposal={() => {
            void changeActivePlan(
              workspace.createDesignProposal(proposalName)
            ).then(() => setProposalName(""));
          }}
          onDeleteProposal={() => {
            if (activeProposal) {
              void changeActivePlan(
                workspace.deleteDesignProposal(activeProposal.id)
              );
            }
          }}
          onPlaceItem={(kind, definitionId) => {
            setPlacingItem({ kind, definitionId });
            setMode("placeItem");
          }}
          onProposalNameChange={setProposalName}
          onRenameProject={(value) => void renameProject(value)}
          onRenameProposal={(value) => {
            if (activeProposal) {
              void commit(workspace.renameDesignProposal(
                activeProposal.id,
                value
              ));
            }
          }}
          onSelectExistingState={() =>
            void changeActivePlan(workspace.selectExistingState())}
          onSelectProposal={(proposalId) =>
            void changeActivePlan(workspace.selectDesignProposal(proposalId))}
          proposalName={proposalName}
          proposalStaleness={proposalStaleness}
        />

        <section className="plan-panel" aria-labelledby="plan-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Plan</p>
              <h2 id="plan-title">{activeLevel.name}</h2>
            </div>
            <span className="scale-chip">Metric · millimetres</span>
          </div>
          <div className="plan-toolbar">
            <button disabled={isSaving} className={mode === "draw" ? "tool-active" : ""} type="button" onClick={() => setMode("draw")}>Draw wall</button>
            <button disabled={isSaving} className={mode === "select" ? "tool-active" : ""} type="button" onClick={() => setMode("select")}>Select</button>
            <button disabled={isSaving} className={mode === "label" ? "tool-active" : ""} type="button" onClick={() => setMode("label")}>Add room label</button>
              <span className="plan-count">
                <span>{`${walls.length} ${walls.length === 1 ? "wall" : "walls"}`}</span>
                {" · "}
                <span>{`${rooms.length} ${rooms.length === 1 ? "room" : "rooms"}`}</span>
              </span>
            <button disabled={isSaving || !selectedWall} type="button" onClick={() => void addOpening("door")}>Add door</button>
            <button disabled={isSaving || !selectedWall} type="button" onClick={() => void addOpening("window")}>Add window</button>
            <button disabled={isSaving || !selectedWall} type="button" onClick={() => void addOpening("passage")}>Add passage</button>
            <span>{openings.length} {openings.length === 1 ? "opening" : "openings"}</span>
            <span>
              {`${furniturePlacements.length} Furniture ${furniturePlacements.length === 1 ? "Placement" : "Placements"}`}
            </span>
            <span>
              {`${fixturePlacements.length} Fixture ${fixturePlacements.length === 1 ? "Placement" : "Placements"}`}
            </span>
            <button type="button" aria-label="Zoom in" onClick={() => setView((current) => ({ ...current, width: current.width * .8, height: current.height * .8 }))}>+</button>
            <button type="button" aria-label="Zoom out" onClick={() => setView((current) => ({ ...current, width: current.width * 1.25, height: current.height * 1.25 }))}>−</button>
            <button type="button" aria-label="Pan left" onClick={() => setView((current) => ({ ...current, x: current.x - current.width / 10 }))}>←</button>
            <button type="button" aria-label="Pan right" onClick={() => setView((current) => ({ ...current, x: current.x + current.width / 10 }))}>→</button>
            <button type="button" aria-label="Pan up" onClick={() => setView((current) => ({ ...current, y: current.y - current.height / 10 }))}>↑</button>
            <button type="button" aria-label="Pan down" onClick={() => setView((current) => ({ ...current, y: current.y + current.height / 10 }))}>↓</button>
          </div>
          <svg
            className="wall-plan"
            viewBox={`${view.x} ${view.y} ${view.width} ${view.height}`}
            role="application"
            aria-label={`${activeLevel.name} wall editor`}
            onPointerDown={(event) => void beginPlanGesture(event)}
            onPointerMove={previewPlanGesture}
            onPointerUp={(event) => void finishPlanGesture(event)}
            onPointerCancel={() => setGesture(undefined)}
            onWheel={(event: WheelEvent<SVGSVGElement>) => {
              event.preventDefault();
              const factor = event.deltaY > 0 ? 1.1 : .9;
              setView((current) => ({ ...current, width: current.width * factor, height: current.height * factor }));
            }}
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
            <rect x={view.x} y={view.y} width={view.width} height={view.height} fill="url(#grid)" />
            {rooms.map((room) => (
              <g key={room.id} className="derived-room">
                <polygon points={room.boundary.map(({ x, y }) => `${x},${-y}`).join(" ")} />
                <text
                  x={room.boundary.reduce((sum, { x }) => sum + x, 0) / room.boundary.length}
                  y={-room.boundary.reduce((sum, { y }) => sum + y, 0) / room.boundary.length}
                >
                  {(room.areaMm2 / 1_000_000).toFixed(2)} m² · {room.dimensionsMm.width} × {room.dimensionsMm.depth} mm
                </text>
              </g>
            ))}
            <path
              className="wall-surface"
              d={displayedWalls.map((wall) => {
                const [first, ...rest] = deriveWallFaces(wall);
                return first
                  ? `M ${first.x} ${-first.y} ${rest.map(({ x, y }) => `L ${x} ${-y}`).join(" ")} Z`
                  : "";
              }).join(" ")}
            />
            {furniturePlacements.map((placement) => {
              const definition = activePlan.furnitureDefinitions?.find(
                ({ id }) => id === placement.definitionId
              );
              if (!definition) return null;
              return (
                <polygon
                  key={placement.id}
                  className={placement.id === selectedFurniture?.id
                    ? "furniture-footprint selected-furniture"
                    : "furniture-footprint"}
                  points={furnitureFootprintCorners(definition, placement)
                    .map(({ x, y }) => `${x},${-y}`)
                    .join(" ")}
                />
              );
            })}
            {fixturePlacements.map((placement) => {
              const definition = activePlan.fixtureDefinitions?.find(
                ({ id }) => id === placement.definitionId
              );
              if (!definition) return null;
              return (
                <polygon
                  key={placement.id}
                  className={placement.id === selectedFixture?.id
                    ? "fixture-footprint selected-fixture"
                    : "fixture-footprint"}
                  points={furnitureFootprintCorners(definition, placement)
                    .map(({ x, y }) => `${x},${-y}`)
                    .join(" ")}
                />
              );
            })}
            {displayedSelectedWall ? (
              <polygon
                className="selected-wall"
                points={wallPolygonPoints(displayedSelectedWall)}
              />
            ) : null}
            {openings.map((opening) => {
              const host = displayedWalls.find(({ id }) => id === opening.hostWallId);
              return host ? (
                <OpeningSymbol
                  key={opening.id}
                  opening={opening}
                  wall={host}
                  selected={opening.id === selectedOpening?.id}
                  onPointerDown={(event) => {
                    if (isTransitionPending()) return;
                    const svg = event.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    event.stopPropagation();
                    selectOpening(opening.id, opening.hostWallId);
                    setMode("select");
                    setGesture({
                      kind: "opening",
                      openingId: opening.id,
                      start: clientPoint(svg, event.clientX, event.clientY),
                      startPositionMm: opening.positionMm
                    });
                  }}
                />
              ) : null;
            })}
            {deriveWallJunctions(displayedWalls).map(({ point }) => (
              <circle className="junction" key={`${point.x}:${point.y}`} cx={point.x} cy={-point.y} r={view.width / 220} />
            ))}
            {displayedSelectedWall ? (["start", "end"] as const).map((endpoint) => (
              <circle
                key={endpoint}
                className="endpoint-handle"
                cx={displayedSelectedWall.path[endpoint].x}
                cy={-displayedSelectedWall.path[endpoint].y}
                r={view.width / 160}
              />
            )) : null}
            {roomLabels.map((label: RoomLabel) => (
              <g
                className={label.id === selectedRoomLabel?.id ? "room-label selected-room-label" : "room-label"}
                key={label.id}
              >
                <circle cx={label.position.x} cy={-label.position.y} r={view.width / 100} />
                <text x={label.position.x} y={-label.position.y - view.width / 70}>
                  {label.name}
                </text>
              </g>
            ))}
          </svg>
          <SelectionInspector
            selection={selection}
            wall={{
              wall: selectedWall,
              disabled: isSaving,
              resetKey: operationError,
              onEdit: (field, value) => void editSelected(field, value),
              onDelete: () => {
                if (!selectedWall) return;
                void commit(workspace.deleteWall(selectedWall.id))
                  .then((durable) => {
                    if (durable) clearSelection();
                  });
              }
            }}
            roomLabel={{
              roomLabel: selectedRoomLabel,
              diagnostics,
              disabled: isSaving,
              resetKey: operationError,
              onEdit: (field, value) =>
                void editSelectedRoomLabel(field, value),
              onDelete: () => {
                if (!selectedRoomLabel) return;
                void commit(workspace.deleteRoomLabel(selectedRoomLabel.id))
                  .then((durable) => {
                    if (durable) clearSelection();
                  });
              }
            }}
            opening={{
              opening: selectedOpening,
              conflict: openingConflict,
              openings,
              disabled: isSaving,
              onResolveConflict: (resolution) =>
                void resolveOpeningConflict(resolution),
              onCancelConflict: () => {
                setOpeningConflict(undefined);
                setOperationError("");
              },
              onEdit: (update) => void editOpening(update),
              onDelete: () => {
                if (!selectedOpening) return;
                void commit(workspace.deleteOpening(selectedOpening.id))
                  .then((durable) => {
                    if (durable) selectWall(selectedOpening.hostWallId);
                  });
              }
            }}
            furniture={{
              placement: selectedFurniture,
              definition: selectedFurnitureDefinition,
              libraryDefinition: selectedLibraryDefinition,
              disabled: isSaving || library.isSaving,
              onUpdatePlacement: (update) =>
                void editFurniturePlacement(update),
              onUpdateDefinition: (update) =>
                void editEmbeddedDefinition(update),
              onMakeUnique: () => {
                if (!selectedFurniture) return;
                void commit(
                  workspace.makeFurniturePlacementUnique(selectedFurniture.id)
                );
              },
              onDelete: () => {
                if (!selectedFurniture) return;
                void commit(
                  workspace.deleteFurniturePlacement(selectedFurniture.id)
                ).then((durable) => {
                  if (durable) clearSelection();
                });
              }
            }}
            fixture={{
              placement: selectedFixture,
              definition: selectedFixtureDefinition,
              libraryDefinition: selectedFixtureLibraryDefinition,
              disabled: isSaving || library.isSaving,
              onUpdatePlacement: (update) =>
                void editFixturePlacement(update),
              onUpdateDefinition: (update) =>
                void editEmbeddedFixtureDefinition(update),
              onMakeUnique: () => {
                if (!selectedFixture) return;
                void commit(
                  workspace.makeFixturePlacementUnique(selectedFixture.id)
                );
              },
              onDelete: () => {
                if (!selectedFixture) return;
                void commit(
                  workspace.deleteFixturePlacement(selectedFixture.id)
                ).then((durable) => {
                  if (durable) clearSelection();
                });
              }
            }}
          />
        </section>

        <ProjectDocumentPanel yaml={yaml} />
      </section>
    </main>
  );
}
