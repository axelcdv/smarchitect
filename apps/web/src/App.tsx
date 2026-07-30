import {
  deriveWallFaces,
  deriveWallJunctions,
  findWallAtPoint,
  findWallEndpointAtPoint,
  ProjectValidationError,
  ProjectWorkspace,
  snapAngle,
  snapPoint,
  snapWallDelta,
  wallAngleDeg,
  type PointMm,
  type RoomLabel,
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
  IndexedDbProjectRepository,
  SerializedProjectRepository
} from "./project-persistence.js";
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
  const [workspace, setWorkspace] = useState<ProjectWorkspace>();
  const [historyControls, setHistoryControls] = useState({
    canUndo: false,
    canRedo: false
  });
  const [isSaving, setIsSaving] = useState(false);
  const [yaml, setYaml] = useState("");
  const [error, setError] = useState("");
  const [selectedWallId, setSelectedWallId] = useState<string>();
  const [selectedRoomLabelId, setSelectedRoomLabelId] = useState<string>();
  const [mode, setMode] = useState<"draw" | "select" | "label">("draw");
  const [view, setView] = useState({ x: -4000, y: -2600, width: 8000, height: 5200 });
  const [gesture, setGesture] = useState<
    | { kind: "draw"; start: PointMm }
    | { kind: "move"; wallId: string; start: PointMm }
    | { kind: "endpoint"; wallId: string; endpoint: "start" | "end" }
    | { kind: "add-label" }
    | { kind: "move-label"; labelId: string; start: PointMm }
  >();
  const importInput = useRef<HTMLInputElement>(null);
  const repository = useRef(
    new SerializedProjectRepository(new IndexedDbProjectRepository())
  );
  const autosavedProject = useRef<AutosavedProject | undefined>(undefined);
  const transitionPending = useRef(false);
  const document = workspace?.document;
  const activeLevel = workspace?.activeLevel;
  const diagnostics = workspace?.diagnostics ?? [];
  const walls = activeLevel?.walls ?? [];
  const roomLabels = activeLevel?.roomLabels ?? [];
  const rooms = workspace?.rooms ?? [];
  const selectedWall = walls.find(({ id }) => id === selectedWallId);
  const selectedRoomLabel = roomLabels.find(({ id }) => id === selectedRoomLabelId);

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
      setSelectedRoomLabelId(undefined);
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

  function beginPlanGesture(event: PointerEvent<SVGSVGElement>): void {
    if (transitionPending.current) return;
    const point = eventPoint(event);
    const snapTolerance = view.width / 80;
    if (mode === "draw") {
      setGesture({ kind: "draw", start: snapPoint(point, walls, snapTolerance) });
      return;
    }
    if (mode === "label") {
      setGesture({ kind: "add-label" });
      return;
    }

    const label = roomLabels
      .map((candidate) => ({
        candidate,
        distance: Math.hypot(
          candidate.position.x - point.x,
          candidate.position.y - point.y
        )
      }))
      .filter(({ distance }) => distance <= view.width / 80)
      .sort((left, right) => left.distance - right.distance)[0]?.candidate;
    if (label) {
      setSelectedRoomLabelId(label.id);
      setSelectedWallId(undefined);
      setGesture({ kind: "move-label", labelId: label.id, start: point });
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
    if (wall) {
      setGesture({ kind: "move", wallId: wall.id, start: point });
    }
  }

  async function finishPlanGesture(event: PointerEvent<SVGSVGElement>): Promise<void> {
    if (!workspace || !gesture || transitionPending.current) return;
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
        await commit(workspace.updateWall(wall.id, {
          [gesture.endpoint]: hasExactSnap ? snapped : snapAngle(other, point)
        }));
      }
    } else {
      await commit(workspace.moveRoomLabel(gesture.labelId, {
        x: point.x - gesture.start.x,
        y: point.y - gesture.start.y
      }));
    }
    setGesture(undefined);
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
            <span>
              <span>{walls.length} {walls.length === 1 ? "wall" : "walls"}</span>
              {" · "}
              <span>{rooms.length} {rooms.length === 1 ? "room" : "rooms"}</span>
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
            onPointerDown={beginPlanGesture}
            onPointerUp={finishPlanGesture}
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
