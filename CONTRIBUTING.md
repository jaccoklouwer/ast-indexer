# Contributing

Thanks for contributing to AST-Indexer.

## Local Setup

```bash
pnpm install
pnpm lint
pnpm build
pnpm test
```

Use `pnpm run test:watch` or `pnpm run test:ui` if you are iterating on parser behavior.

## Before Opening a Pull Request

- Keep changes focused and avoid unrelated refactors.
- Add or update tests when parser, indexer, or MCP tool behavior changes.
- Make sure `pnpm lint`, `pnpm build`, and `pnpm test` all pass.
- Update documentation when public behavior changes.

## Codebase Notes

- Relative imports in TypeScript source files must include the `.js` extension.
- Parser outputs should stay aligned with the Zod schemas in `src/schemas.ts`.
- MCP tool descriptions and inline code comments are kept in Dutch to match the existing codebase.

## Commits

This repository uses Conventional Commits. Always commit using:

```bash
pnpm commit
```

This runs `git-cz` for interactive conventional commit message generation. Do not use `git commit` directly.

## Releasing

```bash
pnpm run publish:check   # lint + build + test + pack validation
pnpm release             # version bump, CHANGELOG update, git tag
pnpm push                # push commits and tags; triggers GitHub Actions publish
```

## Large Changes

If you plan to change parser behavior, public MCP tool behavior, or repository structure, open an issue or start a discussion first so the approach can be aligned before implementation.
