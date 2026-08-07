import { readFile } from "node:fs/promises";

export async function readValidatedArtifact(filename) {
  return readFile(filename);
}
