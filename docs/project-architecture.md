# Project Architecture

## Overview

AST-Indexer is a [Model Context Protocol](https://modelcontextprotocol.io) server that walks a Git repository, parses source files, and stores extracted symbols in a two-layer cache. MCP clients call the registered tools to index and then search the results.

## Directory structure

```
src/
  index.ts          # MCP server setup, CLI entry point, tool registration
  indexer.ts        # RepositoryIndexer class — orchestrates scanning, caching, and search
  parser.ts         # Parser dispatcher + directory scanner + glob matching
  csharp-parser.ts  # C# parser (regex-based)
  sql-parser.ts     # SQL parser (regex-based)
  schemas.ts        # Zod schemas and TypeScript types (single source of truth)
  cache/
    cache-manager.ts  # Coordinates memory and disk layers
    memory-cache.ts   # In-process Map-based cache
    disk-cache.ts     # JSON files written to the OS temp directory
```

## Data flow

```
MCP client
  → index_repository
    → RepositoryIndexer.indexRepository()
      → scanDirectory()           # walks filesystem, applies glob filters
      → for each file (batches of 10):
          resolveFileCacheKey()   # git hash or mtime
          CacheManager.getOrParse()
            → MemoryCache         # hit → return immediately
            → DiskCache           # hit → populate memory, return
            → parseFile()         # miss → parse, write both caches
  → cache.set(repositoryPath, repositoryIndex)

MCP client
  → search_functions / search_classes / …
    → RepositoryIndexer.searchFunctions()
      → reads from in-process Map
      → filters by name and/or fileName using .includes()
```

## Parser dispatch

`parseFile()` in `parser.ts` routes by file extension:

| Extension | Parser |
|---|---|
| `.js` `.jsx` `.mjs` `.cjs` | `parseJavaScriptFile()` — TypeScript Compiler API, ScriptKind.JS/JSX |
| `.ts` `.tsx` `.mts` `.cts` | `parseJavaScriptFile()` — TypeScript Compiler API, ScriptKind.TS/TSX |
| `.cs` | `parseCSharpFile()` — regex-based, UTF-16 aware |
| `.sql` | `parseSqlFile()` — regex-based |

All parsers return a `FileIndex` object validated by the Zod schema in `schemas.ts`.

## Language parsers

### JavaScript / TypeScript (`parser.ts`)

Uses `ts.createSourceFile()` and `ts.forEachChild()` for recursive tree traversal. Extracts:

- **Functions**: `function` declarations, async functions (`async` type), arrow functions and function expressions assigned to variables (`arrow` type).
- **Classes**: name, `extends`, method names, property names.
- **Imports**: named imports, default imports, namespace imports.
- **Variables**: `const`, `let`, `var` declarations with export flag.
- **Exports**: named exports, export assignments.

### C# (`csharp-parser.ts`)

Regex-based extraction without an external AST library. Handles UTF-16 encoded files (`iconv-lite`). Extracts:

- **Classes and interfaces**: name, access modifiers (`isPublic`, `isAbstract`, `isInterface`), `extends`, `implements`, namespace.
- **Methods**: name, parameters, access/async/static modifiers. Methods already captured inside a class body are not duplicated in the top-level functions list.
- **Using directives**: stored as `ImportInfo` with `isNamespace: true`.

### SQL (`sql-parser.ts`)

Regex-based extraction. Extracts:

- **Tables** (`CREATE TABLE`): name, column names.
- **Views** (`CREATE VIEW` / `CREATE OR REPLACE VIEW`): name.
- **Stored procedures** (`CREATE PROCEDURE` / `CREATE OR ALTER PROCEDURE`): name, parameters — stored as `FunctionInfo` with `type: "stored_procedure"`.
- **Functions** (`CREATE FUNCTION`): name, parameters, return type — stored as `FunctionInfo` with `type: "sql_function"`.
- **Triggers** (`CREATE TRIGGER`): name, event (`INSERT`, `UPDATE`, `DELETE`), target table. Multi-event triggers produce one entry per event.
- **Indexes** (`CREATE INDEX` / `CREATE UNIQUE INDEX`): name, table, columns, `isUnique` flag.

## Cache system

The `CacheManager` in `src/cache/cache-manager.ts` coordinates two layers:

1. **MemoryCache** — a per-process `Map<filePath, { cacheKey, index }>`. Fastest path; lost on restart.
2. **DiskCache** — JSON files written to `<os.tmpdir()>/ast-indexer/<repo-hash>/<file-hash>.json`. Survives restarts.

Cache keys are resolved per file by `RepositoryIndexer.resolveFileCacheKey()`:

- Committed, unmodified files → `git:<commitHash>` (stable across processes).
- Modified or untracked files → `mtime:<mtimeMs>` (changes when the file is saved).

## MCP transport

The server supports two transports selectable at startup:

| Transport | Default | Notes |
|---|---|---|
| `stdio` | ✓ | Standard MCP transport; one server process per client |
| `http` | | Streamable HTTP on `/mcp`; port `3847` by default; supports concurrent sessions |

## Schemas

`src/schemas.ts` is the single source of truth for all data structures. All schemas use Zod and export both the schema and the inferred TypeScript type:

```
FunctionInfo    — function, method, arrow, async, stored_procedure, sql_function
ClassInfo       — class or interface with modifiers and heritage
ImportInfo      — JS/TS import or C# using directive
VariableInfo    — const / let / var declaration
SqlTableInfo    — table name + columns
SqlViewInfo     — view name
SqlTriggerInfo  — trigger name + event + target table
SqlIndexInfo    — index name + table + columns + isUnique
FileIndex       — all of the above, keyed by file path + language
RepositoryIndex — list of FileIndex objects for a repository
```

## Adding a new language parser

1. Create `src/<language>-parser.ts` with an `async function parse<Language>File(filePath: string): Promise<FileIndex>`.
2. Return a `FileIndex` that satisfies the Zod schema (use `.optional()` fields where the language has no concept).
3. Register the file extension(s) in `parseFile()` inside `parser.ts`.
4. Add the extension(s) to `SUPPORTED_EXTENSIONS` in `parser.ts`.
5. Add a `language` value to the `FileIndexSchema` enum in `schemas.ts`.
6. Write tests in `tests/` using a temporary directory and assert extracted symbols.

## Adding a new MCP tool

1. Add a Zod args schema to `src/schemas.ts` and export it.
2. Implement the search or mutation method on `RepositoryIndexer` in `src/indexer.ts`.
3. Register the tool in `registerCommonTools()` in `src/index.ts` using `server.registerTool()`.
4. Return results via `createToolResponse()` or errors via `createToolErrorResponse()`.

## Module system

The project uses Node16 module resolution with ES modules. All relative imports must include the `.js` extension — even when the source file is `.ts`:

```typescript
import { parseFile } from './parser.js'; // ✓
import { parseFile } from './parser';     // ✗ runtime error
```
