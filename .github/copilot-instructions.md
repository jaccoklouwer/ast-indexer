# AST-Indexer MCP Server - AI Coding Instructions

## Project Overview

This is a **Model Context Protocol (MCP) server** that indexes Git repositories using Abstract Syntax Tree parsing. It extracts functions, classes, imports, variables, and SQL schema objects from JS/TS, C#, and SQL files, making them searchable through MCP tools.

## Architecture

### Parser Dispatch Pattern

[src/parser.ts](../src/parser.ts) acts as the **entry point and dispatcher** - routes to language-specific parsers based on file extension:

- `.js/.jsx/.ts/.tsx` → `parseJavaScriptFile()` (uses TypeScript Compiler API)
- `.cs` → [src/csharp-parser.ts](../src/csharp-parser.ts) (uses Tree-sitter)
- `.sql` → [src/sql-parser.ts](../src/sql-parser.ts) (uses node-sql-parser)

All parsers return the same `FileIndex` schema structure - critical for consistency.

### Core Components

- **[src/indexer.ts](../src/indexer.ts)**: `RepositoryIndexer` class manages repo scanning, caching (in-memory Map), and search operations
- **[src/schemas.ts](../src/schemas.ts)**: Single source of truth for all data structures using Zod validation
- **[src/index.ts](../src/index.ts)**: MCP server setup with tool definitions and request handlers

### Data Flow

1. MCP client calls `index_repository` → RepositoryIndexer scans directory
2. For each file: dispatcher routes to language parser → returns FileIndex
3. All FileIndex objects cached in Map keyed by repositoryPath
4. Search tools query cached index using string matching; tools accept `caseInsensitive` to control matching

## Language-Specific Patterns

### JavaScript/TypeScript (TypeScript Compiler API)

- Uses `ts.createSourceFile()` with ScriptKind determined by extension (JS/JSX/TS/TSX)
- Recursive tree traversal using `ts.forEachChild()` pattern
- Distinguishes function types: `function`, `async`, `arrow` (for arrow functions assigned to variables)
- Extracts return types from TypeScript type annotations when available
- Full support for JSX/TSX via ScriptKind.JSX/TSX

### C# (Tree-sitter)

- Manual tree traversal (no visitor pattern like Babel)
- Captures access modifiers (`isPublic`, `isStatic`, `isAbstract`) from modifier nodes
- Namespaces tracked recursively and attached to classes
- Using directives stored as imports with `isNamespace: true` flag

### SQL (node-sql-parser)

- Regex-based parsing as fallback for complex SQL
- Extracts: stored procedures, functions (with params), tables (with columns), views
- Function types use `stored_procedure` and `sql_function` to distinguish from JS/TS

## Development Conventions

### Module System

**Critical**: Uses Node16 module resolution with ES modules. Always include `.js` extensions in imports:

```typescript
import { parseFile } from './parser.js'; // ✓ Correct
import { parseFile } from './parser'; // ✗ Wrong
```

### Schema Validation

All data structures validated with Zod. When adding fields:

1. Update schema in [src/schemas.ts](../src/schemas.ts) with `.optional()` for backward compatibility
2. Update all language parsers to populate the field
3. Export TypeScript type: `export type FunctionInfo = z.infer<typeof FunctionSchema>`

### Testing with Vitest

- Tests create temporary directories with `fs.mkdtemp()` + cleanup in `afterAll()`
- Git repo tests use `simple-git` to init, commit, and configure test repos
- Test structure: write temp files → parse/index → assert extracted data
- Run: `pnpm test` (one-shot), `pnpm run test:watch` (watch), `pnpm run test:ui` (UI), `pnpm run test:coverage`

### Documentation Language

Code comments and tool descriptions are in **Dutch** - maintain this for consistency. User-facing documentation in README is also Dutch.

## MCP Tool Patterns

Tools defined in [src/index.ts](../src/index.ts) follow this pattern:

1. Define tool metadata in `TOOLS` array (name, description, inputSchema)
2. Implement handler in `server.setRequestHandler(CallToolRequestSchema, async (request) => ...)`
3. Parse args with Zod schema (e.g., `IndexRepositoryArgsSchema.parse()`)
4. Call RepositoryIndexer method
5. Return results wrapped in `{ content: [{ type: "text", text: JSON.stringify(...) }] }`

### Search Options

- All `search_*` tools accept `caseInsensitive?: boolean`.
- Default behavior remains case-sensitive for backward compatibility.
- JS/TS/C#/SQL `file` fields now store the full file path; outputs also include `fullPath` in search results.

## Common Pitfalls

1. **Forgetting `.js` extensions**: Will cause runtime errors despite TypeScript compiling
2. **Modifying schemas without parser updates**: Leads to validation failures
3. **Not handling parser errors**: `parseFile()` is called in try-catch in indexer - language parsers should throw descriptive errors
4. **Cache invalidation**: No automatic cache invalidation - re-indexing overwrites cached entry
5. **Search is case-sensitive**: All searches use `.includes()` without case normalization

## Key Files Reference

- Entry point: [src/index.ts](../src/index.ts) (MCP server)
- Main indexer logic: [src/indexer.ts](../src/indexer.ts)
- Parser dispatcher: [src/parser.ts](../src/parser.ts)
- Type definitions: [src/schemas.ts](../src/schemas.ts)
- Config: [tsconfig.json](../tsconfig.json) (note Node16 moduleResolution)
- Test setup: [vitest.config.ts](../vitest.config.ts)

## Commit En Release

Gebruik voor commits en releases in deze repo de workflow uit:

- [.github/git-release.instructions.md](./git-release.instructions.md)

Standaard commando's:

- `pnpm commit`
- `pnpm release`
