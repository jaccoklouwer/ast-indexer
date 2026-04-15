# Usage

## Installation Options

The intended setup is a global install:

```bash
npm install -g @klouwer94/ast-indexer
```

AST-Indexer requires Node.js 20 or newer.

If you prefer to run the server from a local checkout instead, build the project first:

```bash
pnpm install
pnpm build
```

## MCP Client Configuration

### Global Install

```json
{
  "mcpServers": {
    "ast-indexer": {
      "command": "ast-indexer"
    }
  }
}
```

### Local Build

```json
{
  "mcpServers": {
    "ast-indexer": {
      "command": "node",
      "args": ["/path/to/AST-Indexer/dist/index.js"]
    }
  }
}
```

### `npx`

```json
{
  "mcpServers": {
    "ast-indexer": {
      "command": "npx",
      "args": ["-y", "@klouwer94/ast-indexer"]
    }
  }
}
```

## MCP Tools

### `index_repository`

Indexes a Git repository and analyzes its code structure.

Parameters:

- `repositoryPath`: Absolute path to the Git repository.
- `includePatterns`: Optional glob patterns to include.
- `excludePatterns`: Optional glob patterns to exclude.

Patterns ending in `.ts` also match `.mts` and `.cts`, so existing TypeScript globs automatically include both module variants.

The scanner excludes common generated and repository metadata folders by default, including `.git`, `node_modules`, `dist`, `build`, `bin`, and `obj`.

To keep the MCP process stable on large repositories, `index_repository` now fails fast when a run exceeds the configured file limit or when parse failures cross the configured threshold. Use include/exclude patterns to narrow the input set when needed.

Example:

```json
{
  "repositoryPath": "/path/to/repo",
  "includePatterns": ["src/**/*.ts"],
  "excludePatterns": ["node_modules/**", "dist/**"]
}
```

Relevant environment variables:

- `AST_INDEXER_CONCURRENCY`: Override the number of parse workers.
- `AST_INDEXER_MAX_FILES`: Maximum number of parseable files per indexing run. Default: `10000`.
- `AST_INDEXER_MAX_PARSE_FAILURES`: Maximum parse failures before indexing aborts. Default: `25`.
- `AST_INDEXER_MAX_REQUEST_BYTES`: Maximum HTTP request body size in bytes. Default: `1048576`.

### `search_functions`

Searches functions in an indexed repository.

Parameters:

- `repositoryPath`: Path to the indexed repository.
- `functionName`: Optional partial function name filter.
- `fileName`: Optional file name filter.
- `caseInsensitive`: Optional case-insensitive matching.

### `search_classes`

Searches classes in an indexed repository.

Parameters:

- `repositoryPath`: Path to the indexed repository.
- `className`: Optional partial class name filter.
- `fileName`: Optional file name filter.
- `caseInsensitive`: Optional case-insensitive matching.

### `search_imports`

Searches import statements in an indexed repository.

Parameters:

- `repositoryPath`: Path to the indexed repository.
- `moduleName`: Optional partial module name filter.
- `fileName`: Optional file name filter.
- `caseInsensitive`: Optional case-insensitive matching.

### `get_statistics`

Returns statistics for an indexed repository.

Parameters:

- `repositoryPath`: Path to the indexed repository.

Example output:

```json
{
  "filesIndexed": 42,
  "totalFunctions": 158,
  "totalClasses": 23,
  "totalImports": 234,
  "totalVariables": 89,
  "totalSqlTables": 15,
  "totalSqlViews": 8,
  "filesByLanguage": {
    "javascript": 20,
    "typescript": 15,
    "csharp": 5,
    "sql": 2
  },
  "indexedAt": "2026-02-10T12:34:56.789Z"
}
```

### `search_sql_tables`

Searches SQL tables in an indexed repository.

Parameters:

- `repositoryPath`: Path to the indexed repository.
- `tableName`: Optional partial table name filter.
- `fileName`: Optional file name filter.
- `caseInsensitive`: Optional case-insensitive matching.

### `search_sql_views`

Searches SQL views in an indexed repository.

Parameters:

- `repositoryPath`: Path to the indexed repository.
- `viewName`: Optional partial view name filter.
- `fileName`: Optional file name filter.
- `caseInsensitive`: Optional case-insensitive matching.
