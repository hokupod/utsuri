import { describe, expect, test } from "bun:test";
import { extractChangedRegions } from "./regions";

describe("extractChangedRegions", () => {
  test("labels components, removes isolated pixels, and merges nearby boxes", () => {
    const width = 12;
    const mask = new Uint8Array(width * 5);
    for (const [x, y] of [
      [1, 1],
      [2, 1],
      [7, 1],
      [8, 1],
      [11, 4]
    ]) {
      mask[y! * width + x!] = 1;
    }
    expect(extractChangedRegions(mask, width, 5, { minimumPixels: 2, mergeDistance: 5 })).toEqual([
      expect.objectContaining({ x: 1, y: 1, width: 8, height: 1, pixels: 4 })
    ]);
  });

  test("rejects a mask with mismatched dimensions", () => {
    expect(() => extractChangedRegions(new Uint8Array(3), 2, 2)).toThrow(
      "Pixel mask dimensions do not match"
    );
  });
});
