import { type ProjectWorkspace } from "@smarchitect/core";
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
  const [workspace, setWorkspace] = useState<ProjectWorkspace>();
  const [yaml, setYaml] = useState("");
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
    setWorkspace(next);
    setYaml(next.exportYaml());
    setPersistenceError("");
  }

  useEffect(() => {
    let active = true;
    void AutosavedProject.restore(repositoryRef.current!)
      .then((restored) => {
        if (!active || !restored || projectRef.current) return;
        projectRef.current = restored;
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

  return {
    workspace,
    yaml,
    persistenceError,
    isSaving,
    canUndo: historyControls.canUndo,
    canRedo: historyControls.canRedo,
    commit,
    startAutosave,
    navigateHistory,
    isTransitionPending: () => transitionPending.current
  };
}
