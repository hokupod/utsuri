import type { DiscoveryConfidence, DiscoverySource } from "@utsu-ri/adapter-generic";

export interface DiscoveryCandidate {
  id: string;
  targetId: string;
  targetRefs: string[];
  source: DiscoverySource;
  confidence: DiscoveryConfidence;
  reason: string;
  knownUsageCount: number;
  changeRefs: string[];
  hunkRefs: string[];
}

export interface DiscoveryCoverage {
  knownUsages: number | null;
  verifiedUsages: number;
  unknownPossible: boolean;
  planned: number;
  succeeded: number;
  failed: number;
}

export interface DiscoveryManifest {
  schemaVersion: "1.0";
  captureHash: string;
  diffHash: string | null;
  candidates: DiscoveryCandidate[];
  unmappedChangeRefs: string[];
  coverage: DiscoveryCoverage;
  discoveryHash: string;
}

export interface DiscoverRunResult {
  manifest: DiscoveryManifest;
  manifestPath: string;
}
