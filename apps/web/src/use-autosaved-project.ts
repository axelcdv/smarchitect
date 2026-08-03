import {
  parseProjectDocument,
  ProjectWorkspace,
  type Diagnostic
} from "@smarchitect/core";
import { useEffect, useRef, useState } from "react";
import {
  AutosavedProject,
  IndexedDbProjectRepository,
  SerializedProjectRepository,
  type ProjectRepository
} from "./project-persistence.js";

export type HistoryDirection = "undo" | "redo";

export function useAutosavedProject(repository?: ProjectRepository) {
  const repositoryRef = useRef<ProjectRepository | undefined>(undefined);
  repositoryRef.current ??= repository ?? new SerializedProjectRepository(
    new IndexedDbProjectRepository()
  );

  const projectRef = useRef<AutosavedProject | undefined>(undefined);
  const transitionPending = useRef(false);
  const activeYamlRef = useRef("");
  const yamlDraftRef = useRef<string | undefined>(undefined);
  const [workspace, setWorkspace] = useState<ProjectWorkspace>();
  const [yaml, setYaml] = useState("");
  const [yamlDiagnostics, setYamlDiagnostics] = useState<Diagnostic[]>([]);
  const [hasYamlDraft, setHasYamlDraft] = useState(false);
  const [persistenceError, setPersistenceError] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [historyControls, setHistoryControls] = useState({
    canUndo: false,
    canRedo: false
  });

  function refreshHistoryControls(project: AutosavedProject): void {
    setHistoryControls({
      canUndo: project.canUndo,
      canRedo: project.canRedo
    });
  }

  function show(next: ProjectWorkspace): void {
    const activeYaml = next.exportYaml();
    activeYamlRef.current = activeYaml;
    setWorkspace(next);
    if (yamlDraftRef.current === undefined) setYaml(activeYaml);
    setPersistenceError("");
  }

  useEffect(() => {
    let active = true;
    void AutosavedProject.restore(repositoryRef.current!)
      .then((restored) => {
        if (!active || !restored || projectRef.current) return;
        projectRef.current = restored;
        const activeYaml = restored.workspace.exportYaml();
        activeYamlRef.current = activeYaml;
        yamlDraftRef.current = restored.draft === activeYaml
          ? undefined
          : restored.draft;
        setHasYamlDraft(yamlDraftRef.current !== undefined);
        setYaml(yamlDraftRef.current ?? activeYaml);
        setYamlDiagnostics(yamlDraftRef.current === undefined
          ? []
          : parseProjectDocument(yamlDraftRef.current).diagnostics);
        show(restored.workspace);
        refreshHistoryControls(restored);
      })
      .catch(() => {
        if (active && !projectRef.current) {
          setPersistenceError(
            "Local recovery is unavailable. New edits may not survive reload."
          );
        }
      });
    return () => {
      active = false;
    };
  }, []);

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
      setPersistenceError(cause instanceof Error
        ? `Autosave failed: ${cause.message}`
        : "Autosave failed. The edit was not accepted.");
      return undefined;
    } finally {
      transitionPending.current = false;
      setIsSaving(false);
    }
  }

  async function commit(
    next: ProjectWorkspace
  ): Promise<ProjectWorkspace | undefined> {
    if (yamlDraftRef.current !== undefined) return undefined;
    const project = projectRef.current;
    if (!project) return undefined;
    const durable = await persist(() => project.accept(next));
    if (durable) refreshHistoryControls(project);
    return durable;
  }

  async function startAutosave(next: ProjectWorkspace): Promise<boolean> {
    const durable = await persist(async () => {
      const project = await AutosavedProject.create(next, repositoryRef.current!);
      projectRef.current = project;
      refreshHistoryControls(project);
      return project.workspace;
    });
    return durable !== undefined;
  }

  async function navigateHistory(
    direction: HistoryDirection
  ): Promise<ProjectWorkspace | undefined> {
    const project = projectRef.current;
    if (!project) return undefined;
    const restored = await persist(
      () => direction === "undo" ? project.undo() : project.redo()
    );
    if (restored) refreshHistoryControls(project);
    return restored;
  }

  function editYaml(next: string): void {
    const project = projectRef.current;
    const draft = next === activeYamlRef.current ? undefined : next;
    yamlDraftRef.current = draft;
    setYaml(next);
    setHasYamlDraft(draft !== undefined);
    setYamlDiagnostics(draft === undefined
      ? []
      : parseProjectDocument(next).diagnostics);
    if (!project) return;
    void project.saveDraft(draft).then(
      () => setPersistenceError(""),
      (cause: unknown) => setPersistenceError(cause instanceof Error
        ? `Autosave failed: ${cause.message}`
        : "Autosave failed. The YAML draft may not survive reload.")
    );
  }

  async function applyYaml(): Promise<ProjectWorkspace | undefined> {
    const project = projectRef.current;
    const draft = yamlDraftRef.current;
    if (!project || draft === undefined) return undefined;
    const parsed = parseProjectDocument(draft);
    setYamlDiagnostics(parsed.diagnostics);
    if (!parsed.document || parsed.diagnostics.length) return undefined;

    const imported = ProjectWorkspace.importYaml(draft);
    const durable = await persist(() => project.acceptDraft(imported));
    if (!durable) return undefined;
    yamlDraftRef.current = undefined;
    setHasYamlDraft(false);
    setYamlDiagnostics([]);
    const activeYaml = durable.exportYaml();
    activeYamlRef.current = activeYaml;
    setYaml(activeYaml);
    refreshHistoryControls(project);
    return durable;
  }

  return {
    workspace,
    yaml,
    yamlDiagnostics,
    hasYamlDraft,
    persistenceError,
    isSaving,
    canUndo: historyControls.canUndo,
    canRedo: historyControls.canRedo,
    commit,
    startAutosave,
    navigateHistory,
    editYaml,
    applyYaml,
    isTransitionPending: () => transitionPending.current
  };
}
