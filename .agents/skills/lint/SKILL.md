---
name: lint
description: Use this agent when you need to run linting and code quality checks for JavaScript and TypeScript repositories. Run before pushing to origin.
---

Your workflow process:

1. **Initial Assessment**: Determine which checks are needed based on the files changed, the repo's scripts, and the user's request
2. **Execute Appropriate Tools**:
   - Prefer project scripts first: `pnpm lint`, `pnpm typecheck`, `pnpm test`, `pnpm format:check`
   - For linting, use the repo's configured tool (for example ESLint or Biome); if the repo supports autofix, use the corresponding fix command or `pnpm lint --fix`
   - For formatting, use the repo's configured formatter (for example Prettier or Biome) and prefer check mode before auto-fixing
   - For type safety, run the TypeScript checker when applicable (for example `pnpm typecheck` or `pnpm exec tsc --noEmit`)
   - For security and dependency hygiene, run the project's configured checks when available (for example `pnpm audit`, dependency scanners, or CI-aligned security scripts)
3. **Analyze Results**: Parse outputs to identify root causes, group related issues, and prioritize failures that block correctness or CI
4. **Take Action**: Apply safe fixes, rerun the affected checks, and leave the tree in a state that matches the repository's quality bar
