import {
  deriveWallFaces,
  deriveWallJunctions,
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
  type PointMm,
  type FurnitureDefinition,
  type FurnitureDefinitionUpdate,
  type FurniturePlacementUpdate,
  type Wall
} from "@smarchitect/core";
import {
  useEffect,
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
  type WheelEvent
} from "react";
import {
  AutosavedProject,
  AutosavedFurnitureLibrary,
  IndexedDbFurnitureLibraryRepository,
  IndexedDbProjectRepository,
  SerializedProjectRepository
} from "./project-persistence.js";
import "./styles.css";

type WallEditField =
  | "startX" | "startY" | "endX" | "endY"
  | "lengthMm" | "angleDeg" | "thicknessMm" | "heightMm";

const EMPTY_FURNITURE_DRAFT = {
  name: "",
  widthMm: 1000,
  depthMm: 600,
  heightMm: 800
};

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
  const [workspace, setWorkspace] = useState<ProjectWorkspace>();
  const [historyControls, setHistoryControls] = useState({
    canUndo: false,
    canRedo: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [yaml, setYaml] = useState("");
  const [error, setError] = useState("");
  const [selectedWallId, setSelectedWallId] = useState<string>();
  const [selectedFurnitureId, setSelectedFurnitureId] = useState<string>();
  const [placingDefinitionId, setPlacingDefinitionId] = useState<string>();
  const [libraryDefinitions, setLibraryDefinitions] = useState<FurnitureDefinition[]>([]);
  const [libraryHistoryControls, setLibraryHistoryControls] = useState({
    canUndo: false,
    canRedo: false
  });
  const [furnitureDraft, setFurnitureDraft] = useState(EMPTY_FURNITURE_DRAFT);
  const [mode, setMode] = useState<"draw" | "select" | "placeFurniture">("draw");
  const [view, setView] = useState({ x: -4000, y: -2600, width: 8000, height: 5200 });
  const [gesture, setGesture] = useState<
    | { kind: "draw"; start: PointMm }
    | { kind: "move"; wallId: string; start: PointMm }
    | { kind: "endpoint"; wallId: string; endpoint: "start" | "end" }
    | { kind: "furnitureMove"; placementId: string; start: PointMm }
  >();
  const importInput = useRef<HTMLInputElement>(null);
  const repository = useRef(
    new SerializedProjectRepository(new IndexedDbProjectRepository())
  );
  const autosavedProject = useRef<AutosavedProject | undefined>(undefined);
  const libraryRepository = useRef(new IndexedDbFurnitureLibraryRepository());
  const autosavedLibrary = useRef<AutosavedFurnitureLibrary | undefined>(undefined);
  const transitionPending = useRef(false);
  const document = workspace?.document;
  const activeLevel = workspace?.activeLevel;
  const diagnostics = workspace?.diagnostics ?? [];
  const walls = activeLevel?.walls ?? [];
  const selectedWall = walls.find(({ id }) => id === selectedWallId);
  const furniturePlacements = activeLevel?.furniturePlacements ?? [];
  const selectedFurniture = furniturePlacements.find(
    ({ id }) => id === selectedFurnitureId
  );
  const selectedFurnitureDefinition = document?.furnitureDefinitions.find(
    ({ id }) => id === selectedFurniture?.definitionId
  );
  const selectedLibraryDefinition = libraryDefinitions.find(
    ({ id }) => id === selectedFurnitureDefinition?.id
  );

  function refreshHistoryControls(project: AutosavedProject): void {
    setHistoryControls({
      canUndo: project.canUndo,
      canRedo: project.canRedo
    });
  }

  useEffect(() => {
    let active = true;
    void AutosavedProject.restore(repository.current)
      .then((restored) => {
        if (!active || !restored || autosavedProject.current) return;
        autosavedProject.current = restored;
        setWorkspace(restored.workspace);
        setYaml(restored.workspace.exportYaml());
        setDraftName(restored.workspace.document.name);
        refreshHistoryControls(restored);
      })
      .catch(() => {
        if (active && !autosavedProject.current) {
          setError("Local recovery is unavailable. New edits may not survive reload.");
        }
      });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    let active = true;
    void AutosavedFurnitureLibrary.restore(libraryRepository.current)
      .then(async (restored) => {
        const library = restored
          ?? await AutosavedFurnitureLibrary.create(libraryRepository.current);
        if (active) {
          autosavedLibrary.current = library;
          setLibraryDefinitions(library.definitions);
          setLibraryHistoryControls({
            canUndo: library.canUndo,
            canRedo: library.canRedo
          });
        }
      })
      .catch(() => {
        if (active) setError("The Item Library could not be loaded.");
      });
    return () => {
      active = false;
    };
  }, []);

  function show(next: ProjectWorkspace): void {
    setWorkspace(next);
    setYaml(next.exportYaml());
    setError("");
  }

  async function persist(
    transition: () => Promise<ProjectWorkspace>
  ): Promise<ProjectWorkspace | undefined> {
    if (transitionPending.current) return undefined;
    transitionPending.current = true;
    setIsSaving(true);
    try {
      const durable = await transition();
      show(durable);
      return durable;
    } catch (cause) {
      setError(cause instanceof Error
        ? `Autosave failed: ${cause.message}`
        : "Autosave failed. The edit was not accepted.");
      return undefined;
    } finally {
      transitionPending.current = false;
      setIsSaving(false);
    }
  }

  async function commit(next: ProjectWorkspace): Promise<ProjectWorkspace | undefined> {
    const project = autosavedProject.current;
    if (!project) return undefined;
    const durable = await persist(() => project.accept(next));
    if (durable) refreshHistoryControls(project);
    return durable;
  }

  async function startAutosave(next: ProjectWorkspace): Promise<boolean> {
    const durable = await persist(async () => {
      const project = await AutosavedProject.create(next, repository.current);
      autosavedProject.current = project;
      refreshHistoryControls(project);
      return project.workspace;
    });
    return durable !== undefined;
  }

  async function navigateHistory(direction: "undo" | "redo"): Promise<void> {
    const project = autosavedProject.current;
    if (!project) return;
    const restored = await persist(
      () => direction === "undo" ? project.undo() : project.redo()
    );
    if (restored) {
      setSelectedWallId(undefined);
      setSelectedFurnitureId(undefined);
      refreshHistoryControls(project);
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
    if (transitionPending.current) return;
    const point = eventPoint(event);
    const snapTolerance = view.width / 80;
    if (mode === "placeFurniture") {
      const definition = libraryDefinitions.find(
        ({ id }) => id === placingDefinitionId
      );
      if (!workspace || !definition) return;
      const durable = await commit(workspace.placeFurniture(definition, {
        position: point
      }));
      if (durable) {
        setSelectedFurnitureId(
          durable.activeLevel.furniturePlacements.at(-1)?.id
        );
        setSelectedWallId(undefined);
        setMode("select");
        setPlacingDefinitionId(undefined);
      }
      return;
    }
    if (mode === "draw") {
      setGesture({ kind: "draw", start: snapPoint(point, walls, snapTolerance) });
      return;
    }

    const furniture = [...furniturePlacements].reverse().find((placement) => {
      const definition = document?.furnitureDefinitions.find(
        ({ id }) => id === placement.definitionId
      );
      return definition
        ? furniturePlacementContainsPoint(definition, placement, point)
        : false;
    });
    if (furniture) {
      setSelectedFurnitureId(furniture.id);
      setSelectedWallId(undefined);
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
    setSelectedFurnitureId(undefined);
    if (wall) {
      setGesture({ kind: "move", wallId: wall.id, start: point });
    }
  }

  async function finishPlanGesture(event: PointerEvent<SVGSVGElement>): Promise<void> {
    if (!workspace || !gesture || transitionPending.current) return;
    const point = eventPoint(event);
    if (gesture.kind === "draw") {
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
        await commit(workspace.updateWall(wall.id, {
          [gesture.endpoint]: hasExactSnap ? snapped : snapAngle(other, point)
        }));
      }
    } else {
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
    }
    setGesture(undefined);
  }

  async function saveLibrary(
    transition: (definitions: FurnitureDefinition[]) => FurnitureDefinition[]
  ): Promise<void> {
    try {
      const library = autosavedLibrary.current;
      if (!library) throw new Error("The Item Library is not ready.");
      setLibraryDefinitions(await library.transact((definitions) => {
        const next = transition(definitions);
        if (next.some((definition) =>
          !definition.name.trim()
          || !Number.isInteger(definition.widthMm) || definition.widthMm <= 0
          || !Number.isInteger(definition.depthMm) || definition.depthMm <= 0
          || !Number.isInteger(definition.heightMm) || definition.heightMm <= 0
        )) {
          throw new Error(
            "Furniture Definitions need a name and positive integer-millimetre dimensions."
          );
        }
        return next;
      }));
      setLibraryHistoryControls({
        canUndo: library.canUndo,
        canRedo: library.canRedo
      });
      setError("");
    } catch (cause) {
      setError(cause instanceof Error
        ? cause.message
        : "The Item Library change could not be saved.");
    }
  }

  async function navigateLibraryHistory(direction: "undo" | "redo"): Promise<void> {
    const library = autosavedLibrary.current;
    if (!library) return;
    try {
      const definitions = direction === "undo"
        ? await library.undo()
        : await library.redo();
      setLibraryDefinitions(definitions);
      setLibraryHistoryControls({
        canUndo: library.canUndo,
        canRedo: library.canRedo
      });
      setError("");
    } catch {
      setError("The Item Library history change could not be saved.");
    }
  }

  async function createFurnitureDefinition(): Promise<void> {
    const definition: FurnitureDefinition = {
      id: `furniture_definition_${globalThis.crypto.randomUUID()}`,
      name: furnitureDraft.name.trim(),
      widthMm: Math.round(furnitureDraft.widthMm),
      depthMm: Math.round(furnitureDraft.depthMm),
      heightMm: Math.round(furnitureDraft.heightMm),
      extensions: {}
    };
    await saveLibrary((definitions) => [...definitions, definition]);
    setFurnitureDraft(EMPTY_FURNITURE_DRAFT);
  }

  async function updateLibraryDefinition(
    definition: FurnitureDefinition,
    update: FurnitureDefinitionUpdate
  ): Promise<void> {
    await saveLibrary((definitions) => definitions.map((candidate) =>
      candidate.id === definition.id
        ? { ...candidate, ...update }
        : candidate
    ));
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

  async function editSelected(field: WallEditField, value: string): Promise<void> {
    if (!workspace || !selectedWall || !value) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const update = field === "startX" ? { start: { ...selectedWall.path.start, x: Math.round(numeric) } }
      : field === "startY" ? { start: { ...selectedWall.path.start, y: Math.round(numeric) } }
      : field === "endX" ? { end: { ...selectedWall.path.end, x: Math.round(numeric) } }
      : field === "endY" ? { end: { ...selectedWall.path.end, y: Math.round(numeric) } }
      : { [field]: field === "angleDeg" ? numeric : Math.round(numeric) };
    await commit(workspace.updateWall(selectedWall.id, update));
  }

  async function createProject(): Promise<void> {
    try {
      const created = ProjectWorkspace.create(draftName);
      await startAutosave(created);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create project.");
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
      setError(cause instanceof Error ? cause.message : "Unable to rename project.");
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
        setError(cause.diagnostics.map(({ message }) => message).join(" "));
      } else {
        setError(cause instanceof Error ? cause.message : "Unable to import project.");
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
            disabled={isSaving || !historyControls.canUndo}
            onClick={() => void navigateHistory("undo")}
          >
            Undo
          </button>
          <button
            type="button"
            className="secondary-button"
            disabled={isSaving || !historyControls.canRedo}
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
          <section className="item-library" aria-labelledby="item-library-title">
            <div>
              <p className="eyebrow">Reusable items</p>
              <h2 id="item-library-title">Item Library</h2>
            </div>
            <div className="library-history-actions">
              <button
                type="button"
                disabled={!libraryHistoryControls.canUndo}
                onClick={() => void navigateLibraryHistory("undo")}
              >
                Undo Item Library
              </button>
              <button
                type="button"
                disabled={!libraryHistoryControls.canRedo}
                onClick={() => void navigateLibraryHistory("redo")}
              >
                Redo Item Library
              </button>
            </div>
            <div className="furniture-definition-form">
              <label>
                <span>Name</span>
                <input
                  aria-label="New Furniture name"
                  value={furnitureDraft.name}
                  onChange={(event) => setFurnitureDraft((draft) => ({
                    ...draft,
                    name: event.target.value
                  }))}
                />
              </label>
              {(["widthMm", "depthMm", "heightMm"] as const).map((field) => (
                <label key={field}>
                  <span>{field === "widthMm" ? "Width" : field === "depthMm" ? "Depth" : "Height"} (mm)</span>
                  <input
                    aria-label={`New Furniture ${field}`}
                    type="number"
                    min="1"
                    step="1"
                    value={furnitureDraft[field]}
                    onChange={(event) => setFurnitureDraft((draft) => ({
                      ...draft,
                      [field]: Number(event.target.value)
                    }))}
                  />
                </label>
              ))}
              <button
                type="button"
                className="primary-button"
                disabled={isSaving || !furnitureDraft.name.trim()}
                onClick={() => void createFurnitureDefinition()}
              >
                Create Furniture
              </button>
            </div>
            <div className="library-list">
              {libraryDefinitions.map((definition) => (
                <article key={definition.id} className="library-card">
                  <label>
                    <span>Name</span>
                    <input
                      aria-label={`${definition.name} name`}
                      defaultValue={definition.name}
                      onBlur={(event) => void updateLibraryDefinition(
                        definition,
                        { name: event.target.value }
                      )}
                    />
                  </label>
                  {(["widthMm", "depthMm", "heightMm"] as const).map((field) => (
                    <label key={field}>
                      <span>{field.replace("Mm", "")}</span>
                      <input
                        aria-label={`${definition.name} ${field}`}
                        type="number"
                        min="1"
                        step="1"
                        defaultValue={definition[field]}
                        onBlur={(event) => void updateLibraryDefinition(
                          definition,
                          { [field]: Math.round(Number(event.target.value)) }
                        )}
                      />
                    </label>
                  ))}
                  <div className="library-actions">
                    <button
                      type="button"
                      disabled={isSaving}
                      onClick={() => {
                        setPlacingDefinitionId(definition.id);
                        setMode("placeFurniture");
                      }}
                    >
                      Place
                    </button>
                    <button
                      type="button"
                      className="danger-button"
                      disabled={isSaving}
                      onClick={() => void saveLibrary(
                        (definitions) => definitions.filter(
                          ({ id }) => id !== definition.id
                        )
                      )}
                    >
                      Delete
                    </button>
                  </div>
                </article>
              ))}
            </div>
          </section>
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
            <span className="plan-count">
              {`${walls.length} ${walls.length === 1 ? "wall" : "walls"}`}
            </span>
            <span>
              {`${furniturePlacements.length} Furniture ${furniturePlacements.length === 1 ? "Placement" : "Placements"}`}
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
              const definition = document.furnitureDefinitions.find(
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
            {selectedWall ? (
              <polygon
                className="selected-wall"
                points={wallPolygonPoints(selectedWall)}
              />
            ) : null}
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
          {selectedFurniture && selectedFurnitureDefinition ? (
            <div className="furniture-properties" aria-label="Selected Furniture Placement properties">
              <h3>{selectedFurnitureDefinition.name}</h3>
              {([
                ["x", "Furniture X (mm)", selectedFurniture.position.x],
                ["y", "Furniture Y (mm)", selectedFurniture.position.y],
                ["rotationDeg", "Furniture rotation (deg)", selectedFurniture.rotationDeg],
                ["elevationMm", "Furniture elevation (mm)", selectedFurniture.elevationMm]
              ] as const).map(([field, label, value]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input
                    aria-label={label}
                    disabled={isSaving}
                    type="number"
                    step={field === "rotationDeg" ? "any" : "1"}
                    value={value}
                    onChange={(event) => {
                      const numeric = Number(event.target.value);
                      if (!Number.isFinite(numeric)) return;
                      void editFurniturePlacement(field === "x"
                        ? { position: { ...selectedFurniture.position, x: Math.round(numeric) } }
                        : field === "y"
                          ? { position: { ...selectedFurniture.position, y: Math.round(numeric) } }
                          : { [field]: field === "rotationDeg" ? numeric : Math.round(numeric) });
                    }}
                  />
                </label>
              ))}
              {([
                ["widthMm", "Furniture width (mm)"],
                ["depthMm", "Furniture depth (mm)"],
                ["heightMm", "Furniture height (mm)"]
              ] as const).map(([field, label]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input
                    aria-label={label}
                    disabled={isSaving}
                    type="number"
                    min="1"
                    step="1"
                    value={selectedFurnitureDefinition[field]}
                    onChange={(event) => void editEmbeddedDefinition({
                      [field]: Math.round(Number(event.target.value))
                    })}
                  />
                </label>
              ))}
              {selectedLibraryDefinition ? (
                <button
                  type="button"
                  disabled={isSaving}
                  onClick={() => void editEmbeddedDefinition({
                    name: selectedLibraryDefinition.name,
                    widthMm: selectedLibraryDefinition.widthMm,
                    depthMm: selectedLibraryDefinition.depthMm,
                    heightMm: selectedLibraryDefinition.heightMm
                  })}
                >
                  Update from Item Library
                </button>
              ) : null}
              <button
                type="button"
                disabled={isSaving}
                onClick={() => void commit(
                  workspace.makeFurniturePlacementUnique(selectedFurniture.id)
                )}
              >
                Make unique
              </button>
              <button
                type="button"
                className="danger-button"
                disabled={isSaving}
                onClick={async () => {
                  if (await commit(
                    workspace.deleteFurniturePlacement(selectedFurniture.id)
                  )) {
                    setSelectedFurnitureId(undefined);
                  }
                }}
              >
                Delete Furniture Placement
              </button>
            </div>
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
