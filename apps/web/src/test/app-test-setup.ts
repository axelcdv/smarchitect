import "@testing-library/jest-dom/vitest";
import "fake-indexeddb/auto";
import {
  act,
  cleanup,
  fireEvent,
  screen
} from "@testing-library/react";
import type { ProjectHistorySnapshot } from "@smarchitect/core";
import { afterEach, beforeEach, vi } from "vitest";
import type { ProjectRepository } from "../project-persistence.js";

export class FailableProjectRepository implements ProjectRepository {
  snapshot?: ProjectHistorySnapshot & { draft?: string };
  failSaving = false;
  saveAttempts = 0;

  async load(): Promise<(ProjectHistorySnapshot & { draft?: string }) | undefined> {
    return this.snapshot ? structuredClone(this.snapshot) : undefined;
  }

  async save(snapshot: ProjectHistorySnapshot & { draft?: string }): Promise<void> {
    this.saveAttempts += 1;
    if (this.failSaving) throw new Error("storage unavailable");
    this.snapshot = structuredClone(snapshot);
  }
}

export function setPlanBounds(plan: HTMLElement): void {
  Object.defineProperty(plan, "getBoundingClientRect", {
    value: () => ({
      left: 0,
      top: 0,
      width: 800,
      height: 520,
      right: 800,
      bottom: 520,
      x: 0,
      y: 0,
      toJSON: () => ({})
    })
  });
}

export async function drawDefaultWall(plan: HTMLElement): Promise<void> {
  setPlanBounds(plan);
  fireEvent.pointerDown(plan, { clientX: 100, clientY: 260 });
  fireEvent.pointerUp(plan, { clientX: 400, clientY: 260 });
  await screen.findByText("1 wall");
  await act(async () => {
    await new Promise((resolve) => setTimeout(resolve, 0));
  });
}

beforeEach(async () => {
  await new Promise<void>((resolve, reject) => {
    const request = indexedDB.deleteDatabase("smarchitect");
    request.addEventListener("success", () => resolve());
    request.addEventListener("error", () => reject(request.error));
  });
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
});
