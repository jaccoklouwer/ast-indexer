# Project Architecture

## Overview

AST-Indexer is an MCP server that indexes Git repositories with AST parsing. It extracts functions, classes, imports, variables, and SQL schema objects from JavaScript, TypeScript, C#, and SQL files and exposes them through MCP tools.

## Parser Dispatch

[src/parser.ts](../src/parser.ts) is the entry point for parsing and dispatches files by extension:

- `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, `.cts` use the TypeScript Compiler API through `parseJavaScriptFile()`.
- `.cs` uses [src/csharp-parser.ts](../src/csharp-parser.ts), built on Tree-sitter.
- `.sql` uses [src/sql-parser.ts](../src/sql-parser.ts), built on `node-sql-parser`.

Every parser returns the same `FileIndex` shape from [src/schemas.ts](../src/schemas.ts), which keeps indexing and search behavior consistent across languages.

## Core Components

- [src/index.ts](../src/index.ts): MCP server entry point, tool registration, and stdio or HTTP startup.
- [src/indexer.ts](../src/indexer.ts): Repository scanning, caching, and search operations.
- [src/parser.ts](../src/parser.ts): Shared parsing entry point and filesystem scanning logic.
- [src/schemas.ts](../src/schemas.ts): Zod schemas and exported TypeScript types.
- [src/csharp-parser.ts](../src/csharp-parser.ts): C# parsing with Tree-sitter.
- [src/sql-parser.ts](../src/sql-parser.ts): SQL parsing and fallback logic.

## Data Flow

1. An MCP client calls `index_repository`.
2. The `RepositoryIndexer` scans the repository with include and exclude patterns.
3. Each file is routed to the correct parser based on its extension.
4. Parsed `FileIndex` objects are stored in a repository cache.
5. Search tools query the cached repository index.

## Implementation Notes

### JavaScript and TypeScript

- Parsing is done with `ts.createSourceFile()`.
- `ScriptKind` is selected from the file extension.
- The parser extracts function declarations, classes, imports, variables, and exports.
- `.mts` and `.cts` are treated as TypeScript inputs.

### C#

- Tree-sitter is used for syntax parsing.
- Namespaces and access modifiers are captured explicitly.
- `using` directives are stored as imports.

### SQL

- `node-sql-parser` is used first, with regex-based fallback logic for harder cases.
- The parser extracts procedures, functions, tables, columns, and views.

## Development Conventions

### ES Module Imports

The project uses Node16 module resolution. Relative imports must include the `.js` extension in TypeScript source files.

### Schema Changes

When you add a field to a schema:

1. Update [src/schemas.ts](../src/schemas.ts).
2. Populate the field in all relevant parsers.
3. Keep new fields backward-compatible where possible.

### Testing

The test suite uses Vitest. Temporary repositories are created in tests for parser and indexer behavior.

Useful commands:

```bash
pnpm test
pnpm run test:watch
pnpm run test:ui
pnpm run test:coverage
```

## Common Pitfalls

- Forgetting `.js` on relative imports in TypeScript source.
- Updating Zod schemas without updating parser outputs.
- Assuming cache entries invalidate automatically without re-indexing.
- Forgetting that search filters are opt-in and repository data must exist in cache first.
