import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

describe("monitor window CSS", () => {
  it("keeps header controls clickable inside the draggable monitor header", async () => {
    const css = await readFile(join(process.cwd(), "src", "renderer", "monitor.css"), "utf8");

    expect(css).toMatch(/\.monitor-theme-switch\s*\{[^}]*-webkit-app-region:\s*no-drag;/s);
    expect(css).toMatch(/\.opacity-control\s*\{[^}]*-webkit-app-region:\s*no-drag;/s);
  });
});
