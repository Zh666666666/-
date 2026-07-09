import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const statusFile = "docs/PROJECT_STATUS.md";
const zeroSha = /^0+$/;

function git(args) {
  return execFileSync("git", args, { encoding: "utf8" }).trim();
}

function lines(value) {
  return value ? value.split(/\r?\n/).filter(Boolean) : [];
}

function getChangedFiles() {
  const base = process.env.STATUS_BASE_SHA;
  const head = process.env.STATUS_HEAD_SHA || "HEAD";

  if (base && !zeroSha.test(base)) {
    return lines(git(["diff", "--name-only", base, head]));
  }

  const working = new Set([
    ...lines(git(["diff", "--name-only", "HEAD"])),
    ...lines(git(["diff", "--cached", "--name-only"])),
    ...lines(git(["ls-files", "--others", "--exclude-standard"])),
  ]);

  if (working.size > 0) {
    return [...working];
  }

  try {
    return lines(git(["diff", "--name-only", "HEAD^", "HEAD"]));
  } catch {
    return [];
  }
}

function requiresStatusUpdate(file) {
  return (
    /^(src|prisma|supabase|public|scripts|hardware-gateway)\//.test(file) ||
    /^(\.devcontainer|\.github\/workflows)\//.test(file) ||
    /^(package(-lock)?\.json|next\.config\.[^.]+|middleware\.[^.]+|eslint\.config\.[^.]+|postcss\.config\.[^.]+|tsconfig\.json|components\.json)$/.test(
      file,
    )
  );
}

if (!existsSync(statusFile)) {
  console.error(`Missing required project status file: ${statusFile}`);
  process.exit(1);
}

const changedFiles = getChangedFiles();
const codeChanges = changedFiles.filter(requiresStatusUpdate);

if (codeChanges.length > 0 && !changedFiles.includes(statusFile)) {
  console.error(
    [
      "Code changed without a project status update.",
      `Update ${statusFile} with completed work, current state, next tasks, and verification.`,
      "",
      "Code changes:",
      ...codeChanges.map((file) => `- ${file}`),
    ].join("\n"),
  );
  process.exit(1);
}

const status = readFileSync(statusFile, "utf8");
const requiredHeadings = [
  "## 总体目标",
  "## 已完成事项",
  "## 当前状态",
  "## 下一步任务",
  "## Agent 工作记录",
  "## Agent 更新规则",
];
const missingHeadings = requiredHeadings.filter(
  (heading) => !status.includes(heading),
);

if (missingHeadings.length > 0) {
  console.error(
    `Project status is missing required sections:\n${missingHeadings.join("\n")}`,
  );
  process.exit(1);
}

console.log(
  codeChanges.length > 0
    ? "Project status update is included with the code changes."
    : "No project status update is required for these changes.",
);
