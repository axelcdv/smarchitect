import { useEffect, useState } from "react";

export function usePersistentStorage(active: boolean) {
  const [state, setState] = useState<"checking" | "persistent" | "temporary" | "unavailable">("checking");
  useEffect(() => {
    if (!active) return;
    if (!navigator.storage?.persist) {
      setState("unavailable");
      return;
    }
    void navigator.storage.persist().then(
      (granted) => setState(granted ? "persistent" : "temporary"),
      () => setState("unavailable")
    );
  }, [active]);
  return state;
}
