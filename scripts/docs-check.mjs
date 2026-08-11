#!/usr/bin/env node

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
  oldScope: "DOC_OLD_SCOPE",
  untranslatedCjk: "DOC_UNTRANSLATED_CJK",
  linkFileMissing: "DOC_LINK_FILE_MISSING",
  linkFragmentMissing: "DOC_LINK_FRAGMENT_MISSING",
  developerContent: "DOC_DEVELOPER_CONTENT",
  releaseVersion: "DOC_RELEASE_VERSION",
  supportOverclaim: "DOC_SUPPORT_OVERCLAIM",
  contributorLink: "DOC_CONTRIBUTOR_LINK"
};

function parseArguments(argv) {
  const result = { root: process.cwd() };
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--root") {
      const value = argv[index + 1];
      if (!value || value.startsWith("--")) throw new Error(`${argument} requires a value`);
      result[argument.slice(2)] = value;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${argument}`);
  }
  result.root = path.resolve(result.root);
  return result;
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

  function finish() {
    if (problems.length > 0) {
      for (const problem of problems) process.stderr.write(`${problem.id}: ${problem.message}\n`);
      process.exitCode = 1;
      return;
    }
    process.stdout.write(`${JSON.stringify({ ok: true, documents: publicDocuments.length })}\n`);
  }

  finish();
}

await main();
