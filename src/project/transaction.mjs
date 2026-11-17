import fs from "node:fs/promises";
import path from "node:path";

import { exec } from "../cmd.mjs";

async function exists(filePath) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if (error.code === "ENOENT") return false;
    throw error;
  }
}

async function writeProjectFiles(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const destination = path.join(root, relativePath);
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.writeFile(destination, content, "utf8");
  }
}

async function initializeGit(root) {
  await exec("git", ["init"], { cwd: root });
  await exec("git", ["add", "--all"], { cwd: root });
  await exec("git", ["commit", "-m", "init project with ts-vibe"], {
    cwd: root,
  });
}

async function prepareStage(stagePath, project, onStep) {
  onStep(project.language?.step_generate ?? "Generate project files");
  await writeProjectFiles(stagePath, project.files);

  if (project.install) {
    onStep(project.language?.step_install ?? "Install dependencies");
    await exec("npm", ["install"], { cwd: stagePath });
  }

  if (project.selectedFeatures.includes("git") && project.gitMode === "new") {
    onStep(project.language?.step_git ?? "Initialize Git repository");
    await initializeGit(stagePath);
  }
}

async function moveEntry(source, destination, backup, journal) {
  const sourceStat = await fs.lstat(source);
  const destinationExists = await exists(destination);

  if (!destinationExists) {
    await fs.mkdir(path.dirname(destination), { recursive: true });
    await fs.rename(source, destination);
    journal.push({ type: "added", destination });
    return;
  }

  const destinationStat = await fs.lstat(destination);
  if (sourceStat.isDirectory() && destinationStat.isDirectory()) {
    for (const entry of await fs.readdir(source)) {
      await moveEntry(
        path.join(source, entry),
        path.join(destination, entry),
        path.join(backup, entry),
        journal,
      );
    }
    await fs.rm(source, { recursive: true, force: true });
    return;
  }

  await fs.mkdir(path.dirname(backup), { recursive: true });
  await fs.rename(destination, backup);

  try {
    await fs.rename(source, destination);
    journal.push({ type: "replaced", destination, backup });
  } catch (error) {
    await fs.rename(backup, destination);
    throw error;
  }
}

async function rollbackMerge(journal) {
  for (const operation of [...journal].reverse()) {
    await fs.rm(operation.destination, { recursive: true, force: true });
    if (operation.type === "replaced") {
      await fs.mkdir(path.dirname(operation.destination), { recursive: true });
      await fs.rename(operation.backup, operation.destination);
    }
  }
}

async function publishIntoExisting(stagePath, project) {
  const parent = path.dirname(project.targetPath);
  const backupRoot = await fs.mkdtemp(
    path.join(parent, `.ts-vibe-backup-${project.name}-`),
  );
  const clearedRoot = path.join(backupRoot, "cleared");
  const mergeRoot = path.join(backupRoot, "merge");
  const clearedEntries = [];
  const journal = [];

  try {
    if (project.directoryPolicy === "clear") {
      await fs.mkdir(clearedRoot, { recursive: true });
      for (const entry of await fs.readdir(project.targetPath)) {
        if (entry === ".git") continue;
        await fs.rename(
          path.join(project.targetPath, entry),
          path.join(clearedRoot, entry),
        );
        clearedEntries.push(entry);
      }
    }

    for (const entry of await fs.readdir(stagePath)) {
      await moveEntry(
        path.join(stagePath, entry),
        path.join(project.targetPath, entry),
        path.join(mergeRoot, entry),
        journal,
      );
    }
  } catch (error) {
    await rollbackMerge(journal);

    for (const entry of [...clearedEntries].reverse()) {
      const original = path.join(project.targetPath, entry);
      await fs.rm(original, { recursive: true, force: true });
      await fs.rename(path.join(clearedRoot, entry), original);
    }

    throw error;
  }

  await fs.rm(backupRoot, { recursive: true, force: true });
}

export async function executeTransaction(project, { onStep = () => {} } = {}) {
  const parent = path.dirname(project.targetPath);
  await fs.mkdir(parent, { recursive: true });
  let stagePath = await fs.mkdtemp(
    path.join(parent, `.ts-vibe-stage-${project.name}-`),
  );

  try {
    await prepareStage(stagePath, project, onStep);
    onStep(project.language?.step_publish ?? "Publish project");

    if (!(await exists(project.targetPath))) {
      await fs.rename(stagePath, project.targetPath);
      stagePath = null;
      return;
    }

    if (project.directoryPolicy === "create") {
      throw new Error("The target directory appeared during generation");
    }

    await publishIntoExisting(stagePath, project);
  } finally {
    if (stagePath) {
      await fs.rm(stagePath, { recursive: true, force: true });
    }
  }
}
