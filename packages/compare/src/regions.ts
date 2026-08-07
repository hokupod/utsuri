import { stableId } from "@utsu-ri/core";
import type { ChangedRegion } from "./types";

interface MutableRegion {
  minX: number;
  minY: number;
  maxX: number;
  maxY: number;
  pixels: number;
}

function touches(left: MutableRegion, right: MutableRegion, distance: number): boolean {
  return !(
    left.maxX + distance < right.minX ||
    right.maxX + distance < left.minX ||
    left.maxY + distance < right.minY ||
    right.maxY + distance < left.minY
  );
}

function merge(left: MutableRegion, right: MutableRegion): MutableRegion {
  return {
    minX: Math.min(left.minX, right.minX),
    minY: Math.min(left.minY, right.minY),
    maxX: Math.max(left.maxX, right.maxX),
    maxY: Math.max(left.maxY, right.maxY),
    pixels: left.pixels + right.pixels
  };
}

export function extractChangedRegions(
  mask: Uint8Array,
  width: number,
  height: number,
  options: { minimumPixels?: number; mergeDistance?: number } = {}
): ChangedRegion[] {
  if (mask.length !== width * height) throw new TypeError("Pixel mask dimensions do not match");
  const minimumPixels = options.minimumPixels ?? 2;
  const mergeDistance = options.mergeDistance ?? 4;
  const visited = new Uint8Array(mask.length);
  const components: MutableRegion[] = [];

  for (let start = 0; start < mask.length; start += 1) {
    if (mask[start] === 0 || visited[start] === 1) continue;
    const queue = [start];
    visited[start] = 1;
    const x = start % width;
    const y = Math.floor(start / width);
    const region: MutableRegion = { minX: x, minY: y, maxX: x, maxY: y, pixels: 0 };

    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const index = queue[cursor]!;
      const currentX = index % width;
      const currentY = Math.floor(index / width);
      region.minX = Math.min(region.minX, currentX);
      region.minY = Math.min(region.minY, currentY);
      region.maxX = Math.max(region.maxX, currentX);
      region.maxY = Math.max(region.maxY, currentY);
      region.pixels += 1;

      for (let offsetY = -1; offsetY <= 1; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          if (offsetX === 0 && offsetY === 0) continue;
          const nextX = currentX + offsetX;
          const nextY = currentY + offsetY;
          if (nextX < 0 || nextX >= width || nextY < 0 || nextY >= height) continue;
          const next = nextY * width + nextX;
          if (mask[next] === 1 && visited[next] === 0) {
            visited[next] = 1;
            queue.push(next);
          }
        }
      }
    }
    if (region.pixels >= minimumPixels) components.push(region);
  }

  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let left = 0; left < components.length; left += 1) {
      for (let right = left + 1; right < components.length; right += 1) {
        if (!touches(components[left]!, components[right]!, mergeDistance)) continue;
        components[left] = merge(components[left]!, components[right]!);
        components.splice(right, 1);
        changed = true;
        break outer;
      }
    }
  }

  return components
    .map((region) => ({
      id: stableId("region", region, 12),
      x: region.minX,
      y: region.minY,
      width: region.maxX - region.minX + 1,
      height: region.maxY - region.minY + 1,
      pixels: region.pixels
    }))
    .sort((left, right) => right.pixels - left.pixels || left.y - right.y || left.x - right.x);
}
