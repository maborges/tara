import { pullSync } from "./pull";
import { pushSync } from "./push";

const INTERVAL_MS = 30_000;

export async function runSyncCycle(): Promise<void> {
  if (typeof navigator !== "undefined" && !navigator.onLine) return;
  await pushSync();
  await pullSync();
}

let intervalId: ReturnType<typeof setInterval> | undefined;

export function startSyncLoop(): () => void {
  if (typeof window === "undefined") return () => {};

  void runSyncCycle();
  intervalId = setInterval(() => void runSyncCycle(), INTERVAL_MS);
  window.addEventListener("online", runSyncCycle);

  return () => {
    if (intervalId) clearInterval(intervalId);
    window.removeEventListener("online", runSyncCycle);
  };
}
