#!/usr/bin/env node

import { createHash } from "node:crypto";
import { access, readFile } from "node:fs/promises";
import path from "node:path";

const FALLBACK = {
  fileMissing: "DOC_FILE_MISSING",
  languageMetadata: "DOC_LANGUAGE_METADATA",
  switcherMismatch: "DOC_SWITCHER_MISMATCH",
  sectionMissing: "DOC_SECTION_MISSING",
  sectionDuplicate: "DOC_SECTION_DUPLICATE",
  commandMissing: "DOC_COMMAND_MISSING",
  commandDrift: "DOC_COMMAND_DRIFT",
  headingManifest: "DOC_HEADING_MANIFEST_MISMATCH",
  oldScope: "DOC_OLD_SCOPE",
  untranslatedCjk: "DOC_UNTRANSLATED_CJK",
  linkFileMissing: "DOC_LINK_FILE_MISSING",
  linkFragmentMissing: "DOC_LINK_FRAGMENT_MISSING",
  versionMismatch: "DOC_VERSION_MISMATCH",
  changeLogMissing: "DOC_CHANGELOG_MISSING",
  lastUpdatedMismatch: "DOC_LAST_UPDATED_MISMATCH",
  phaseMismatch: "DOC_PHASE_MISMATCH",
  hashStale: "DOC_HASH_STALE",
  availabilityMismatch: "DOC_AVAILABILITY_MISMATCH",
  placeholder: "DOC_PLACEHOLDER",
  humanReviewStale: "DOC_HUMAN_REVIEW_STALE",
  reviewEvidenceMissing: "DOC_REVIEW_EVIDENCE_MISSING",
  reviewEvidenceHash: "DOC_REVIEW_EVIDENCE_HASH",
  developerContent: "DOC_DEVELOPER_CONTENT",
  releaseVersion: "DOC_RELEASE_VERSION",
  supportOverclaim: "DOC_SUPPORT_OVERCLAIM",
  contributorLink: "DOC_CONTRIBUTOR_LINK"
};

function parseArguments(argv) {
  const result = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--mode" || argument === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      result[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  if (!["bootstrap", "development", "release-candidate"].includes(result.mode)) {
    throw new Error("--mode must be bootstrap, development, or release-candidate");
  }
  result.root = path.resolve(result.root);
  return result;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function countExact(haystack, needle) {
  if (!needle) return 0;
  let count = 0;
  let offset = 0;
  while ((offset = haystack.indexOf(needle, offset)) !== -1) {
    count += 1;
    offset += needle.length;
  }
  return count;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

function stripFencedCode(markdown) {
  const output = [];
  let fence = null;
  for (const line of markdown.split(/\r?\n/u)) {
    const match = line.match(/^ {0,3}(`{3,}|~{3,})/u);
    if (match) {
      const marker = match[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence === null) output.push(line);
  }
  return output.join("\n");
}

function extractHeadings(markdown) {
  const entries = [];
  let fence = null;
  for (const line of markdown.split(/\r?\n/u)) {
    const fenceMatch = line.match(/^ {0,3}(`{3,}|~{3,})/u);
    if (fenceMatch) {
      const marker = fenceMatch[1][0];
      if (fence === null) fence = marker;
      else if (fence === marker) fence = null;
      continue;
    }
    if (fence !== null) continue;
    const match = line.match(/^(#{2,6})\s+(\d+(?:\.\d+)*)\.?\s+(.+?)\s*$/u);
    if (!match) continue;
    const parts = match[2].split(".");
    entries.push({
      number: match[2],
      level: match[1].length,
      parent: parts.length === 1 ? null : parts.slice(0, -1).join("."),
      order: entries.length
    });
  }
  return entries;
}

function extractCommands(markdown) {
  const commands = new Map();
  const pattern = /<!-- sync-command:([a-z0-9-]+) -->\s*```[^\n]*\n([\s\S]*?)\n```/gu;
  for (const match of markdown.matchAll(pattern)) {
    commands.set(match[1], match[2].replace(/\r\n/gu, "\n"));
  }
  return commands;
}

function normalizeFragment(value) {
  return decodeURIComponent(value).trim();
}

function headingSlug(value) {
  return value
    .trim()
    .toLowerCase()
    .replace(/<[^>]+>/gu, "")
    .replace(/[`*_~]/gu, "")
    .replace(/[^\p{Letter}\p{Number}\s-]/gu, "")
    .replace(/\s+/gu, "-")
    .replace(/-+/gu, "-");
}

function hasFragment(markdown, fragment) {
  if (markdown.includes(`id="${fragment}"`) || markdown.includes(`id='${fragment}'`)) return true;
  for (const match of stripFencedCode(markdown).matchAll(/^#{1,6}\s+(.+)$/gmu)) {
    if (headingSlug(match[1]) === fragment) return true;
  }
  return false;
}

async function main() {
  let args;
  try {
    args = parseArguments(process.argv.slice(2));
  } catch (error) {
    process.stderr.write(`DOC_ARGUMENTS: ${error.message}\n`);
    process.exitCode = 1;
    return;
  }

  const problems = [];
  const report = (id, message) => problems.push({ id, message });
  const policyPath = path.join(args.root, "docs/documentation-policy.json");
  let policy;
  try {
    policy = JSON.parse(await readFile(policyPath, "utf8"));
  } catch (error) {
    report(FALLBACK.fileMissing, `cannot read docs/documentation-policy.json: ${error.message}`);
    finish();
    return;
  }
  const diagnostic = { ...FALLBACK, ...(policy.diagnostics ?? {}) };
  const contents = new Map();

  async function readRequired(relativePath) {
    if (contents.has(relativePath)) return contents.get(relativePath);
    try {
      const value = await readFile(path.join(args.root, relativePath), "utf8");
      contents.set(relativePath, value);
      return value;
    } catch (error) {
      report(diagnostic.fileMissing, `${relativePath}: ${error.code ?? error.message}`);
      return null;
    }
  }

  const designPath = policy.canonicalDesign.path;
  const design = await readRequired(designPath);
  const manifestText = await readRequired(policy.canonicalDesign.headingManifest);
  const readmes = [];
  for (const descriptor of policy.readmes) {
    readmes.push({ descriptor, content: await readRequired(descriptor.path) });
  }

  if (design !== null) {
    const languageLine = `- **Language**: ${policy.canonicalDesign.languageLabel}`;
    if (countExact(design, languageLine) !== 1) {
      report(
        diagnostic.languageMetadata,
        `${designPath}: expected exactly one canonical language marker`
      );
    }
    if (manifestText !== null) {
      try {
        const manifest = JSON.parse(manifestText);
        const actual = extractHeadings(design);
        const expected = (manifest.headings ?? []).map(({ number, level, parent, order }) => ({
          number,
          level,
          parent,
          order
        }));
        if (
          manifest.headingCount !== actual.length ||
          JSON.stringify(expected) !== JSON.stringify(actual)
        ) {
          report(diagnostic.headingManifest, `${designPath}: numbered heading structure drifted`);
        }
      } catch (error) {
        report(diagnostic.headingManifest, `cannot validate heading manifest: ${error.message}`);
      }
    }
  }

  const commandSets = [];
  for (const { descriptor, content } of readmes) {
    if (content === null) continue;
    const lines = content.split(/\r?\n/u);
    if (lines[0] !== descriptor.metadata) {
      report(
        diagnostic.languageMetadata,
        `${descriptor.path}: invalid first-line language metadata`
      );
    }
    const switcher = lines.slice(1).find((line) => line.trim() !== "");
    if (switcher !== policy.languageSwitcher) {
      report(diagnostic.switcherMismatch, `${descriptor.path}: language switcher mismatch`);
    }

    for (const marker of policy.requiredSectionMarkers) {
      const token = `<a id="${marker}"></a><!-- section:${marker} -->`;
      const count = countExact(content, token);
      if (count === 0) report(diagnostic.sectionMissing, `${descriptor.path}: ${marker}`);
      if (count > 1) report(diagnostic.sectionDuplicate, `${descriptor.path}: ${marker}`);
    }

    const commands = extractCommands(content);
    commandSets.push({ path: descriptor.path, commands });
    for (const id of policy.syncCommandIds) {
      if (!commands.has(id)) report(diagnostic.commandMissing, `${descriptor.path}: ${id}`);
    }

    if (countExact(content, policy.requiredSupportMarker ?? "") !== 1) {
      report(diagnostic.supportOverclaim, `${descriptor.path}: support contract marker`);
    }
    const supportBoundary = policy.requiredSupportBoundaryText?.[descriptor.language];
    if (!supportBoundary || !content.includes(supportBoundary)) {
      report(diagnostic.supportOverclaim, `${descriptor.path}: native Windows boundary`);
    }
    if (
      typeof policy.requiredContributorTarget !== "string" ||
      !content.includes(`](${policy.requiredContributorTarget})`)
    ) {
      report(diagnostic.contributorLink, `${descriptor.path}: contributor target`);
    }
    for (const literal of policy.forbiddenReadmeLiterals ?? []) {
      if (content.includes(literal)) {
        report(diagnostic.developerContent, `${descriptor.path}: ${literal}`);
      }
    }
    for (const pattern of policy.forbiddenReadmePatterns ?? []) {
      let matcher;
      try {
        matcher = new RegExp(pattern, "u");
      } catch (error) {
        report(diagnostic.releaseVersion, `invalid README release pattern: ${error.message}`);
        continue;
      }
      if (matcher.test(content)) {
        report(diagnostic.releaseVersion, `${descriptor.path}: release number must be canonical`);
      }
    }
  }

  const baselineCommands = commandSets[0]?.commands;
  if (baselineCommands) {
    for (const { path: readmePath, commands } of commandSets.slice(1)) {
      for (const id of policy.syncCommandIds) {
        if (commands.get(id) !== baselineCommands.get(id)) {
          report(diagnostic.commandDrift, `${readmePath}: ${id}`);
        }
      }
    }
  }

  const publicDocuments = [
    ...(design === null ? [] : [{ path: designPath, content: design }]),
    ...readmes
      .filter(({ content }) => content !== null)
      .map(({ descriptor, content }) => ({ path: descriptor.path, content }))
  ];
  const reviewDocuments = [...publicDocuments];
  for (const reviewPath of policy.additionalReviewDocuments ?? []) {
    const content = await readRequired(reviewPath);
    if (content !== null) reviewDocuments.push({ path: reviewPath, content });
  }

  for (const document of publicDocuments) {
    for (const identifier of policy.forbiddenPublicIdentifiers) {
      if (document.content.includes(identifier)) {
        report(
          diagnostic.oldScope,
          `${document.path}: contains superseded identifier ${identifier}`
        );
      }
    }
  }

  const englishDocuments = publicDocuments.filter((document) => {
    if (document.path === designPath) return true;
    return policy.readmes.find((entry) => entry.path === document.path)?.language === "en";
  });
  const cjkPattern = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]/u;
  for (const document of englishDocuments) {
    let prose = stripFencedCode(document.content);
    prose = prose.replace(/<span\s+lang="(?:ja|zh-CN)">[\s\S]*?<\/span>/gu, "");
    for (const exact of policy.allowedEnglishCjk.readmeExactText ?? []) {
      prose = prose.replaceAll(exact, "");
    }
    if (policy.allowedEnglishCjk.stripMarkdownLinkDestinations) {
      prose = prose.replace(/\]\((?:[^()]|\([^)]*\))*\)/gu, "]()");
    }
    const lines = prose.split(/\r?\n/u);
    const index = lines.findIndex((line) => cjkPattern.test(line));
    if (index !== -1) {
      report(diagnostic.untranslatedCjk, `${document.path}:${index + 1}`);
    }
  }

  for (const document of publicDocuments) {
    const sourceWithoutCode = stripFencedCode(document.content);
    const links = sourceWithoutCode.matchAll(/!?\[[^\]]*\]\(([^)]+)\)/gu);
    for (const match of links) {
      let destination = match[1].trim();
      if (destination.startsWith("<") && destination.endsWith(">")) {
        destination = destination.slice(1, -1);
      }
      if (/^(?:https?:|mailto:|data:)/iu.test(destination)) continue;

      const hashIndex = destination.indexOf("#");
      const filePart = hashIndex === -1 ? destination : destination.slice(0, hashIndex);
      const fragmentPart = hashIndex === -1 ? "" : destination.slice(hashIndex + 1);
      const targetRelative = filePart
        ? path.normalize(path.join(path.dirname(document.path), decodeURIComponent(filePart)))
        : document.path;
      const targetAbsolute = path.join(args.root, targetRelative);
      try {
        await access(targetAbsolute);
      } catch {
        report(diagnostic.linkFileMissing, `${document.path}: ${destination}`);
        continue;
      }
      if (fragmentPart) {
        const targetContent = await readRequired(targetRelative);
        let fragment;
        try {
          fragment = normalizeFragment(fragmentPart);
        } catch {
          report(diagnostic.linkFragmentMissing, `${document.path}: invalid ${destination}`);
          continue;
        }
        if (targetContent !== null && !hasFragment(targetContent, fragment)) {
          report(diagnostic.linkFragmentMissing, `${document.path}: ${destination}`);
        }
      }
    }
  }

  if (args.mode !== "bootstrap") {
    const stateText = await readRequired("docs/documentation-state.json");
    if (stateText !== null && design !== null) {
      let state;
      try {
        state = JSON.parse(stateText);
      } catch (error) {
        report(diagnostic.hashStale, `invalid documentation state: ${error.message}`);
      }
      if (state) {
        const version = design.match(/^- \*\*Document version\*\*: (.+)$/mu)?.[1];
        const lastUpdated = design.match(/^- \*\*Last updated\*\*: (.+)$/mu)?.[1];
        if (version !== state.designVersion) {
          report(
            diagnostic.versionMismatch,
            `design ${version ?? "missing"} != state ${state.designVersion}`
          );
        }
        if (lastUpdated !== state.lastUpdated) {
          report(
            diagnostic.lastUpdatedMismatch,
            `design ${lastUpdated ?? "missing"} != state ${state.lastUpdated}`
          );
        }
        const changeLogEntryPattern =
          typeof state.changeLogEntryId === "string"
            ? new RegExp(`^\\|\\s*${escapeRegExp(state.changeLogEntryId)}\\s*\\|`, "mu")
            : null;
        if (!changeLogEntryPattern?.test(design)) {
          report(
            diagnostic.changeLogMissing,
            state.changeLogEntryId ?? "missing change-log entry ID"
          );
        }
        if (
          !Number.isInteger(state.currentPhase) ||
          state.currentPhase < 0 ||
          state.currentPhase > 6 ||
          typeof state.availability !== "string" ||
          !/^[a-z0-9]+(?:-[a-z0-9]+)+$/u.test(state.availability)
        ) {
          report(
            diagnostic.phaseMismatch,
            `documentation state is invalid: ${String(state.availability)}`
          );
        }

        const phaseAvailability = policy.phaseAvailability?.[String(state.currentPhase)];
        if (!Array.isArray(phaseAvailability) || !phaseAvailability.includes(state.availability)) {
          report(
            diagnostic.phaseMismatch,
            `phase ${String(state.currentPhase)} does not allow ${String(state.availability)}`
          );
        }

        const allowedAvailability = policy.modeRules?.[args.mode]?.allowedAvailability;
        if (
          args.mode === "release-candidate" &&
          (!Array.isArray(allowedAvailability) || !allowedAvailability.includes(state.availability))
        ) {
          report(
            diagnostic.availabilityMismatch,
            `release-candidate availability is not public: ${state.availability}`
          );
        }

        for (const document of reviewDocuments) {
          const expectedHash = state.currentHashes?.[document.path];
          const actualHash = sha256(document.content);
          if (expectedHash !== actualHash) {
            report(diagnostic.hashStale, `${document.path}: current hash differs from state`);
          }
        }

        const availabilities = readmes
          .filter(({ content }) => content !== null)
          .map(({ descriptor, content }) => ({
            path: descriptor.path,
            values: [...content.matchAll(/<!-- availability:([a-z0-9-]+) -->/gu)].map(
              (match) => match[1]
            )
          }));
        for (const item of availabilities) {
          if (item.values.length !== 1 || item.values[0] !== state.availability) {
            report(
              diagnostic.availabilityMismatch,
              `${item.path}: ${item.values.join(",") || "missing"}`
            );
          }
        }

        if (args.mode === "release-candidate") {
          if (!state.publicationMetadata?.publisher || !state.publicationMetadata?.spdxLicense) {
            report(diagnostic.placeholder, "publisher identity and SPDX license must be resolved");
          }
          for (const document of reviewDocuments) {
            const reviewed = state.humanReviewedHashes?.[document.path];
            const actual = sha256(document.content);
            if (reviewed !== actual) {
              report(diagnostic.humanReviewStale, `${document.path}: human-reviewed hash is stale`);
            }
          }
          if (!state.reviewEvidencePath) {
            report(diagnostic.reviewEvidenceMissing, "review evidence path is missing");
          } else {
            const evidence = await readRequired(state.reviewEvidencePath);
            if (evidence !== null && sha256(evidence) !== state.reviewEvidenceSha256) {
              report(diagnostic.reviewEvidenceHash, state.reviewEvidencePath);
            }
          }
          if (state.reviewedPhase !== state.currentPhase) {
            report(diagnostic.humanReviewStale, "reviewed Phase differs from current Phase");
          }
        }
      }
    }
  }

  function finish() {
    if (problems.length > 0) {
      for (const problem of problems) process.stderr.write(`${problem.id}: ${problem.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(
      `${JSON.stringify({ ok: true, mode: args.mode, documents: publicDocuments.length })}\n`
    );
  }

  finish();
}

await main();
