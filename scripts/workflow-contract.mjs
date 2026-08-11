import { parseDocument } from "yaml";

function isRecord(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function exactRecord(value, expected) {
  if (!isRecord(value)) return false;
  const keys = Object.keys(value).sort();
  const expectedKeys = Object.keys(expected).sort();
  return (
    keys.length === expectedKeys.length &&
    keys.every((key, index) => key === expectedKeys[index] && value[key] === expected[key])
  );
}

function unexpectedKeys(value, allowed) {
  return Object.keys(value).filter((key) => !allowed.has(key));
}

function parseWorkflow(relativePath, text) {
  try {
    const document = parseDocument(text, { uniqueKeys: true });
    if (document.errors.length > 0) {
      return {
        errors: [`${relativePath} is not valid YAML: ${document.errors[0].message}`]
      };
    }
    const workflow = document.toJS({ maxAliasCount: 0 });
    if (!isRecord(workflow) || !isRecord(workflow.jobs)) {
      return { errors: [`${relativePath} must define a jobs mapping`] };
    }
    return { errors: [], workflow };
  } catch (error) {
    return { errors: [`${relativePath} is not valid bounded YAML: ${error.message}`] };
  }
}

function actionReferences(workflow) {
  const references = [];
  for (const [jobName, job] of Object.entries(workflow.jobs)) {
    if (!isRecord(job)) continue;
    if (Object.hasOwn(job, "uses")) references.push([`job ${jobName}`, job.uses]);
    if (!Array.isArray(job.steps)) continue;
    for (const [index, step] of job.steps.entries()) {
      if (isRecord(step) && Object.hasOwn(step, "uses")) {
        references.push([`job ${jobName} step ${index + 1}`, step.uses]);
      }
    }
  }
  return references;
}

export function fullShaActionErrors(relativePath, text, { allowedLocalReferences = [] } = {}) {
  const parsed = parseWorkflow(relativePath, text);
  if (!parsed.workflow) return parsed.errors;

  const references = actionReferences(parsed.workflow);
  if (references.length === 0) {
    return [`${relativePath} must contain at least one verifiable action reference`];
  }

  const allowedLocal = new Set(allowedLocalReferences);
  const externalAction =
    /^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+(?:\/[A-Za-z0-9_.-]+)*@[a-fA-F0-9]{40}$/u;
  const errors = [];
  for (const [location, reference] of references) {
    if (typeof reference !== "string") {
      errors.push(`${relativePath} ${location} action reference must be a string`);
    } else if (reference.startsWith("./")) {
      if (!allowedLocal.has(reference)) {
        errors.push(`${relativePath} ${location} uses an unapproved local action: ${reference}`);
      }
    } else if (!externalAction.test(reference)) {
      errors.push(`${relativePath} ${location} action is not pinned to a full SHA: ${reference}`);
    }
  }
  return errors;
}

export function readOnlyPermissionErrors(relativePath, text) {
  const parsed = parseWorkflow(relativePath, text);
  if (!parsed.workflow) return parsed.errors;

  const errors = [];
  const topLevel = parsed.workflow.permissions;
  if (!isRecord(topLevel) || topLevel.contents !== "read") {
    errors.push(`${relativePath} must declare exact top-level contents: read permission`);
  }
  validateReadOnlyPermissions(relativePath, "top-level", topLevel, errors);

  for (const [jobName, job] of Object.entries(parsed.workflow.jobs)) {
    if (!isRecord(job) || !Object.hasOwn(job, "permissions")) continue;
    validateReadOnlyPermissions(relativePath, `job ${jobName}`, job.permissions, errors);
  }
  return errors;
}

function validateReadOnlyPermissions(relativePath, location, permissions, errors) {
  if (!isRecord(permissions)) {
    errors.push(`${relativePath} ${location} permissions must be a mapping`);
    return;
  }
  for (const [name, access] of Object.entries(permissions)) {
    if (access !== "read" && access !== "none") {
      errors.push(`${relativePath} ${location} ${name} permission is not read-only`);
    }
  }
}

export function publishedCliSmokeErrors(relativePath, text) {
  const parsed = parseWorkflow(relativePath, text);
  if (!parsed.workflow) return parsed.errors;

  const errors = [];
  for (const key of ["env", "defaults"]) {
    if (Object.hasOwn(parsed.workflow, key)) {
      errors.push(`${relativePath} must not define top-level ${key}`);
    }
  }

  const job = parsed.workflow.jobs["published-smoke"];
  if (!isRecord(job)) return [...errors, `${relativePath} must define the published-smoke job`];
  if (!Array.isArray(job.steps)) {
    return [...errors, `${relativePath} published-smoke job must define steps`];
  }
  const extraJobKeys = unexpectedKeys(job, new Set(["name", "needs", "runs-on", "steps"]));
  if (extraJobKeys.length > 0) {
    errors.push(
      `${relativePath} published-smoke job has unapproved keys: ${extraJobKeys.join(", ")}`
    );
  }
  if (job.needs !== "publish" || job["runs-on"] !== "ubuntu-24.04") {
    errors.push(`${relativePath} published-smoke job has the wrong runner or dependency`);
  }

  const expectedActions = [
    {
      action: "actions/checkout",
      with: { "persist-credentials": false }
    },
    {
      action: "actions/setup-node",
      with: { "node-version": 24, "package-manager-cache": false }
    },
    {
      action: "oven-sh/setup-bun",
      with: { "bun-version": "1.3.14" }
    }
  ];
  let actionIndex = 0;
  let verifierCount = 0;

  for (const [index, step] of job.steps.entries()) {
    if (!isRecord(step)) {
      errors.push(`${relativePath} published-smoke step ${index + 1} must be a mapping`);
      continue;
    }
    const hasUses = Object.hasOwn(step, "uses");
    const hasRun = Object.hasOwn(step, "run");
    if (hasUses === hasRun) {
      errors.push(
        `${relativePath} published-smoke step ${index + 1} must define exactly one of uses or run`
      );
      continue;
    }

    const allowedStepKeys = hasUses ? new Set(["name", "uses", "with"]) : new Set(["name", "run"]);
    const extraStepKeys = unexpectedKeys(step, allowedStepKeys);
    if (extraStepKeys.length > 0) {
      errors.push(
        `${relativePath} published-smoke step ${index + 1} has unapproved keys: ${extraStepKeys.join(", ")}`
      );
    }

    if (hasUses) {
      const reference = step.uses;
      const separator = typeof reference === "string" ? reference.lastIndexOf("@") : -1;
      const action = separator === -1 ? "" : reference.slice(0, separator);
      const expected = expectedActions[actionIndex];
      if (!expected || action !== expected.action || !exactRecord(step.with, expected.with)) {
        errors.push(
          `${relativePath} published-smoke step ${index + 1} has the wrong setup action or inputs`
        );
      }
      actionIndex += 1;
      if (verifierCount > 0) {
        errors.push(`${relativePath} published-smoke must end with the published CLI verifier`);
      }
      continue;
    }

    if (
      typeof step.run !== "string" ||
      step.run.trim() !== "node scripts/verify-published-cli.mjs --version-from-package"
    ) {
      errors.push(
        `${relativePath} published-smoke step ${index + 1} contains an unapproved command`
      );
    } else {
      verifierCount += 1;
      if (index !== job.steps.length - 1) {
        errors.push(`${relativePath} published-smoke must end with the published CLI verifier`);
      }
    }
  }

  if (actionIndex !== expectedActions.length) {
    errors.push(`${relativePath} published-smoke must use the exact setup action sequence`);
  }
  if (verifierCount !== 1) {
    errors.push(`${relativePath} published-smoke must run the published CLI verifier exactly once`);
  }
  return errors;
}
