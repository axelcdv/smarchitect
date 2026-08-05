import { useCallback, useEffect, useRef, useState } from "react";

export type ProjectWriterState = "acquiring" | "writer" | "readonly" | "unsupported";

interface WriterMessage {
  projectId: string;
  type: "takeover-request" | "writer-released";
}

/** Keeps the Web Lock alive until this tab explicitly yields it or unloads. */
export function useProjectWriter(
  projectId: string | undefined,
  flushAutosave: () => Promise<void>
) {
  const [state, setState] = useState<ProjectWriterState>("acquiring");
  const release = useRef<(() => void) | undefined>(undefined);
  const channel = useRef<BroadcastChannel | undefined>(undefined);
  const flush = useRef(flushAutosave);
  flush.current = flushAutosave;
  const retry = useRef<(() => void) | undefined>(undefined);

  const acquire = useCallback(() => {
    if (!projectId) {
      setState("writer");
      return;
    }
    if (!("locks" in navigator)) {
      // Older/best-effort environments remain usable, but Chrome always uses a lock.
      setState("unsupported");
      return;
    }
    setState("acquiring");
    void navigator.locks.request(
      `smarchitect-project:${projectId}`,
      { ifAvailable: true },
      async (lock) => {
        if (!lock) {
          setState("readonly");
          // Locks released by a crashed tab have no BroadcastChannel message.
          window.setTimeout(() => retry.current?.(), 1_000);
          return;
        }
        setState("writer");
        await new Promise<void>((resolve) => {
          release.current = resolve;
        });
        release.current = undefined;
      }
    ).catch(() => setState("readonly"));
  }, [projectId]);

  useEffect(() => {
    release.current?.();
    if (!projectId) {
      setState("writer");
      return;
    }
    retry.current = acquire;
    acquire();
    if ("BroadcastChannel" in window) {
      const nextChannel = new BroadcastChannel("smarchitect-project-writer");
      channel.current = nextChannel;
      nextChannel.onmessage = (event: MessageEvent<WriterMessage>) => {
        const message = event.data;
        if (message.projectId !== projectId) return;
        if (message.type === "takeover-request" && release.current) {
          void flush.current().finally(() => {
            // Disable mutation controls before relinquishing the exclusive lock.
            setState("readonly");
            release.current?.();
            nextChannel.postMessage({ projectId, type: "writer-released" });
          });
        }
        if (message.type === "writer-released") retry.current?.();
      };
    }
    return () => {
      channel.current?.close();
      channel.current = undefined;
      retry.current = undefined;
      release.current?.();
    };
  }, [acquire, projectId]);

  const takeOver = useCallback(() => {
    if (!projectId || state !== "readonly") return;
    channel.current?.postMessage({ projectId, type: "takeover-request" });
    // A crashed writer has no channel to answer; retrying lets the browser release it.
    window.setTimeout(() => retry.current?.(), 250);
  }, [projectId, state]);

  return { state, takeOver, canWrite: state === "writer" || state === "unsupported" };
}
