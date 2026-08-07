import { describe, expect, test } from "bun:test";
import { discoverExplicit, discoverFallback } from "@utsu-ri/adapter-generic";
import { discoverStorybook } from "@utsu-ri/adapter-storybook";

describe("discovery adapters", () => {
  const targets = [
    { id: "button", routeOrStory: "/button" },
    { id: "settings", routeOrStory: "/settings" }
  ];

  test("keeps explicit mapping data structured", () => {
    expect(
      discoverExplicit(
        [
          {
            targetId: "button",
            reason: "Configured design-system target.",
            changedPaths: ["./src/button.css"],
            knownUsageCount: 7
          }
        ],
        targets
      )
    ).toEqual([
      expect.objectContaining({
        targetId: "button",
        source: "explicit",
        confidence: "explicit",
        changedPaths: ["src/button.css"],
        knownUsageCount: 7
      })
    ]);
  });

  test("maps a changed Storybook import before generic fallback", () => {
    const storybook = discoverStorybook(
      {
        entries: {
          "button-primary": {
            title: "Button/Primary",
            importPath: "./src/button.css"
          }
        }
      },
      targets,
      new Set(["src/button.css"])
    );
    expect(storybook[0]).toEqual(
      expect.objectContaining({ targetId: "button", source: "storybook", confidence: "strong" })
    );
    expect(discoverFallback(targets)).toHaveLength(2);
  });
});
