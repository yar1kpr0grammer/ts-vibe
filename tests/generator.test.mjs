import assert from "node:assert/strict";
import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import { exec } from "../src/cmd.mjs";
import { createProjectPlan } from "../src/project/features.mjs";
import { executeTransaction } from "../src/project/transaction.mjs";

const config = {
  default_code: {
    indexTs: 'console.log("Hello, TypeScript!");\n',
    eslintConfig: "",
    prettierrc: "{}\n",
    vitestTest: "example Vitest test\n",
  },
  ignores: {
    git: "node_modules\ndist",
    prettier: "node_modules\ndist",
  },
};

const language = {
  lint_tip: "lint\n",
  prettier_tip: "format\n",
  readme_content: "# Test\n",
};

async function temporaryRoot(t) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "ts-vibe-test-"));
  t.after(() => fs.rm(root, { recursive: true, force: true }));
  return root;
}

function project(targetPath, directoryPolicy) {
  return {
    ...createProjectPlan({
      name: "example",
      nodeType: "module",
      selectedFeatures: [],
      language,
      config,
    }),
    directoryPolicy,
    gitMode: "new",
    install: false,
    name: "example",
    selectedFeatures: [],
    targetPath,
  };
}

test("uses NodeNext and provides a type-check command for ESM projects", () => {
  const planned = createProjectPlan({
    name: "example",
    nodeType: "module",
    selectedFeatures: [],
    language,
    config,
  });

  assert.equal(planned.tsconfig.compilerOptions.module, "NodeNext");
  assert.equal(planned.tsconfig.compilerOptions.moduleResolution, "NodeNext");
  assert.equal(planned.packageJson.scripts.check, "tsc --noEmit");
});

test("adds Vitest only when selected", () => {
  const base = createProjectPlan({
    name: "example",
    nodeType: "module",
    selectedFeatures: [],
    language,
    config,
  });
  const withVitest = createProjectPlan({
    name: "example",
    nodeType: "module",
    selectedFeatures: ["vitest"],
    language,
    config,
  });

  assert.equal(base.packageJson.devDependencies.vitest, undefined);
  assert.equal(base.packageJson.scripts.test, undefined);
  assert.equal(withVitest.packageJson.devDependencies.vitest, "^4.1.12");
  assert.equal(withVitest.packageJson.scripts.test, "vitest");
  assert.equal(withVitest.packageJson.scripts["test:run"], "vitest run");
  assert.equal(withVitest.files["src/index.test.ts"], "example Vitest test\n");
});

test("builds a modern ESLint feature plan", () => {
  const planned = createProjectPlan({
    name: "example",
    nodeType: "commonjs",
    selectedFeatures: ["eslint"],
    language,
    config: {
      ...config,
      default_code: {
        ...config.default_code,
        eslintConfig: "modern flat config",
      },
    },
  });

  assert.equal(planned.packageJson.scripts.lint, "eslint .");
  assert.equal(planned.packageJson.devDependencies["@eslint/js"], "^10.0.1");
  assert.equal(
    planned.packageJson.devDependencies["typescript-eslint"],
    "^8.73.0",
  );
  assert.equal(planned.packageJson.devDependencies.globals, "^17.14.0");
  assert.equal(planned.packageJson.devDependencies.typescript, "~6.0.3");
  assert.equal(planned.files["eslint.config.mjs"], "modern flat config");
  assert.equal(planned.files[".eslintignore"], undefined);
});

test("creates a complete project through an atomic rename", async (t) => {
  const root = await temporaryRoot(t);
  const target = path.join(root, "example");

  await executeTransaction(project(target, "create"));

  const packageJson = JSON.parse(
    await fs.readFile(path.join(target, "package.json"), "utf8"),
  );
  assert.equal(packageJson.name, "example");
  assert.equal(packageJson.devDependencies.typescript, "~6.0.3");
  assert.match(await fs.readFile(path.join(target, "src/index.ts"), "utf8"), /Hello/);
});

test("clear mode replaces files but preserves .git", async (t) => {
  const root = await temporaryRoot(t);
  const target = path.join(root, "example");
  await fs.mkdir(path.join(target, ".git"), { recursive: true });
  await fs.writeFile(path.join(target, "old.txt"), "old");

  await executeTransaction(project(target, "clear"));

  await assert.rejects(fs.access(path.join(target, "old.txt")));
  await fs.access(path.join(target, ".git"));
  await fs.access(path.join(target, "package.json"));
});

test("ignore mode preserves unrelated files and replaces generated paths", async (t) => {
  const root = await temporaryRoot(t);
  const target = path.join(root, "example");
  await fs.mkdir(path.join(target, "src"), { recursive: true });
  await fs.writeFile(path.join(target, "notes.txt"), "keep");
  await fs.writeFile(path.join(target, "src/index.ts"), "old");
  await fs.writeFile(path.join(target, "src/other.ts"), "keep");

  await executeTransaction(project(target, "ignore"));

  assert.equal(await fs.readFile(path.join(target, "notes.txt"), "utf8"), "keep");
  assert.equal(await fs.readFile(path.join(target, "src/other.ts"), "utf8"), "keep");
  assert.match(await fs.readFile(path.join(target, "src/index.ts"), "utf8"), /Hello/);
});

test("an installation failure leaves the target untouched", async (t) => {
  const root = await temporaryRoot(t);
  const target = path.join(root, "example");
  await fs.mkdir(target);
  await fs.writeFile(path.join(target, "important.txt"), "keep");

  const failingProject = {
    directoryPolicy: "ignore",
    files: {
      "package.json": `${JSON.stringify({
        name: "failing-project",
        version: "1.0.0",
        scripts: {
          preinstall: 'node -e "process.exit(1)"',
        },
      })}\n`,
    },
    gitMode: "new",
    install: true,
    name: "example",
    selectedFeatures: [],
    targetPath: target,
  };

  await assert.rejects(executeTransaction(failingProject), /npm install failed/);
  assert.equal(
    await fs.readFile(path.join(target, "important.txt"), "utf8"),
    "keep",
  );
  await assert.rejects(fs.access(path.join(target, "package.json")));
  assert.deepEqual(
    (await fs.readdir(root)).filter((entry) => entry.startsWith(".ts-vibe-")),
    [],
  );
});

test("exec passes arguments literally without a shell", async () => {
  const marker = "value && echo injected";
  const output = await exec(process.execPath, [
    "-e",
    "process.stdout.write(process.argv[1])",
    marker,
  ]);

  assert.equal(output, marker);
});
