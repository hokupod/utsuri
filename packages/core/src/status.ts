export const machineStatuses = [
  "PASS",
  "CHANGED",
  "REGRESSION",
  "INCOMPLETE",
  "UNCOVERED",
  "SKIPPED"
] as const;

export type MachineStatus = (typeof machineStatuses)[number];

export const findingSeverities = ["critical", "high", "medium", "low", "info"] as const;
export type FindingSeverity = (typeof findingSeverities)[number];

const statusPriority: Record<MachineStatus, number> = {
  REGRESSION: 60,
  INCOMPLETE: 50,
  UNCOVERED: 40,
  CHANGED: 30,
  SKIPPED: 20,
  PASS: 10
};

export function aggregateStatus(statuses: readonly MachineStatus[]): MachineStatus {
  if (statuses.length === 0) return "SKIPPED";
  return (
    [...statuses].sort((left, right) => statusPriority[right] - statusPriority[left])[0] ??
    "SKIPPED"
  );
}

export function queueForStatus(
  status: MachineStatus,
  options: { criticalIncomplete?: boolean; intended?: boolean } = {}
): "action-required" | "needs-confirmation" | "no-issue" {
  if (status === "REGRESSION" || (status === "INCOMPLETE" && options.criticalIncomplete)) {
    return "action-required";
  }
  if (status === "PASS" || (status === "CHANGED" && options.intended)) return "no-issue";
  return "needs-confirmation";
}
