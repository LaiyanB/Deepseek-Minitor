import { mkdtemp, readFile, rm, rmdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { UsageStore } from "../src/main/core/usage-store";

describe("UsageStore", () => {
  let tempDir = "";

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), "ds-usage-store-"));
  });

  afterEach(async () => {
    if (tempDir) {
      await rm(join(tempDir, "usage.json"), { force: true });
      await rmdir(tempDir);
    }
  });

  it("persists usage metadata without prompt, response, or raw API key text", async () => {
    const filePath = join(tempDir, "usage.json");
    const store = new UsageStore(filePath);

    await store.record({
      id: "evt_1",
      timestamp: "2026-05-10T12:00:00.000Z",
      model: "deepseek-v4-flash",
      apiKeyFingerprint: "sk-...abcd",
      statusCode: 200,
      durationMs: 120,
      usage: {
        promptTokens: 20,
        completionTokens: 5,
        totalTokens: 25,
        promptCacheHitTokens: 10,
        promptCacheMissTokens: 10
      },
      cost: {
        model: "deepseek-v4-flash",
        currency: "CNY",
        costCny: 0.000012,
        costUsd: 0
      }
    });

    const rawFile = await readFile(filePath, "utf8");

    expect(rawFile).toContain("promptTokens");
    expect(rawFile).not.toContain("secret-api-key");
    expect(rawFile).not.toContain("公司的代码");
    expect(rawFile).not.toContain("DeepSeek 的完整回答");
    expect(await store.list()).toHaveLength(1);
  });
});
