import * as prompts from "@clack/prompts";
import colors from "picocolors";

const normalizeOptions = (options) =>
  options.map((option) =>
    typeof option === "string" ? { label: option, value: option } : option,
  );

let defaultCancelMessage = "Operation cancelled";

function unwrap(value, message = defaultCancelMessage) {
  if (prompts.isCancel(value)) {
    prompts.cancel(message);
    process.exit(0);
  }

  return value;
}

export function intro(title, cancelMessage) {
  defaultCancelMessage = cancelMessage ?? defaultCancelMessage;
  prompts.intro(colors.bgCyan(colors.black(` ${title} `)));
}

export function outro(message) {
  prompts.outro(message);
}

export function cancel(message) {
  prompts.cancel(message);
}

export function error(message) {
  prompts.log.error(message);
}

export function note(message, title) {
  prompts.note(message, title);
}

export async function input(message, options = {}) {
  const { cancelMessage, ...promptOptions } = options;
  const value = await prompts.text({ message, ...promptOptions });
  return unwrap(value, cancelMessage);
}

export async function ask(message, options = {}) {
  const { cancelMessage, ...promptOptions } = options;
  const value = await prompts.confirm({ message, ...promptOptions });
  return unwrap(value, cancelMessage);
}

export async function confirm(
  fn,
  message,
  success = "Success",
  errorMessage = "Error",
) {
  const spinner = prompts.spinner();
  spinner.start(message);

  try {
    const result = await fn({
      message(text) {
        spinner.message(text);
      },
    });
    spinner.stop(`${colors.green(success)}: ${message}`);
    return result;
  } catch (error) {
    spinner.error(`${colors.red(errorMessage)}: ${message}`);
    prompts.log.error(error instanceof Error ? error.message : String(error));
    throw error;
  }
}

export async function radio(message, options = [], initialValue) {
  if (!options.length) {
    throw new Error("radio: options is empty");
  }

  const value = await prompts.select({
    message,
    options: normalizeOptions(options),
    initialValue,
  });

  return unwrap(value);
}

export async function checkbox(
  message,
  options = [],
  initialValues = [],
) {
  if (!options.length) {
    throw new Error("checkbox: options is empty");
  }

  const value = await prompts.multiselect({
    message,
    options: normalizeOptions(options),
    initialValues,
    required: false,
  });

  return unwrap(value);
}
