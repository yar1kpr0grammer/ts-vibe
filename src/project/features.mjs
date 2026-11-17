const CORE_DEV_DEPENDENCIES = {
  tsx: "^4.23.15",
  typescript: "~6.0.3",
};

export const FEATURES = {
  git: {
    labelKey: "feature_git",
    recommended: true,
    files({ config }) {
      return {
        ".gitattributes": "* text=auto\n",
        ".gitignore": `${config.ignores.git}\n`,
      };
    },
  },
  readme: {
    labelKey: "feature_readme",
    recommended: true,
    files({ language, selectedFeatures }) {
      const tips = [];
      if (selectedFeatures.includes("eslint")) tips.push(language.lint_tip);
      if (selectedFeatures.includes("prettier")) tips.push(language.prettier_tip);
      if (selectedFeatures.includes("vitest")) tips.push(language.test_tip);

      return {
        "README.md": `${language.readme_content}${tips.join("")}`,
      };
    },
  },
  node: {
    labelKey: "feature_node",
    recommended: true,
    devDependencies: {
      "@types/node": "^26.6.6",
    },
    configureTs(config) {
      config.compilerOptions.types = ["node"];
    },
  },
  alias: {
    labelKey: "feature_alias",
    recommended: true,
    configureTs(config) {
      config.compilerOptions.baseUrl = ".";
      config.compilerOptions.paths = {
        "@/*": ["src/*"],
      };
    },
  },
  eslint: {
    labelKey: "feature_eslint",
    devDependencies: {
      "@eslint/js": "^10.0.1",
      eslint: "^10.15.0",
      "eslint-config-prettier": "^10.1.8",
      globals: "^17.14.0",
      "typescript-eslint": "^8.73.0",
    },
    scripts: {
      lint: "eslint .",
    },
    files({ config }) {
      return {
        "eslint.config.mjs": config.default_code.eslintConfig,
      };
    },
  },
  vitest: {
    labelKey: "feature_vitest",
    devDependencies: {
      vitest: "^4.1.12",
    },
    scripts: {
      test: "vitest",
      "test:run": "vitest run",
    },
    files({ config }) {
      return {
        "src/index.test.ts": config.default_code.vitestTest,
      };
    },
  },
  prettier: {
    labelKey: "feature_prettier",
    devDependencies: {
      prettier: "^3.10.1",
    },
    scripts: {
      format: "prettier --write .",
    },
    files({ config }) {
      return {
        ".prettierignore": `${config.ignores.prettier}\n`,
        ".prettierrc": config.default_code.prettierrc,
      };
    },
  },
};

export const FEATURE_IDS = Object.keys(FEATURES);
export const RECOMMENDED_FEATURE_IDS = FEATURE_IDS.filter(
  (id) => FEATURES[id].recommended,
);

export function getFeatureChoices(language) {
  return FEATURE_IDS.map((id) => ({
    label: language[FEATURES[id].labelKey],
    value: id,
  }));
}

function createTsConfig(nodeType) {
  return {
    compilerOptions: {
      rootDir: "./src",
      outDir: "./dist",
      target: "ES2020",
      lib: [nodeType === "module" ? "ESNext" : "ES2020"],
      module: nodeType === "module" ? "NodeNext" : "CommonJS",
      moduleResolution: nodeType === "module" ? "NodeNext" : "Node",
      sourceMap: true,
      strict: true,
      noUncheckedIndexedAccess: true,
      exactOptionalPropertyTypes: true,
      resolveJsonModule: true,
      forceConsistentCasingInFileNames: true,
      skipLibCheck: true,
      esModuleInterop: true,
      allowSyntheticDefaultImports: true,
    },
    include: ["src/**/*.ts"],
  };
}

export function createProjectPlan({
  name,
  nodeType,
  selectedFeatures,
  language,
  config,
}) {
  const scripts = {
    dev: "tsx watch src/index.ts",
    start: "tsx src/index.ts",
    check: "tsc --noEmit",
    build: "tsc",
    prod: "node dist/index.js",
  };
  const devDependencies = { ...CORE_DEV_DEPENDENCIES };
  const tsconfig = createTsConfig(nodeType);
  const context = { config, language, selectedFeatures };
  const files = {
    "src/index.ts": config.default_code.indexTs,
  };

  for (const id of selectedFeatures) {
    const feature = FEATURES[id];
    if (!feature) {
      throw new Error(`Unknown feature: ${id}`);
    }

    Object.assign(scripts, feature.scripts);
    Object.assign(devDependencies, feature.devDependencies);
    Object.assign(files, feature.files?.(context));
    feature.configureTs?.(tsconfig, context);
  }

  const packageJson = {
    name,
    version: "1.0.0",
    private: true,
    type: nodeType,
    scripts,
    devDependencies,
  };

  files["package.json"] = `${JSON.stringify(packageJson, null, 2)}\n`;
  files["tsconfig.json"] = `${JSON.stringify(tsconfig, null, 2)}\n`;

  return {
    files,
    packageJson,
    tsconfig,
  };
}
