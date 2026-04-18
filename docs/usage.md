# Usage

## Starting the server

### stdio (default)

```bash
ast-indexer
```

### HTTP transport

```bash
ast-indexer --transport http
ast-indexer --http
ast-indexer --http --port 4000
```

The HTTP server listens on port `3847` by default and exposes a single endpoint at `/mcp`.

### CLI flags

| Flag                      | Description                               |
| ------------------------- | ----------------------------------------- |
| `--transport stdio\|http` | Choose the transport (default: `stdio`)   |
| `--http`                  | Shortcut for `--transport http`           |
| `--port <number>`         | Port for HTTP transport (default: `3847`) |
| `-h`, `--help`            | Print help and exit                       |

## MCP client configuration

### stdio (global install)

```json
{
  "mcpServers": {
    "ast-indexer": {
      "command": "ast-indexer"
    }
  }
}
```

### stdio (npx, always latest)

```json
{
  "mcpServers": {
    "ast-indexer": {
      "command": "npx",
      "args": ["-y", "@klouwer94/ast-indexer@latest"]
    }
  }
}
```

### stdio (local build)

```bash
pnpm build
```

```json
{
  "mcpServers": {
    "ast-indexer": {
      "command": "node",
      "args": ["/path/to/ast-indexer/dist/index.js"]
    }
  }
}
```

### HTTP

```json
{
  "mcpServers": {
    "ast-indexer": {
      "type": "http",
      "url": "http://localhost:3847/mcp"
    }
  }
}
```

## Tool reference

Call `index_repository` first before using any search tool. The index is cached in memory and on disk.

---

### `index_repository`

Index a Git repository and cache parse results per file.

| Parameter         | Type     | Required | Description                         |
| ----------------- | -------- | -------- | ----------------------------------- |
| `repositoryPath`  | string   | ✓        | Absolute path to the Git repository |
| `includePatterns` | string[] |          | Glob patterns for files to include  |
| `excludePatterns` | string[] |          | Glob patterns for files to exclude  |

---

### `search_functions`

Search for functions, methods, arrow functions, async functions, stored procedures, and SQL functions.

| Parameter         | Type    | Required | Description                                  |
| ----------------- | ------- | -------- | -------------------------------------------- |
| `repositoryPath`  | string  | ✓        | Path to indexed repository                   |
| `functionName`    | string  |          | Name to search for (substring match)         |
| `fileName`        | string  |          | File path filter (substring match)           |
| `caseInsensitive` | boolean |          | Case-insensitive matching (default: `false`) |

---

### `search_classes`

Search for classes and interfaces.

| Parameter         | Type    | Required | Description                          |
| ----------------- | ------- | -------- | ------------------------------------ |
| `repositoryPath`  | string  | ✓        | Path to indexed repository           |
| `className`       | string  |          | Name to search for (substring match) |
| `fileName`        | string  |          | File path filter                     |
| `caseInsensitive` | boolean |          | Case-insensitive matching            |

---

### `search_imports`

Search for import statements and C# `using` directives.

| Parameter         | Type    | Required | Description                       |
| ----------------- | ------- | -------- | --------------------------------- |
| `repositoryPath`  | string  | ✓        | Path to indexed repository        |
| `moduleName`      | string  |          | Module or namespace to search for |
| `fileName`        | string  |          | File path filter                  |
| `caseInsensitive` | boolean |          | Case-insensitive matching         |

---

### `search_sql_tables`

Search for SQL `CREATE TABLE` definitions.

| Parameter         | Type    | Required | Description                |
| ----------------- | ------- | -------- | -------------------------- |
| `repositoryPath`  | string  | ✓        | Path to indexed repository |
| `tableName`       | string  |          | Table name to search for   |
| `fileName`        | string  |          | File path filter           |
| `caseInsensitive` | boolean |          | Case-insensitive matching  |

---

### `search_sql_views`

Search for SQL `CREATE VIEW` definitions.

| Parameter         | Type    | Required | Description                |
| ----------------- | ------- | -------- | -------------------------- |
| `repositoryPath`  | string  | ✓        | Path to indexed repository |
| `viewName`        | string  |          | View name to search for    |
| `fileName`        | string  |          | File path filter           |
| `caseInsensitive` | boolean |          | Case-insensitive matching  |

---

### `search_sql_triggers`

Search for SQL `CREATE TRIGGER` definitions.

| Parameter         | Type    | Required | Description                |
| ----------------- | ------- | -------- | -------------------------- |
| `repositoryPath`  | string  | ✓        | Path to indexed repository |
| `triggerName`     | string  |          | Trigger name to search for |
| `fileName`        | string  |          | File path filter           |
| `caseInsensitive` | boolean |          | Case-insensitive matching  |

---

### `search_sql_indexes`

Search for SQL `CREATE INDEX` definitions.

| Parameter         | Type    | Required | Description                |
| ----------------- | ------- | -------- | -------------------------- |
| `repositoryPath`  | string  | ✓        | Path to indexed repository |
| `indexName`       | string  |          | Index name to search for   |
| `fileName`        | string  |          | File path filter           |
| `caseInsensitive` | boolean |          | Case-insensitive matching  |

---

### `get_statistics`

Return symbol and file counts for an indexed repository.

| Parameter        | Type   | Required | Description                |
| ---------------- | ------ | -------- | -------------------------- |
| `repositoryPath` | string | ✓        | Path to indexed repository |

---

### `clear_cache`

Clear the memory and disk cache for one repository or for all repositories.

| Parameter        | Type   | Required | Description                                   |
| ---------------- | ------ | -------- | --------------------------------------------- |
| `repositoryPath` | string |          | Repository to clear. Omit to clear all caches |

---

## Glob pattern behavior

`includePatterns` and `excludePatterns` are standard glob patterns relative to the repository root.

Default exclude patterns:

```
**/.git/**
**/node_modules/**
**/dist/**
**/build/**
**/*.test.*
**/*.spec.*
**/*.Designer.cs
**/*.Generated.cs
**/bin/**
**/obj/**
**/coverage/**
**/.next/**
**/.nuxt/**
**/Service References/**
```

Patterns ending in `.ts` are automatically expanded to also match `.mts` and `.cts` variants.

## Cache behavior

Each file is cached by a key derived from its Git state:

- **Committed, unmodified files** → cache key is the Git commit hash of the last commit that touched the file.
- **Modified or untracked files** → cache key is the file's `mtime`.

The cache has two layers:

1. **Memory cache** — fastest, lives for the duration of the process.
2. **Disk cache** — persists across restarts, stored in the OS temp directory under `ast-indexer/`.

Use `clear_cache` to discard stale entries after large refactors or branch switches.
