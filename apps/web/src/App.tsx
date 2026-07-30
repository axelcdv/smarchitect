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
  type Opening,
  type OpeningUpdate,
  type PointMm,
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

type OpeningEditField = "positionMm" | "widthMm" | "heightMm" | "sillHeightMm";

function wallLength(wall: Wall): number {
  return Math.hypot(
    wall.path.end.x - wall.path.start.x,
    wall.path.end.y - wall.path.start.y
  );
}

function pointAlongWall(wall: Wall, distanceMm: number): PointMm {
  const length = wallLength(wall);
  return {
    x: wall.path.start.x + (wall.path.end.x - wall.path.start.x) * distanceMm / length,
    y: wall.path.start.y + (wall.path.end.y - wall.path.start.y) * distanceMm / length
  };
}

function distanceAlongWall(wall: Wall, point: PointMm): number {
  const length = wallLength(wall);
  return (
    (point.x - wall.path.start.x) * (wall.path.end.x - wall.path.start.x) +
    (point.y - wall.path.start.y) * (wall.path.end.y - wall.path.start.y)
  ) / length;
}

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
  const [selectedOpeningId, setSelectedOpeningId] = useState<string>();
  const [mode, setMode] = useState<"draw" | "select">("draw");
  const [view, setView] = useState({ x: -4000, y: -2600, width: 8000, height: 5200 });
  const [gesture, setGesture] = useState<
    | { kind: "draw"; start: PointMm }
    | { kind: "move"; wallId: string; start: PointMm }
    | { kind: "endpoint"; wallId: string; endpoint: "start" | "end" }
    | {
        kind: "opening";
        openingId: string;
        start: PointMm;
        startPositionMm: number;
      }
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
  const openings = activeLevel?.openings ?? [];
  const selectedWall = walls.find(({ id }) => id === selectedWallId);
  const selectedOpening = openings.find(({ id }) => id === selectedOpeningId);

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
      setSelectedOpeningId(undefined);
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
    setSelectedOpeningId(undefined);
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
      const opening = openings.find(({ id }) => id === gesture.openingId);
      const wall = opening
        ? walls.find(({ id }) => id === opening.hostWallId)
        : undefined;
      if (opening && wall) {
        const pointerDelta = distanceAlongWall(wall, point)
          - distanceAlongWall(wall, gesture.start);
        const nextPosition = Math.max(
          0,
          Math.min(
            wallLength(wall) - opening.widthMm,
            Math.round(gesture.startPositionMm + pointerDelta)
          )
        );
        await commit(workspace.updateOpening(opening.id, {
          positionMm: nextPosition
        }));
      }
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

  async function editOpening(update: OpeningUpdate): Promise<void> {
    if (!workspace || !selectedOpening) return;
    try {
      await commit(workspace.updateOpening(selectedOpening.id, update));
    } catch (cause) {
      setError(cause instanceof ProjectValidationError
        ? cause.diagnostics.map(({ message }) => message).join(" ")
        : cause instanceof Error ? cause.message : "Unable to edit Opening.");
    }
  }

  async function editOpeningNumber(
    field: OpeningEditField,
    value: string
  ): Promise<void> {
    const numeric = Number(value);
    if (!value || !Number.isFinite(numeric)) return;
    await editOpening({ [field]: Math.round(numeric) });
  }

  async function addOpening(kind: Opening["kind"]): Promise<void> {
    if (!workspace || !selectedWall) return;
    const widthMm = Math.min(kind === "passage" ? 1000 : 900, wallLength(selectedWall));
    const positionMm = Math.round((wallLength(selectedWall) - widthMm) / 2);
    const heightMm = Math.min(kind === "window" ? 1200 : 2100, selectedWall.heightMm);
    try {
      const next = kind === "door"
        ? workspace.addOpening({
            kind,
            hostWallId: selectedWall.id,
            positionMm,
            widthMm,
            heightMm,
            operation: {
              kind: "hinged",
              hingeSide: "start",
              swingDirection: "inward"
            }
          })
        : kind === "window"
          ? workspace.addOpening({
              kind,
              hostWallId: selectedWall.id,
              positionMm,
              widthMm,
              heightMm,
              sillHeightMm: Math.max(0, Math.min(900, selectedWall.heightMm - heightMm)),
              operation: { kind: "fixed" }
            })
          : workspace.addOpening({
              kind,
              hostWallId: selectedWall.id,
              positionMm,
              widthMm,
              heightMm
            });
      const durable = await commit(next);
      if (durable) {
        setSelectedOpeningId(durable.activeLevel.openings.at(-1)?.id);
        setMode("select");
      }
    } catch (cause) {
      setError(cause instanceof ProjectValidationError
        ? cause.diagnostics.map(({ message }) => message).join(" ")
        : cause instanceof Error ? cause.message : "Unable to add Opening.");
    }
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
            <span>{walls.length} {walls.length === 1 ? "wall" : "walls"}</span>
            <button disabled={isSaving || !selectedWall} type="button" onClick={() => void addOpening("door")}>Add door</button>
            <button disabled={isSaving || !selectedWall} type="button" onClick={() => void addOpening("window")}>Add window</button>
            <button disabled={isSaving || !selectedWall} type="button" onClick={() => void addOpening("passage")}>Add passage</button>
            <span>{openings.length} {openings.length === 1 ? "opening" : "openings"}</span>
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
            {openings.map((opening) => {
              const host = walls.find(({ id }) => id === opening.hostWallId);
              if (!host) return null;
              const start = pointAlongWall(host, opening.positionMm);
              const end = pointAlongWall(host, opening.positionMm + opening.widthMm);
              const length = wallLength(host);
              const unit = {
                x: (host.path.end.x - host.path.start.x) / length,
                y: (host.path.end.y - host.path.start.y) / length
              };
              const normal = { x: -unit.y, y: unit.x };
              const isSelected = opening.id === selectedOpeningId;
              const operation = opening.kind === "passage"
                ? "passage"
                : opening.operation.kind;
              const hinge = opening.kind !== "passage"
                && opening.operation.kind === "hinged"
                ? opening.operation.hingeSide === "start" ? start : end
                : undefined;
              const swingSign = opening.kind !== "passage"
                && opening.operation.kind === "hinged"
                && opening.operation.swingDirection === "outward" ? -1 : 1;
              const leafEnd = hinge ? {
                x: hinge.x + normal.x * opening.widthMm * swingSign,
                y: hinge.y + normal.y * opening.widthMm * swingSign
              } : undefined;
              const slideDirection = opening.kind !== "passage"
                && opening.operation.kind === "sliding"
                ? opening.operation.slideDirection
                : undefined;
              const slideTip = slideDirection === "start" ? start
                : slideDirection === "end" ? end
                  : undefined;
              const slideTail = slideTip
                ? pointAlongWall(
                    host,
                    opening.positionMm + opening.widthMm / 2
                  )
                : undefined;
              const arrowBack = slideDirection === "start" ? unit : {
                x: -unit.x,
                y: -unit.y
              };
              const slideArrow = slideTip && slideTail
                ? `M ${slideTail.x} ${-slideTail.y} L ${slideTip.x} ${-slideTip.y} M ${slideTip.x + arrowBack.x * 130 + normal.x * 70} ${-(slideTip.y + arrowBack.y * 130 + normal.y * 70)} L ${slideTip.x} ${-slideTip.y} L ${slideTip.x + arrowBack.x * 130 - normal.x * 70} ${-(slideTip.y + arrowBack.y * 130 - normal.y * 70)}`
                : undefined;
              return (
                <g
                  key={opening.id}
                  role="button"
                  tabIndex={0}
                  aria-label={`${opening.kind[0]!.toUpperCase()}${opening.kind.slice(1)} opening`}
                  className={`opening-symbol opening-${opening.kind} opening-${operation}${isSelected ? " selected-opening" : ""}`}
                  data-operation={operation}
                  onPointerDown={(event) => {
                    if (transitionPending.current) return;
                    const svg = event.currentTarget.ownerSVGElement;
                    if (!svg) return;
                    event.stopPropagation();
                    setSelectedOpeningId(opening.id);
                    setSelectedWallId(opening.hostWallId);
                    setMode("select");
                    setGesture({
                      kind: "opening",
                      openingId: opening.id,
                      start: clientPoint(svg, event.clientX, event.clientY),
                      startPositionMm: opening.positionMm
                    });
                  }}
                >
                  <line
                    className="opening-cut"
                    x1={start.x}
                    y1={-start.y}
                    x2={end.x}
                    y2={-end.y}
                    strokeWidth={host.thicknessMm + 36}
                  />
                  {opening.kind === "passage" ? (
                    <>
                      <line className="opening-jamb" x1={start.x - normal.x * 90} y1={-(start.y - normal.y * 90)} x2={start.x + normal.x * 90} y2={-(start.y + normal.y * 90)} />
                      <line className="opening-jamb" x1={end.x - normal.x * 90} y1={-(end.y - normal.y * 90)} x2={end.x + normal.x * 90} y2={-(end.y + normal.y * 90)} />
                    </>
                  ) : opening.kind === "window" ? (
                    <>
                      <line className="window-pane" x1={start.x} y1={-start.y} x2={end.x} y2={-end.y} />
                      <line className="window-pane window-pane-offset" x1={start.x + normal.x * 45} y1={-(start.y + normal.y * 45)} x2={end.x + normal.x * 45} y2={-(end.y + normal.y * 45)} />
                      {leafEnd ? <line className="opening-leaf" x1={hinge!.x} y1={-hinge!.y} x2={leafEnd.x} y2={-leafEnd.y} /> : null}
                      {slideArrow ? <path className="slide-direction" d={slideArrow} /> : null}
                    </>
                  ) : opening.operation.kind === "hinged" && leafEnd ? (
                    <>
                      <line className="opening-leaf" x1={hinge!.x} y1={-hinge!.y} x2={leafEnd.x} y2={-leafEnd.y} />
                      <path className="door-swing" d={`M ${opening.operation.hingeSide === "start" ? end.x : start.x} ${-(opening.operation.hingeSide === "start" ? end.y : start.y)} A ${opening.widthMm} ${opening.widthMm} 0 0 ${swingSign > 0 ? 1 : 0} ${leafEnd.x} ${-leafEnd.y}`} />
                    </>
                  ) : (
                    <>
                      <line className="sliding-panel" x1={start.x + normal.x * 45} y1={-(start.y + normal.y * 45)} x2={end.x + normal.x * 45} y2={-(end.y + normal.y * 45)} />
                      <line className="sliding-panel" x1={start.x - normal.x * 45} y1={-(start.y - normal.y * 45)} x2={end.x - normal.x * 45} y2={-(end.y - normal.y * 45)} />
                      {slideArrow ? <path className="slide-direction" d={slideArrow} /> : null}
                    </>
                  )}
                </g>
              );
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
          {selectedOpening ? (
            <div className="opening-properties" aria-label="Selected Opening properties">
              <label>
                <span>Opening type</span>
                <input aria-label="Opening type" readOnly value={selectedOpening.kind} />
              </label>
              <label>
                <span>Host Wall</span>
                <input aria-label="Host Wall" readOnly value={selectedOpening.hostWallId} />
              </label>
              {([
                ["positionMm", "Opening position (mm)", selectedOpening.positionMm],
                ["widthMm", "Opening width (mm)", selectedOpening.widthMm],
                ["heightMm", "Opening height (mm)", selectedOpening.heightMm],
                ...(selectedOpening.kind === "window"
                  ? [["sillHeightMm", "Window sill height (mm)", selectedOpening.sillHeightMm] as [OpeningEditField, string, number]]
                  : [])
              ] satisfies [OpeningEditField, string, number][]).map(([field, label, value]) => (
                <label key={field}>
                  <span>{label}</span>
                  <input
                    disabled={isSaving}
                    aria-label={label}
                    type="number"
                    step="1"
                    value={value}
                    onChange={(event) => void editOpeningNumber(field, event.target.value)}
                  />
                </label>
              ))}
              {selectedOpening.kind !== "passage" ? (
                <label>
                  <span>{selectedOpening.kind === "door" ? "Door operation" : "Window operation"}</span>
                  <select
                    disabled={isSaving}
                    aria-label={selectedOpening.kind === "door" ? "Door operation" : "Window operation"}
                    value={selectedOpening.operation.kind}
                    onChange={(event) => {
                      const kind = event.target.value;
                      void editOpening({
                        operation: kind === "fixed"
                          ? { kind: "fixed" }
                          : kind === "hinged"
                            ? { kind: "hinged", hingeSide: "start", swingDirection: "inward" }
                            : { kind: "sliding", slideDirection: "start" }
                      });
                    }}
                  >
                    {selectedOpening.kind === "window" ? <option value="fixed">Fixed</option> : null}
                    <option value="hinged">Hinged</option>
                    <option value="sliding">Sliding</option>
                  </select>
                </label>
              ) : null}
              {selectedOpening.kind !== "passage"
              && selectedOpening.operation.kind === "hinged" ? (
                <>
                  <label>
                    <span>Hinge side</span>
                    <select
                      disabled={isSaving}
                      aria-label="Hinge side"
                      value={selectedOpening.operation.hingeSide}
                      onChange={(event) => void editOpening({
                        operation: {
                          kind: "hinged",
                          hingeSide: event.target.value as "start" | "end",
                          swingDirection: selectedOpening.operation.kind === "hinged"
                            ? selectedOpening.operation.swingDirection
                            : "inward"
                        }
                      })}
                    >
                      <option value="start">Wall path start</option>
                      <option value="end">Wall path end</option>
                    </select>
                  </label>
                  <label>
                    <span>Swing direction</span>
                    <select
                      disabled={isSaving}
                      aria-label="Swing direction"
                      value={selectedOpening.operation.swingDirection}
                      onChange={(event) => void editOpening({
                        operation: {
                          kind: "hinged",
                          hingeSide: selectedOpening.operation.kind === "hinged"
                            ? selectedOpening.operation.hingeSide
                            : "start",
                          swingDirection: event.target.value as "inward" | "outward"
                        }
                      })}
                    >
                      <option value="inward">Inward</option>
                      <option value="outward">Outward</option>
                    </select>
                  </label>
                </>
              ) : null}
              {selectedOpening.kind !== "passage"
              && selectedOpening.operation.kind === "sliding" ? (
                <label>
                  <span>Slide direction</span>
                  <select
                    disabled={isSaving}
                    aria-label="Slide direction"
                    value={selectedOpening.operation.slideDirection}
                    onChange={(event) => void editOpening({
                      operation: {
                        kind: "sliding",
                        slideDirection: event.target.value as "start" | "end"
                      }
                    })}
                  >
                    <option value="start">Toward Wall path start</option>
                    <option value="end">Toward Wall path end</option>
                  </select>
                </label>
              ) : null}
              <button
                type="button"
                className="danger-button"
                disabled={isSaving}
                onClick={async () => {
                  if (await commit(workspace.deleteOpening(selectedOpening.id))) {
                    setSelectedOpeningId(undefined);
                  }
                }}
              >
                Delete opening
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
