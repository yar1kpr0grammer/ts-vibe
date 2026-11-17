import fs from "node:fs/promises";
import path from "node:path";

import { checkProjectName } from "../npm.mjs";
import {
  ask,
  cancel,
  checkbox,
  input,
  intro,
  note,
  radio,
} from "../utils/cmd.mjs";
import languageLib from "../utils/language.mjs";
import Path from "../fs/path.mjs";
import {
  createProjectPlan,
  getFeatureChoices,
  RECOMMENDED_FEATURE_IDS,
} from "./features.mjs";

async function pathStat(targetPath) {
  try {
    return await fs.lstat(targetPath);
  } catch (error) {
    if (error.code === "ENOENT") return null;
    throw error;
  }
}

async function containsProjectFiles(targetPath) {
  const entries = await fs.readdir(targetPath);
  return entries.some((entry) => entry !== ".git");
}

async function findGitRoot(startPath) {
  let current = startPath;

  while (true) {
    if (await pathStat(path.join(current, ".git"))) return current;
    const parent = path.dirname(current);
    if (parent === current) return null;
    current = parent;
  }
}

export async function getName(
  prompt = "Enter project name",
  error = "Not valid",
) {
  const value = await input(prompt, {
    placeholder: "my-project",
    validate(inputValue) {
      const projectName = inputValue.trim();
      const name =
        projectName === "." ? path.basename(process.cwd()) : projectName;

      if (!checkProjectName(name)) return error;
    },
  });
  const dir = value.trim();

  return {
    name: dir === "." ? path.basename(process.cwd()) : dir,
    dir,
  };
}

export async function chooseNodeType(language) {
  return radio(language.choose_node_type, ["module", "commonjs"], "module");
}

async function inspectTarget(targetPath, language) {
  const stat = await pathStat(targetPath);
  if (!stat) return "create";
  if (stat.isSymbolicLink()) throw new Error(language.target_is_symlink);
  if (!stat.isDirectory()) throw new Error(language.target_is_not_directory);
  if (!(await containsProjectFiles(targetPath))) return "ignore";

  const action = await radio(language.dir_is_not_empty, [
    { label: language.dir_action_cancel, value: "cancel" },
    { label: language.dir_action_clear, value: "clear" },
    { label: language.dir_action_ignore, value: "ignore" },
  ]);

  if (action === "cancel") {
    cancel(language.operation_cancelled);
    process.exit(0);
  }

  return action;
}

function buildSummary(project) {
  const language = project.language;
  const featureLabels = project.selectedFeatures.map(
    (id) => language[`feature_${id}`],
  );
  const policyLabels = {
    create: language.summary_policy_create,
    clear: language.summary_policy_clear,
    ignore: language.summary_policy_ignore,
  };
  const gitBehavior = project.selectedFeatures.includes("git")
    ? project.gitMode === "new"
      ? language.summary_git_new
      : language.summary_git_existing
    : language.summary_git_disabled;

  return [
    `${language.summary_project}: ${project.name}`,
    `${language.summary_target}: ${project.targetPath}`,
    `${language.summary_directory}: ${policyLabels[project.directoryPolicy]}`,
    `${language.summary_module}: ${project.nodeType}`,
    `${language.summary_features}: ${featureLabels.join(", ") || language.none}`,
    `${language.summary_install}: ${project.install ? language.yes : language.no}`,
    `${language.summary_git}: ${gitBehavior}`,
    "",
    `${language.summary_files}:`,
    ...Object.keys(project.files).map((file) => `  • ${file}`),
  ].join("\n");
}

export async function setupProject({ skipInstall = false } = {}) {
  const language = languageLib.init(languageLib.choose());
  intro(language.cli_title, language.operation_cancelled);

  const startDirectory = process.cwd();
  const { name, dir } = await getName(
    language.enter_project_name,
    language.name_not_valid,
  );
  const targetPath = path.resolve(startDirectory, dir);
  const directoryPolicy = await inspectTarget(targetPath, language);
  const configPath = Path.resolveCliPath("config.json");
  const config = JSON.parse(await fs.readFile(configPath, "utf8"));

  const template = await radio(
    language.choose_project_template,
    [
      { label: language.template_recommended, value: "recommended" },
      { label: language.template_custom, value: "custom" },
    ],
    "recommended",
  );

  let selectedFeatures;
  let nodeType = "module";

  if (template === "recommended") {
    selectedFeatures = [...RECOMMENDED_FEATURE_IDS];
  } else {
    selectedFeatures = await checkbox(
      language.choose_packages,
      getFeatureChoices(language),
      RECOMMENDED_FEATURE_IDS,
    );
    nodeType = await chooseNodeType(language);
  }

  const gitRoot = await findGitRoot(
    (await pathStat(targetPath)) ? targetPath : path.dirname(targetPath),
  );
  const generated = createProjectPlan({
    name,
    nodeType,
    selectedFeatures,
    language,
    config,
  });
  const project = {
    ...generated,
    config,
    dir,
    directoryPolicy,
    gitMode: gitRoot ? "existing" : "new",
    install: !skipInstall,
    language,
    name,
    nodeType,
    selectedFeatures,
    targetPath,
  };

  note(buildSummary(project), language.summary_title);
  const approved = await ask(language.confirm_create, {
    initialValue: true,
    active: language.yes,
    inactive: language.no,
  });
  if (!approved) {
    cancel(language.operation_cancelled);
    process.exit(0);
  }

  return project;
}
