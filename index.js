#!/usr/bin/env node

import { parseArgs } from "node:util";

import { init } from "./src/project/index.mjs";
import { setupProject } from "./src/project/setup.mjs";
import { cancel, outro } from "./src/utils/cmd.mjs";
import colors from "picocolors";

function logInstructions(project) {
  const { dir, install, language } = project;
  const commands = [
    dir === "." ? null : `cd ${dir}`,
    install ? null : "npm install",
    "npm start",
  ].filter(Boolean);
  const nextSteps = commands
    .map((command) => `  ${colors.cyan(command)}`)
    .join("\n");

  outro(`${language.done}\n\n${language.next_steps}\n${nextSteps}`);
}

async function main() {
  const { values } = parseArgs({
    options: {
      "skip-install": { type: "boolean", default: false },
    },
    strict: true,
  });
  const project = await setupProject({
    skipInstall: values["skip-install"],
  });

  await init(project);
  logInstructions(project);
}

main().catch((error) => {
  cancel(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
