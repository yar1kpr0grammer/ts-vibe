import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

function findNpmCli() {
  const candidates = [];
  const npmExecPath = process.env.npm_execpath;

  if (npmExecPath && path.basename(npmExecPath).toLowerCase() === "npm-cli.js") {
    candidates.push(npmExecPath);
  }

  candidates.push(
    path.join(
      path.dirname(process.execPath),
      "node_modules",
      "npm",
      "bin",
      "npm-cli.js",
    ),
  );

  for (const directory of (process.env.PATH ?? "").split(path.delimiter)) {
    if (directory) {
      candidates.push(
        path.join(directory, "node_modules", "npm", "bin", "npm-cli.js"),
      );
    }
  }

  return candidates.find((candidate) => fs.existsSync(candidate));
}

function invocation(command, args) {
  if (process.platform === "win32" && command === "npm") {
    const npmCli = findNpmCli();
    if (npmCli) {
      return { command: process.execPath, args: [npmCli, ...args] };
    }
  }

  return { command, args };
}

export function exec(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const resolved = invocation(command, args);
    const child = spawn(resolved.command, resolved.args, {
      cwd: options.cwd,
      env: process.env,
      shell: false,
      stdio: "pipe",
    });
    let stdout = "";
    let stderr = "";

    child.stdout.on("data", (chunk) => {
      stdout += chunk;
    });
    child.stderr.on("data", (chunk) => {
      stderr += chunk;
    });
    child.on("error", reject);
    child.on("close", (code, signal) => {
      if (code === 0) {
        resolve(stdout);
        return;
      }

      const renderedCommand = [command, ...args].join(" ");
      const reason = signal ? `signal ${signal}` : `exit code ${code}`;
      const details = stderr.trim() || stdout.trim();
      reject(
        new Error(
          `${renderedCommand} failed with ${reason}${details ? `\n${details}` : ""}`,
        ),
      );
    });
  });
}
