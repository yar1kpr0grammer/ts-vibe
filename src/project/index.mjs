import { confirm } from "../utils/cmd.mjs";
import { executeTransaction } from "./transaction.mjs";

export async function init(project) {
  const { language } = project;

  await confirm(
    (ui) => executeTransaction(project, { onStep: ui.message }),
    project.install ? language.create_and_install : language.create_without_install,
    language.success,
    language.error,
  );
}
