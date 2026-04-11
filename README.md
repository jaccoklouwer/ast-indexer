# AST-Indexer MCP Server

Een Model Context Protocol (MCP) server voor het indexeren van Git repositories met behulp van Abstract Syntax Tree (AST) parsing. Deze tool analyseert code in verschillende talen om functies, classes, imports, variabelen en database objecten te identificeren en doorzoekbaar te maken.

## Features

- 🔍 **Multi-Language AST Parsing**:
  - JavaScript (.js, .jsx, .mjs, .cjs)
  - TypeScript (.ts, .tsx)
  - C# (.cs)
  - SQL (.sql)
- 📦 **Git Repository Indexing**: Indexeer complete Git repositories
- 🔎 **Krachtig zoeken**: Zoek naar functies, classes, imports, variabelen, SQL tables en views
- 💾 **Database Support**: Indexeer SQL stored procedures, functions, tables en views
- 🎯 **C# Support**: Volledig support voor namespaces, interfaces, en access modifiers
- ✅ **Type-safe**: Volledig geschreven in TypeScript met Zod validatie
- 🧪 **Goed getest**: Uitgebreide unit tests met Vitest
- 🚀 **MCP Compatible**: Werkt met alle MCP-compatible clients

## Installatie

```bash
# Eenmalig gebruiken via npx
npx @klouwer94/ast-indexer --help

# Of globaal installeren
npm install -g @klouwer94/ast-indexer
ast-indexer --help
```

Vereist Node.js 20 of nieuwer.

## Lokale ontwikkeling

```bash
pnpm install
```

## Building

```bash
pnpm run build
```

## Publish Check

```bash
pnpm run publish:check
```

Deze check draait lint, build, tests en een `npm pack --dry-run`, zodat je de uiteindelijke npm-tarball kunt inspecteren voor publish.

## Release Naar npm

```bash
# Controleer de package inhoud en kwaliteit
pnpm run publish:check

# Maak release commit + tag lokaal
pnpm release

# Push daarna commit en tag naar GitHub
pnpm push
```

Standaard publiceert GitHub Actions daarna naar npm zodra de tag-workflow start en de `npm-publish` environment is goedgekeurd.

Configureer daarvoor eenmalig:

- npm Trusted Publishing voor deze repository/package
- een GitHub Environment met naam `npm-publish` en verplichte reviewers

Gebruik `pnpm run publish:npm` alleen nog als handmatig noodpad. Voor een extra veilige laatste controle kun je eerst `pnpm run publish:npm:dry-run` draaien.

## CI/CD

De repository gebruikt twee GitHub Actions workflows:

- `ci.yml`: draait lint, build, tests en `npm pack --dry-run` op pull requests en pushes naar `main`
- `publish.yml`: draait op `v*` tags, valideert de release opnieuw en publiceert daarna naar npm na environment approval

## Development

```bash
pnpm run dev
```

## Testing

```bash
# Run tests once
pnpm test

# Watch mode
pnpm run test:watch

# Run tests met UI
pnpm run test:ui

# Run tests met coverage
pnpm run test:coverage
```

## MCP Tools

De server biedt de volgende MCP tools:

### 1. `index_repository`

Indexeer een Git repository en analyseer de code structuur.

**Parameters:**

- `repositoryPath` (required): Absolute pad naar de Git repository
- `includePatterns` (optional): Array van glob patterns voor bestanden om te includeren
- `excludePatterns` (optional): Array van glob patterns voor bestanden om te excluderen

Standaard slaat de scanner Git metadata, build output, testbestanden en veelgebruikte gegenereerde mappen over, zoals `.git`, `node_modules`, `dist`, `bin` en `obj`.

**Voorbeeld:**

```json
{
  "repositoryPath": "/path/to/repo",
  "excludePatterns": ["node_modules/**", "dist/**"]
}
```

### 2. `search_functions`

Zoek functies in een geïndexeerde repository.

**Parameters:**

- `repositoryPath` (required): Pad naar geïndexeerde repository
- `functionName` (optional): Functienaam om te zoeken (partial match)
- `fileName` (optional): Bestandsnaam filter
- `caseInsensitive` (optional): Case-insensitieve matching (default: false)

**Voorbeeld:**

```json
{
  "repositoryPath": "/path/to/repo",
  "functionName": "handle"
}
```

### 3. `search_classes`

Zoek classes in een geïndexeerde repository.

**Parameters:**

- `repositoryPath` (required): Pad naar geïndexeerde repository
- `className` (optional): Classnaam om te zoeken (partial match)
- `fileName` (optional): Bestandsnaam filter
- `caseInsensitive` (optional): Case-insensitieve matching (default: false)

### 4. `search_imports`

Zoek import statements in een geïndexeerde repository.

**Parameters:**

- `repositoryPath` (required): Pad naar geïndexeerde repository
- `moduleName` (optional): Module naam om te zoeken (partial match)
- `fileName` (optional): Bestandsnaam filter
- `caseInsensitive` (optional): Case-insensitieve matching (default: false)

### 5. `get_statistics`

Haal statistieken op van een geïndexeerde repository.

**Parameters:**

- `repositoryPath` (required): Pad naar geïndexeerde repository

**Output:**

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

### 6. `search_sql_tables`

Zoek SQL tables in een geïndexeerde repository.

**Parameters:**

- `repositoryPath` (required): Pad naar geïndexeerde repository
- `tableName` (optional): Table naam om te zoeken (partial match)
- `fileName` (optional): Bestandsnaam filter
- `caseInsensitive` (optional): Case-insensitieve matching (default: false)

**Voorbeeld:**

```json
{
  "repositoryPath": "/path/to/repo",
  "tableName": "User"
}
```

### 7. `search_sql_views`

Zoek SQL views in een geïndexeerde repository.

**Parameters:**

- `repositoryPath` (required): Pad naar geïndexeerde repository
- `viewName` (optional): View naam om te zoeken (partial match)
- `fileName` (optional): Bestandsnaam filter
- `caseInsensitive` (optional): Case-insensitieve matching (default: false)

## Project Structuur

```
.
├── src/
│   ├── index.ts          # MCP Server entry point
│   ├── indexer.ts        # Repository indexer logic
│   ├── parser.ts         # Main AST parsing orchestration
│   ├── csharp-parser.ts  # C# AST parsing with Tree-sitter
│   ├── sql-parser.ts     # SQL parsing logic
│   └── schemas.ts        # Zod schemas
├── tests/
│   ├── schemas.test.ts
│   ├── parser.test.ts
│   └── indexer.test.ts
├── package.json
├── tsconfig.json
└── vitest.config.ts
```

## Gebruik met MCP Client

Voeg de volgende configuratie toe aan je MCP client (bijv. Claude Desktop):

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

Of gebruik npx:

```json
{
  "mcpServers": {
    "ast-indexer": {
      "command": "npx",
      "args": ["-y", "/path/to/AST-Indexer"]
    }
  }
}
```

## Technologieën

- **TypeScript**: Type-safe code
- **@modelcontextprotocol/sdk**: MCP server implementatie
- **TypeScript Compiler API**: JavaScript/TypeScript AST parsing
- **tree-sitter & tree-sitter-c-sharp**: C# AST parsing
- **node-sql-parser**: SQL parsing en analyse
- **simple-git**: Git repository interactie
- **Zod**: Schema validatie
- **Vitest**: Unit testing framework

## Licentie

ISC

## Author

Jacco Klouwer
# ast-indexer
