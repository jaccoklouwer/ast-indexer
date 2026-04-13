# AST-Indexer MCP Server

AST-Indexer is a Model Context Protocol (MCP) server for indexing Git repositories with AST parsing. It extracts functions, classes, imports, variables, and SQL schema objects from JavaScript, TypeScript, C#, and SQL codebases so they can be queried through MCP tools.

## Installation

Install the server globally:

```bash
npm install -g @klouwer94/ast-indexer
```

AST-Indexer requires Node.js 20 or newer.

Add it to your MCP client configuration:

```json
{
  "mcpServers": {
    "ast-indexer": {
      "command": "ast-indexer"
    }
  }
}
```

For local build and `npx` variants, see [docs/usage.md](docs/usage.md).

## Features

- Index Git repositories with include and exclude glob patterns.
- Parse JavaScript and TypeScript, including `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.mts`, and `.cts`.
- Parse C# with Tree-sitter and SQL with `node-sql-parser`.
- Search indexed repositories for functions, classes, imports, SQL tables, and SQL views.
- Return repository-level statistics for indexed files and extracted symbols.
- Cache indexes by repository state to avoid unnecessary reprocessing.
- Built with TypeScript, Zod, and Vitest.

### Using the MCP server

See [docs/usage.md](docs/usage.md) for tool reference, configuration examples, and pattern behavior.

If you want to understand how the codebase is structured, see [docs/project-architecture.md](docs/project-architecture.md).

## Contributors

[![Contributors](https://img.shields.io/github/contributors/jaccoklouwer/ast-indexer)](https://github.com/jaccoklouwer/ast-indexer/graphs/contributors)

Contributions are welcome. See [CONTRIBUTING.md](CONTRIBUTING.md) for local setup and contribution guidelines.

## License

ISC
