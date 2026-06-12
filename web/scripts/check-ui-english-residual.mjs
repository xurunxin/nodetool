import fs from "node:fs";
import path from "node:path";

const root = path.resolve("src");
const ignoredPathParts = [
  `${path.sep}__tests__${path.sep}`,
  `${path.sep}i18n${path.sep}locales${path.sep}`,
  `${path.sep}api.ts`
];

const allowedTerms = new Set([
  "NodeTool",
  "Workflow",
  "Node",
  "Model",
  "Asset",
  "Workspace",
  "Chat",
  "Provider",
  "API",
  "JSON",
  "URL",
  "HTTP",
  "WebSocket",
  "OpenAI",
  "Anthropic",
  "HuggingFace",
  "Replicate",
  "StabilityAI"
]);

const stringLiteralPattern = /(["'`])([^"'`]*[A-Za-z][^"'`]*)\1/g;

const walk = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      return walk(full);
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) {
      return [];
    }
    return [full];
  });
};

const isIgnored = (file) =>
  ignoredPathParts.some((part) => file.includes(part));

const hasNonAllowedEnglish = (text) => {
  const words = text.match(/[A-Za-z][A-Za-z-]*/g) ?? [];
  return words.some((word) => !allowedTerms.has(word));
};

const findings = [];

for (const file of walk(root)) {
  if (isIgnored(file)) {
    continue;
  }
  const source = fs.readFileSync(file, "utf8");
  const lines = source.split(/\r?\n/);
  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index];
    for (const match of line.matchAll(stringLiteralPattern)) {
      const value = match[2];
      if (value.length < 4) {
        continue;
      }
      if (hasNonAllowedEnglish(value)) {
        findings.push(`${file}:${index + 1}: ${value}`);
      }
    }
  }
}

if (findings.length > 0) {
  console.log(findings.join("\n"));
  console.log(`\nEnglish residual candidates: ${findings.length}`);
} else {
  console.log("No English residual candidates found.");
}
