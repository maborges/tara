import { pullSync } from "./pull";
import { pushSync } from "./push";

const INTERVAL_MS = 30_000;

let activeCycle: Promise<void> | undefined;
export async function runSyncCycle(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  if (activeCycle) return activeCycle;
  activeCycle = (async () => { await pushSync(); await pullSync(); })();
  try { await activeCycle; } finally { activeCycle = undefined; }
}

export function startSyncLoop(): () => void {
  if (typeof window === "undefined") return () => {};

  void runSyncCycle();
  const intervalId = setInterval(() => void runSyncCycle(), INTERVAL_MS);
  window.addEventListener("online", runSyncCycle);

  return () => {
    if (intervalId) clearInterval(intervalId);
    window.removeEventListener("online", runSyncCycle);
  };
}
