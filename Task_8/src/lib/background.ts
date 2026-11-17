import { after } from "next/server";

/**
 * Runs work after the response is sent. On serverless hosts the platform keeps the function alive
 * for `after()` callbacks; a bare un-awaited promise can be frozen mid-flight. Falls back to a plain
 * promise outside a Next.js request (scripts and the test runner).
 */
export function runInBackground(fn: () => Promise<unknown>, taskName: string = "background-task"): void {
  const safeWork = async () => {
    try {
      await fn();
    } catch (err: any) {
      console.error(`[BACKGROUND_JOB_ERROR] [${taskName}]`, err?.message || err);
    }
  };

  try {
    after(safeWork);
    return;
  } catch {
    // Not inside a Next.js request context (tests, migration scripts)
  }
  safeWork();
}
