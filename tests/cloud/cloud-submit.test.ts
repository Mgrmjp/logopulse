import { describe, expect, it } from "vitest";
import { cloudSubmitCommand } from "../../src/commands/cloud-submit.js";

describe("cloudSubmitCommand", () => {
  it("requires an explicit git URL or published Docker image", async () => {
    await expect(
      cloudSubmitCommand({ config: "examples/visualizer.json" })
    ).rejects.toThrow(/requires either --git-url .* or --cloud-image/);
  });
});
