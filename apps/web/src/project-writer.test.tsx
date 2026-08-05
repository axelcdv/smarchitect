// @vitest-environment jsdom

import { renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useProjectWriter } from "./project-writer.js";

let releaseActiveWriter: (() => void) | undefined;
const originalLocks = Object.getOwnPropertyDescriptor(navigator, "locks");

afterEach(() => {
  releaseActiveWriter?.();
  releaseActiveWriter = undefined;
  if (originalLocks) Object.defineProperty(navigator, "locks", originalLocks);
  else Reflect.deleteProperty(navigator, "locks");
});

describe("project writer", () => {
  it("makes another context read-only while a project writer holds its lock", async () => {
    let held = false;
    Object.defineProperty(navigator, "locks", {
      configurable: true,
      value: {
        request: async (
          _name: string,
          _options: LockOptions,
          callback: (lock: Lock | null) => Promise<void>
        ) => {
          if (held) return callback(null);
          held = true;
          await callback({ name: "smarchitect-project:test", mode: "exclusive" });
          held = false;
        }
      }
    });
    const first = renderHook(() => useProjectWriter("test", async () => undefined));
    await waitFor(() => expect(first.result.current.state).toBe("writer"));
    const second = renderHook(() => useProjectWriter("test", async () => undefined));
    await waitFor(() => expect(second.result.current.state).toBe("readonly"));
    expect(second.result.current.canWrite).toBe(false);
  });
});
