import {
  deriveWallFaces,
  deriveWallJunctions,
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
  snapWallDelta,
  wallAngleDeg,
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
import { PlacementInspector } from "./PlacementInspector.js";
import { ItemLibrary } from "./ItemLibrary.js";
import { useItemLibrary } from "./use-item-library.js";
import {
  createDefaultOpeningInput,
  OpeningProperties,
  OpeningSymbol
} from "./OpeningEditor.js";
import "./styles.css";

type WallEditField =
  | "startX" | "startY" | "endX" | "endY"
  | "lengthMm" | "angleDeg" | "thicknessMm" | "heightMm";
type RoomLabelEditField = "name" | "x" | "y";

function wallPolygonPoints(wall: Wall): string {
  return deriveWallFaces(wall)
    .map(({ x, y }) => `${x},${-y}`)
    .join(" ");
}

function downloadYaml(source: string, projectName: string): void {
  const blob = new Blob([source], { type: "application/yaml" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  const safeName = projectName
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-|-$/g, "");

  anchor.href = url;
  anchor.download = `${safeName || "project"}.yaml`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function App() {
  const [draftName, setDraftName] = useState("");
  const [operationError, setOperationError] = useState("");
  const [selectedWallId, setSelectedWallId] = useState<string>();
  const [selectedRoomLabelId, setSelectedRoomLabelId] = useState<string>();
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>();
  const [openingConflict, setOpeningConflict] = useState<{
    wallId: string;
    update: WallUpdate;
    openingIds: string[];
  }>();
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string>();
  const [selectedFixtureId, setSelectedFixtureId] = useState<string>();
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
    | { kind: "move"; wallId: string; start: PointMm }
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
  const activeLevel = workspace?.activeLevel;
  const diagnostics = workspace?.diagnostics ?? [];
  const walls = activeLevel?.walls ?? [];
  const roomLabels = activeLevel?.roomLabels ?? [];
  const rooms = workspace?.rooms ?? [];
  const selectedRoomLabel = roomLabels.find(({ id }) => id === selectedRoomLabelId);
  const openings = activeLevel?.openings ?? [];
  const selectedWall = walls.find(({ id }) => id === selectedWallId);
  const selectedOpening = openings.find(({ id }) => id === selectedOpeningId);
  const furniturePlacements = activeLevel?.furniturePlacements ?? [];
  const fixturePlacements = activeLevel?.fixturePlacements ?? [];
  const selectedFurniture = furniturePlacements.find(
    ({ id }) => id === selectedFurnitureId
  );
  const selectedFurnitureDefinition = document?.furnitureDefinitions?.find(
    ({ id }) => id === selectedFurniture?.definitionId
  );
  const selectedLibraryDefinition = library.furnitureDefinitions.find(
    ({ id }) => id === selectedFurnitureDefinition?.id
  );
  const selectedFixture = fixturePlacements.find(
    ({ id }) => id === selectedFixtureId
  );
  const selectedFixtureDefinition = document?.fixtureDefinitions?.find(
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
      setSelectedWallId(undefined);
      setSelectedRoomLabelId(undefined);
      setSelectedOpeningId(undefined);
      setSelectedFurnitureId(undefined);
      setSelectedFixtureId(undefined);
      setOperationError("");
    }
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
          setSelectedFurnitureId(
            durable.activeLevel.furniturePlacements?.at(-1)?.id
          );
          setSelectedFixtureId(undefined);
        } else {
          setSelectedFixtureId(
            durable.activeLevel.fixturePlacements?.at(-1)?.id
          );
          setSelectedFurnitureId(undefined);
        }
        setSelectedWallId(undefined);
        setSelectedRoomLabelId(undefined);
        setSelectedOpeningId(undefined);
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
      setSelectedRoomLabelId(label.id);
      setSelectedWallId(undefined);
      setSelectedOpeningId(undefined);
      setSelectedFurnitureId(undefined);
      setSelectedFixtureId(undefined);
      setGesture({ kind: "move-label", labelId: label.id, start: point });
      return;
    }

    const fixture = [...fixturePlacements].reverse().find((placement) => {
      const definition = document?.fixtureDefinitions?.find(
        ({ id }) => id === placement.definitionId
      );
      return definition
        ? furniturePlacementContainsPoint(definition, placement, point)
        : false;
    });
    if (fixture) {
      setSelectedFixtureId(fixture.id);
      setSelectedFurnitureId(undefined);
      setSelectedWallId(undefined);
      setSelectedRoomLabelId(undefined);
      setGesture({
        kind: "fixtureMove",
        placementId: fixture.id,
        start: point
      });
      return;
    }

    const furniture = [...furniturePlacements].reverse().find((placement) => {
      const definition = document?.furnitureDefinitions?.find(
        ({ id }) => id === placement.definitionId
      );
      return definition
        ? furniturePlacementContainsPoint(definition, placement, point)
        : false;
    });
    if (furniture) {
      setSelectedFurnitureId(furniture.id);
      setSelectedFixtureId(undefined);
      setSelectedWallId(undefined);
      setSelectedRoomLabelId(undefined);
      setSelectedOpeningId(undefined);
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
    setSelectedWallId(wall?.id);
    setSelectedRoomLabelId(undefined);
    setSelectedOpeningId(undefined);
    setSelectedFurnitureId(undefined);
    setSelectedFixtureId(undefined);
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
        setSelectedRoomLabelId(durable.activeLevel.roomLabels.at(-1)?.id);
        setSelectedWallId(undefined);
        setSelectedOpeningId(undefined);
        setSelectedFurnitureId(undefined);
        setSelectedFixtureId(undefined);
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
          setSelectedWallId(durable.activeLevel.walls.at(-1)?.id);
          setMode("select");
        }
      }
    } else if (gesture.kind === "move") {
      const wall = walls.find(({ id }) => id === gesture.wallId);
      if (wall) {
        const delta = snapWallDelta(wall, {
          x: point.x - gesture.start.x,
          y: point.y - gesture.start.y
        }, walls.filter(({ id }) => id !== wall.id), view.width / 80);
        await commit(workspace.moveWall(gesture.wallId, delta));
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
          const match = /^\/levels\/\d+\/openings\/(\d+)\//.exec(path);
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
        setSelectedOpeningId(durable.activeLevel.openings.at(-1)?.id);
        setSelectedRoomLabelId(undefined);
        setSelectedFurnitureId(undefined);
        setSelectedFixtureId(undefined);
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

  async function renameProject(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    if (!workspace) {
      return;
    }

    try {
      const renamedWorkspace = workspace.rename(event.target.value);
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

  if (!workspace || !document || !activeLevel) {
    return (
      <main className="welcome-shell">
        <section className="welcome-card" aria-labelledby="welcome-title">
          <p className="eyebrow">Open home planning</p>
          <h1 id="welcome-title">Shape the home you already know.</h1>
          <p className="welcome-copy">
            Start with one measured Level. Your plan stays local, readable, and
            yours.
          </p>
          <label className="field">
            <span>Project name</span>
            <input
              autoFocus
              value={draftName}
              disabled={isSaving}
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Our apartment"
            />
          </label>
          <div className="welcome-actions">
            <button
              className="primary-button"
              type="button"
              disabled={isSaving || !draftName.trim()}
              onClick={createProject}
            >
              Create project
            </button>
            <button
              className="secondary-button"
              type="button"
              disabled={isSaving}
              onClick={() => importInput.current?.click()}
            >
              Import YAML
            </button>
            <input
              ref={importInput}
              className="visually-hidden"
              type="file"
              accept=".yaml,.yml,application/yaml,text/yaml"
              onChange={importProject}
              aria-label="Import Project Document"
            />
          </div>
          {error ? <p className="error-message">{error}</p> : null}
          <p className="disclaimer">
            Smarchitect supports early-stage space planning, not permit or
            construction documentation.
          </p>
        </section>
      </main>
    );
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <div>
          <p className="eyebrow">Existing State</p>
          <h1>{document.name}</h1>
        </div>
        <div className="header-actions">
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving || !canUndo}
            onClick={() => void navigateHistory("undo")}
          >
            Undo
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving || !canRedo}
            onClick={() => void navigateHistory("redo")}
          >
            Redo
          </button>
          <button
            type="button"
            className="secondary-button"
            onClick={() => importInput.current?.click()}
          >
            Import YAML
          </button>
          <button
            type="button"
            className="primary-button"
            onClick={() => downloadYaml(yaml, document.name)}
          >
            Export YAML
          </button>
          <input
            ref={importInput}
            className="visually-hidden"
            type="file"
            accept=".yaml,.yml,application/yaml,text/yaml"
            onChange={importProject}
            aria-label="Import Project Document"
          />
        </div>
      </header>

      <section className="workspace-grid">
        <aside className="project-panel" aria-label="Project properties">
          <label className="field">
            <span>Rename project</span>
            <input disabled={isSaving} value={document.name} onChange={renameProject} />
          </label>
          <div className="level-card">
            <span className="level-index">01</span>
            <div>
              <strong>{activeLevel.name}</strong>
              <small>
                {activeLevel.defaultWallHeightMm / 1000} m default wall height
              </small>
            </div>
          </div>
          <ItemLibrary
            controller={library}
            disabled={isSaving || library.isSaving}
            onPlace={(kind, definitionId) => {
              setPlacingItem({ kind, definitionId });
              setMode("placeItem");
            }}
          />
          <dl className="project-facts">
            <div>
              <dt>Units</dt>
              <dd>Metric</dd>
            </div>
            <div>
              <dt>Schema</dt>
              <dd>{document.schemaVersion}</dd>
            </div>
            <div>
              <dt>Validation</dt>
              <dd className={diagnostics.length ? "status-error" : "status-valid"}>
                {diagnostics.length ? "Needs attention" : "Valid"}
              </dd>
            </div>
          </dl>
          {error ? <p className="error-message">{error}</p> : null}
          <p className="panel-note">
            For early-stage space planning only. Consult qualified professionals
            before construction.
          </p>
        </aside>

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
            onPointerUp={(event) => void finishPlanGesture(event)}
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
              d={walls.map((wall) => {
                const [first, ...rest] = deriveWallFaces(wall);
                return first
                  ? `M ${first.x} ${-first.y} ${rest.map(({ x, y }) => `L ${x} ${-y}`).join(" ")} Z`
                  : "";
              }).join(" ")}
            />
            {furniturePlacements.map((placement) => {
              const definition = document.furnitureDefinitions?.find(
                ({ id }) => id === placement.definitionId
              );
              if (!definition) return null;
              return (
                <polygon
                  key={placement.id}
                  className={placement.id === selectedFurnitureId
                    ? "furniture-footprint selected-furniture"
                    : "furniture-footprint"}
                  points={furnitureFootprintCorners(definition, placement)
                    .map(({ x, y }) => `${x},${-y}`)
                    .join(" ")}
                />
              );
            })}
            {fixturePlacements.map((placement) => {
              const definition = document.fixtureDefinitions?.find(
                ({ id }) => id === placement.definitionId
              );
              if (!definition) return null;
              return (
                <polygon
                  key={placement.id}
                  className={placement.id === selectedFixtureId
                    ? "fixture-footprint selected-fixture"
                    : "fixture-footprint"}
                  points={furnitureFootprintCorners(definition, placement)
                    .map(({ x, y }) => `${x},${-y}`)
                    .join(" ")}
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
                  onPointerDown={(event) => {
                    if (isTransitionPending()) return;
                    const svg = event.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    event.stopPropagation();
                    setSelectedOpeningId(opening.id);
                    setSelectedWallId(opening.hostWallId);
                    setSelectedRoomLabelId(undefined);
                    setSelectedFurnitureId(undefined);
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
            {deriveWallJunctions(walls).map(({ point }) => (
              <circle className="junction" key={`${point.x}:${point.y}`} cx={point.x} cy={-point.y} r={view.width / 220} />
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
            {roomLabels.map((label: RoomLabel) => (
              <g
                className={label.id === selectedRoomLabelId ? "room-label selected-room-label" : "room-label"}
                key={label.id}
              >
                <circle cx={label.position.x} cy={-label.position.y} r={view.width / 100} />
                <text x={label.position.x} y={-label.position.y - view.width / 70}>
                  {label.name}
                </text>
              </g>
            ))}
          </svg>
          {selectedWall ? (
            <div className="wall-properties" aria-label="Selected wall properties">
              {([
                ["startX", "Start X (mm)", selectedWall.path.start.x],
                ["startY", "Start Y (mm)", selectedWall.path.start.y],
                ["endX", "End X (mm)", selectedWall.path.end.x],
                ["endY", "End Y (mm)", selectedWall.path.end.y],
                ["lengthMm", "Wall length (mm)", Math.round(Math.hypot(selectedWall.path.end.x - selectedWall.path.start.x, selectedWall.path.end.y - selectedWall.path.start.y))],
                ["angleDeg", "Wall angle (deg)", Number(wallAngleDeg(selectedWall).toFixed(2))],
                ["thicknessMm", "Wall thickness (mm)", selectedWall.thicknessMm],
                ["heightMm", "Wall height (mm)", selectedWall.heightMm]
              ] satisfies [WallEditField, string, number][]).map(([field, label, value]) => (
                <label key={field}><span>{label}</span><input disabled={isSaving} aria-label={label} type="number" step={field === "angleDeg" ? "any" : 1} value={value} onChange={(event) => void editSelected(field, event.target.value)} /></label>
              ))}
              <button type="button" className="danger-button" disabled={isSaving} onClick={async () => {
                if (await commit(workspace.deleteWall(selectedWall.id))) {
                  setSelectedWallId(undefined);
                }
              }}>Delete wall</button>
            </div>
          ) : null}
          {selectedRoomLabel ? (
            <div className="room-label-properties" aria-label="Selected Room Label properties">
              <label>
                <span>Room Label name</span>
                <input
                  disabled={isSaving}
                  aria-label="Room Label name"
                  value={selectedRoomLabel.name}
                  onChange={(event) => void editSelectedRoomLabel("name", event.target.value)}
                />
              </label>
              {([
                ["x", "Room Label X (mm)", selectedRoomLabel.position.x],
                ["y", "Room Label Y (mm)", selectedRoomLabel.position.y]
              ] satisfies [RoomLabelEditField, string, number][]).map(([field, label, value]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input
                    disabled={isSaving}
                    aria-label={label}
                    type="number"
                    value={value}
                    onChange={(event) => void editSelectedRoomLabel(field, event.target.value)}
                  />
                </label>
              ))}
              <button
                type="button"
                className="danger-button"
                disabled={isSaving}
                onClick={async () => {
                  if (await commit(workspace.deleteRoomLabel(selectedRoomLabel.id))) {
                    setSelectedRoomLabelId(undefined);
                  }
                }}
              >
                Delete room label
              </button>
            </div>
          ) : null}
          {diagnostics.filter(({ code }) => code.startsWith("room-label.")).map(
            ({ code, message }, index) => (
              <p className="room-diagnostic" role="alert" key={`${code}:${index}`}>
                {message}
              </p>
            )
          )}
          {openingConflict ? (
            <div className="opening-conflict" role="alert" aria-label="Opening conflict resolution">
              <strong>Wall edit conflicts with hosted Openings</strong>
              <p>
                Affected: {openings
                  .filter(({ id }) => openingConflict.openingIds.includes(id))
                  .map(({ kind, id }) => `${kind} ${id}`)
                  .join(", ")}
              </p>
              <button type="button" disabled={isSaving} onClick={() => void resolveOpeningConflict("fit")}>Fit openings and apply</button>
              <button type="button" className="danger-button" disabled={isSaving} onClick={() => void resolveOpeningConflict("delete")}>Delete conflicting openings and apply</button>
              <button type="button" disabled={isSaving} onClick={() => {
                setOpeningConflict(undefined);
                setOperationError("");
              }}>Cancel wall edit</button>
            </div>
          ) : null}
          {selectedOpening ? (
            <OpeningProperties
              opening={selectedOpening}
              isSaving={isSaving}
              onEdit={(update) => void editOpening(update)}
              onDelete={() => {
                void commit(workspace.deleteOpening(selectedOpening.id))
                  .then((durable) => {
                    if (durable) setSelectedOpeningId(undefined);
                  });
              }}
            />
          ) : null}
          {selectedFurniture && selectedFurnitureDefinition ? (
            <PlacementInspector
              definition={selectedFurnitureDefinition}
              disabled={isSaving || library.isSaving}
              libraryDefinition={selectedLibraryDefinition}
              placement={selectedFurniture}
              onUpdatePlacement={(update) => void editFurniturePlacement(update)}
              onUpdateDefinition={(update) => void editEmbeddedDefinition(update)}
              onMakeUnique={() => void commit(
                workspace.makeFurniturePlacementUnique(selectedFurniture.id)
              )}
              onDelete={async () => {
                if (await commit(
                  workspace.deleteFurniturePlacement(selectedFurniture.id)
                )) {
                  setSelectedFurnitureId(undefined);
                }
              }}
            />
          ) : null}
          {selectedFixture && selectedFixtureDefinition ? (
            <PlacementInspector
              kind="Fixture"
              definition={selectedFixtureDefinition}
              disabled={isSaving || library.isSaving}
              libraryDefinition={selectedFixtureLibraryDefinition}
              placement={selectedFixture}
              onUpdatePlacement={(update) => void editFixturePlacement(update)}
              onUpdateDefinition={(update) =>
                void editEmbeddedFixtureDefinition(update)}
              onMakeUnique={() => void commit(
                workspace.makeFixturePlacementUnique(selectedFixture.id)
              )}
              onDelete={async () => {
                if (await commit(
                  workspace.deleteFixturePlacement(selectedFixture.id)
                )) {
                  setSelectedFixtureId(undefined);
                }
              }}
            />
          ) : null}
        </section>

        <section className="yaml-panel" aria-labelledby="yaml-title">
          <div className="panel-heading">
            <div>
              <p className="eyebrow">Source of truth</p>
              <h2 id="yaml-title">Project Document</h2>
            </div>
            <span className="valid-chip">Valid YAML</span>
          </div>
          <textarea
            aria-label="Project Document YAML"
            value={yaml}
            readOnly
            spellCheck={false}
          />
        </section>
      </section>
    </main>
  );
}
