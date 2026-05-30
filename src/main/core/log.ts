import { appendFileSync } from "node:fs";
import { join } from "node:path";

let _logPath: string | null = null;

export function initLogger(projectRoot: string): void {
  // Write error log to project root so we can read it directly
  _logPath = join(projectRoot, "error.log");
}

export function logError(context: string, error: unknown): void {
  const timestamp = new Date().toISOString();
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  const line = `[${timestamp}] ${context}: ${message}\n`;

  process.stderr.write(line);

  if (_logPath) {
    try {
      appendFileSync(_logPath, line, "utf8");
    } catch {
      // Can't write the log — nothing we can do
    }
  }
}
