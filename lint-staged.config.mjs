/* eslint-disable @typescript-eslint/no-unsafe-argument, @typescript-eslint/no-unsafe-assignment, @typescript-eslint/no-unsafe-call, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-return */
import fs from "node:fs";
import path from "node:path";
import process from "node:process";

const workspaceRoot = process.cwd();
const jsTsPattern = "**/*.{cjs,cts,js,jsx,mjs,mts,ts,tsx}";
const prettierOnlyPattern = "**/*.{css,html,json,md,mdx}";
const eslintPackageRoots = ["apps", "packages"];
const rootScopedIgnoredEslintPrefixes = [".github/scripts/fixtures/"];
const rootScopedIgnoredLintPrefixes = ["packages/api-contract/src/generated/"];

/**
 * Quote a file path for safe shell usage.
 * @param {string} value
 * @returns {string}
 */
const quote = (value) => `'${value.replace(/'/g, `'\\''`)}'`;

/**
 * Normalize a lint-staged file argument to a workspace-relative path.
 * lint-staged may pass absolute paths to task functions.
 * @param {string} file
 * @returns {string}
 */
const toWorkspaceRelativePath = (file) => {
  if (path.isAbsolute(file)) {
    return path.relative(workspaceRoot, file);
  }

  return file;
};

/**
 * Keep generated contract files out of staged format/lint routing.
 * @param {string} file
 * @returns {boolean}
 */
const isIgnoredByLintRouting = (file) =>
  rootScopedIgnoredLintPrefixes.some((prefix) => file.startsWith(prefix));

/**
 * Keep generated files out of formatting routing as well.
 * @param {string} file
 * @returns {boolean}
 */
const isIgnoredByFormattingRouting = (file) => isIgnoredByLintRouting(file);

/**
 * Discover package directories that own their own ESLint config.
 * @returns {string[]}
 */
const findPackageScopedEslintDirs = () =>
  eslintPackageRoots
    .flatMap((rootDir) => {
      const absoluteRootDir = path.join(workspaceRoot, rootDir);

      if (!fs.existsSync(absoluteRootDir)) {
        return [];
      }

      return fs
        .readdirSync(absoluteRootDir, { withFileTypes: true })
        .filter((entry) => entry.isDirectory())
        .map((entry) => path.join(rootDir, entry.name))
        .filter((packageDir) => {
          const absolutePackageDir = path.join(workspaceRoot, packageDir);

          return (
            fs.existsSync(path.join(absolutePackageDir, "package.json")) &&
            fs.existsSync(path.join(absolutePackageDir, "eslint.config.mjs"))
          );
        });
    })
    .sort((left, right) => right.length - left.length);

const packageScopedEslintDirs = findPackageScopedEslintDirs();
const packageScopedIgnoredEslintFiles = new Map([
  [
    "apps/api",
    new Set([
      "prisma.config.ts",
      "prisma.test.config.ts",
      "provision-ci-dbs.mjs",
    ]),
  ],
]);

/**
 * @param {string} file
 * @returns {string | null}
 */
const findOwningEslintPackageDir = (file) =>
  packageScopedEslintDirs.find(
    (packageDir) => file === packageDir || file.startsWith(`${packageDir}/`),
  ) ?? null;

/**
 * Keep root lint-staged ESLint aligned with root eslint.config.mjs ignores.
 * @param {string} file
 * @returns {boolean}
 */
const isIgnoredByRootEslint = (file) =>
  rootScopedIgnoredEslintPrefixes.some((prefix) => file.startsWith(prefix));

/**
 * @param {string[]} files
 * @returns {string[]}
 */
const runRootEslint = (files) => {
  const lintableFiles = files.filter((file) => !isIgnoredByRootEslint(file));

  if (lintableFiles.length === 0) {
    return [];
  }

  return [
    `eslint --fix --max-warnings 0 ${lintableFiles.map(quote).join(" ")}`,
  ];
};

/**
 * @param {string[]} files
 * @returns {string[]}
 */
const runPackageEslint = (packageDir, files) => {
  const ignoredFiles = packageScopedIgnoredEslintFiles.get(packageDir) ?? null;
  const lintableFiles =
    ignoredFiles === null
      ? files
      : files.filter((file) => !ignoredFiles.has(path.basename(file)));

  if (lintableFiles.length === 0) {
    return [];
  }

  const packageAbsoluteDir = path.join(workspaceRoot, packageDir);
  const packageRelativeFiles = lintableFiles.map((file) =>
    quote(path.relative(packageAbsoluteDir, path.join(workspaceRoot, file))),
  );

  return [
    `pnpm --dir ${quote(packageDir)} exec eslint --fix --max-warnings 0 ${packageRelativeFiles.join(" ")}`,
  ];
};

/**
 * Build a prettier command only when there are files left to format.
 * @param {string[]} files
 * @returns {string[]}
 */
const runPrettier = (files) => {
  const formattedFiles = files
    .map(toWorkspaceRelativePath)
    .filter((file) => !isIgnoredByFormattingRouting(file));

  if (formattedFiles.length === 0) {
    return [];
  }

  return [`prettier --write ${formattedFiles.map(quote).join(" ")}`];
};

export default {
  /**
   * @param {string[]} files
   * @returns {string[]}
   */
  [jsTsPattern]: (files) => {
    const normalizedFiles = files
      .map(toWorkspaceRelativePath)
      .filter((file) => !isIgnoredByLintRouting(file));
    const rootFiles = [];
    const packageFiles = new Map();

    for (const file of normalizedFiles) {
      const packageDir = findOwningEslintPackageDir(file);

      if (packageDir === null) {
        rootFiles.push(file);
        continue;
      }

      const existingFiles = packageFiles.get(packageDir) ?? [];
      existingFiles.push(file);
      packageFiles.set(packageDir, existingFiles);
    }

    return [
      ...runPrettier(normalizedFiles),
      ...runRootEslint(rootFiles),
      ...Array.from(packageFiles.entries()).flatMap(
        ([packageDir, packageDirFiles]) =>
          runPackageEslint(packageDir, packageDirFiles),
      ),
    ];
  },
  [prettierOnlyPattern]: (files) => runPrettier(files),
};
