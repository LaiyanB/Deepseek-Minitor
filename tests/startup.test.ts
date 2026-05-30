import { describe, expect, it, vi } from "vitest";
import { tryAutoStartProxy } from "../src/main/core/startup";

describe("tryAutoStartProxy", () => {
  it("continues startup when auto-start proxy fails", async () => {
    const onError = vi.fn();

    await expect(
      tryAutoStartProxy(true, async () => {
        throw new Error("EADDRINUSE");
      }, onError)
    ).resolves.toBeUndefined();

    expect(onError).toHaveBeenCalledOnce();
  });

  it("skips proxy startup when auto-start is disabled", async () => {
    const startProxy = vi.fn();

    await tryAutoStartProxy(false, startProxy);

    expect(startProxy).not.toHaveBeenCalled();
  });
});
