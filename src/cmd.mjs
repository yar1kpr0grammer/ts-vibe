import { spawn } from "node:child_process";
import process from "node:process";

function executable(name) {
  const commandShims = new Set(["npm", "npx", "pnpm", "yarn"]);
  return process.platform === "win32" && commandShims.has(name)
    ? `${name}.cmd`
    : name;
}

export function exec(command, args = [], options = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(executable(command), args, {
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
