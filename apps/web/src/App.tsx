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
  type Wall
} from "@smarchitect/core";
import {
  useRef,
  useState,
  type ChangeEvent,
  type PointerEvent,
  type WheelEvent
} from "react";
import "./styles.css";

type WallEditField =
  | "startX" | "startY" | "endX" | "endY"
  | "lengthMm" | "angleDeg" | "thicknessMm" | "heightMm";

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
  const [yaml, setYaml] = useState("");
  const [error, setError] = useState("");
  const [selectedWallId, setSelectedWallId] = useState<string>();
  const [mode, setMode] = useState<"draw" | "select">("draw");
  const [view, setView] = useState({ x: -4000, y: -2600, width: 8000, height: 5200 });
  const [gesture, setGesture] = useState<
    | { kind: "draw"; start: PointMm }
    | { kind: "move"; wallId: string; start: PointMm }
    | { kind: "endpoint"; wallId: string; endpoint: "start" | "end" }
  >();
  const importInput = useRef<HTMLInputElement>(null);
  const document = workspace?.document;
  const activeLevel = workspace?.activeLevel;
  const diagnostics = workspace?.diagnostics ?? [];
  const walls = activeLevel?.walls ?? [];
  const selectedWall = walls.find(({ id }) => id === selectedWallId);

  function commit(next: ProjectWorkspace): void {
    setWorkspace(next);
    setYaml(next.exportYaml());
    setError("");
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
    if (wall) {
      setGesture({ kind: "move", wallId: wall.id, start: point });
    }
  }

  function finishPlanGesture(event: PointerEvent<SVGSVGElement>): void {
    if (!workspace || !gesture) return;
    const point = eventPoint(event);
    if (gesture.kind === "draw") {
      const exactSnap = snapPoint(point, walls, view.width / 80);
      const snapped = exactSnap.x !== point.x || exactSnap.y !== point.y
        ? exactSnap
        : snapAngle(gesture.start, point);
      if (snapped.x !== gesture.start.x || snapped.y !== gesture.start.y) {
        const next = workspace.addWall({ start: gesture.start, end: snapped });
        commit(next);
        setSelectedWallId(next.activeLevel.walls.at(-1)?.id);
        setMode("select");
      }
    } else if (gesture.kind === "move") {
      const wall = walls.find(({ id }) => id === gesture.wallId);
      if (wall) {
        const delta = snapWallDelta(wall, {
          x: point.x - gesture.start.x,
          y: point.y - gesture.start.y
        }, walls.filter(({ id }) => id !== wall.id), view.width / 80);
        commit(workspace.moveWall(gesture.wallId, delta));
      }
    } else {
      const wall = walls.find(({ id }) => id === gesture.wallId);
      if (wall) {
        const other = gesture.endpoint === "start" ? wall.path.end : wall.path.start;
        const candidates = walls.filter(({ id }) => id !== wall.id);
        const snapped = snapPoint(point, candidates, view.width / 80);
        const hasExactSnap = snapped.x !== point.x || snapped.y !== point.y;
        commit(workspace.updateWall(wall.id, {
          [gesture.endpoint]: hasExactSnap ? snapped : snapAngle(other, point)
        }));
      }
    }
    setGesture(undefined);
  }

  function editSelected(field: WallEditField, value: string): void {
    if (!workspace || !selectedWall || !value) return;
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return;
    const update = field === "startX" ? { start: { ...selectedWall.path.start, x: Math.round(numeric) } }
      : field === "startY" ? { start: { ...selectedWall.path.start, y: Math.round(numeric) } }
      : field === "endX" ? { end: { ...selectedWall.path.end, x: Math.round(numeric) } }
      : field === "endY" ? { end: { ...selectedWall.path.end, y: Math.round(numeric) } }
      : { [field]: field === "angleDeg" ? numeric : Math.round(numeric) };
    commit(workspace.updateWall(selectedWall.id, update));
  }

  function createProject(): void {
    try {
      const created = ProjectWorkspace.create(draftName);
      setWorkspace(created);
      setYaml(created.exportYaml());
      setError("");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to create project.");
    }
  }

  function renameProject(event: ChangeEvent<HTMLInputElement>): void {
    if (!workspace) {
      return;
    }

    try {
      const renamedWorkspace = workspace.rename(event.target.value);
      setWorkspace(renamedWorkspace);
      setYaml(renamedWorkspace.exportYaml());
      setError("");
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
      setWorkspace(imported);
      setYaml(imported.exportYaml());
      setDraftName(imported.document.name);
      setError("");
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
              onChange={(event) => setDraftName(event.target.value)}
              placeholder="Our apartment"
            />
          </label>
          <div className="welcome-actions">
            <button
              className="primary-button"
              type="button"
              disabled={!draftName.trim()}
              onClick={createProject}
            >
              Create project
            </button>
            <button
              className="secondary-button"
              type="button"
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
            <input value={document.name} onChange={renameProject} />
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
            <button className={mode === "draw" ? "tool-active" : ""} type="button" onClick={() => setMode("draw")}>Draw wall</button>
            <button className={mode === "select" ? "tool-active" : ""} type="button" onClick={() => setMode("select")}>Select</button>
            <span>{walls.length} {walls.length === 1 ? "wall" : "walls"}</span>
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
                <label key={field}><span>{label}</span><input aria-label={label} type="number" step={field === "angleDeg" ? "any" : 1} value={value} onChange={(event) => editSelected(field, event.target.value)} /></label>
              ))}
              <button type="button" className="danger-button" onClick={() => {
                commit(workspace.deleteWall(selectedWall.id));
                setSelectedWallId(undefined);
              }}>Delete wall</button>
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
