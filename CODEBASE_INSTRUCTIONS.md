# AST-Indexer Codebase Instructies

## Project Overzicht

AST-Indexer is een **Model Context Protocol (MCP) server** die Git repositories indexeert door Abstract Syntax Trees (AST) te parsen. Het project analyseert code in meerdere programmeertalen en maakt functies, classes, imports, variabelen en database objecten doorzoekbaar.

### Kernfunctionaliteit

- Multi-language AST parsing (JavaScript, TypeScript, C#, SQL)
- Git repository indexing met caching
- Krachtige zoekfunctionaliteit voor code artifacts
- MCP-compatible API voor integratie met AI tools

### Tech Stack

- **Runtime**: Node.js met TypeScript
- **Parsers**:
  - `@babel/parser` + `@babel/traverse` voor JS/TS
  - `tree-sitter` + `tree-sitter-c-sharp` voor C#
  - `node-sql-parser` voor SQL
- **Validatie**: Zod schemas
- **Git**: simple-git
- **Testing**: Vitest
- **MCP**: @modelcontextprotocol/sdk

---

## Architectuur

### Layered Architecture

```
┌─────────────────────────────────────┐
│   MCP Server Layer (index.ts)       │  ← Definieert tools en handles requests
├─────────────────────────────────────┤
│   Indexer Layer (indexer.ts)        │  ← Orchestreert indexing & caching
├─────────────────────────────────────┤
│   Parser Layer                       │  ← Language-specific parsing
│   ├─ parser.ts (router)             │
│   ├─ csharp-parser.ts               │
│   └─ sql-parser.ts                  │
├─────────────────────────────────────┤
│   Schema Layer (schemas.ts)         │  ← Type definitions met Zod
└─────────────────────────────────────┘
```

### Data Flow

1. **MCP Request** → Tool wordt aangeroepen via MCP protocol
2. **Indexer** → Valideert repository en orkestreert parsing
3. **Parser Router** → Bepaalt juiste parser op basis van file extensie
4. **Language Parser** → Parsed AST en extraheert artifacts
5. **Schema Validation** → Zod valideert data structure
6. **Cache** → Results worden in-memory gecached
7. **MCP Response** → Resultaten worden teruggestuurd als JSON

---

## Bestandsstructuur & Verantwoordelijkheden

### 📁 `src/index.ts` - MCP Server Entry Point

**Belangrijkste verantwoordelijkheden:**

- Definieert MCP tools (index_repository, search_functions, etc.)
- Handles tool invocations
- Initialiseert RepositoryIndexer
- Manages stdio transport voor MCP communicatie

**Key patterns:**

```typescript
// Tool definitie structuur
const TOOLS: Tool[] = [
  {
    name: 'tool_name',
    description: 'Nederlandse beschrijving',
    inputSchema: {
      /* JSON Schema */
    },
  },
];

// Tool handler patroon
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;

  switch (name) {
    case 'index_repository':
      // Valideer args, call indexer, return result
      break;
  }
});
```

**Belangrijke punten:**

- Alle descriptions zijn in het Nederlands
- Tool names gebruiken snake_case
- Args worden altijd gevalideerd met Zod schemas
- Errors worden omgezet naar user-friendly messages

---

### 📁 `src/indexer.ts` - Repository Orchestration

**Belangrijkste verantwoordelijkheden:**

- Git repository validatie
- File scanning met glob patterns
- Orchestratie van parsing proces
- In-memory caching van indices
- Search operaties op gecachte data

**Key methods:**

```typescript
class RepositoryIndexer {
  // Cache: Map<repositoryPath, RepositoryIndex>
  private cache: Map<string, RepositoryIndex>;

  // Index complete repository
  async indexRepository(path, include?, exclude?): Promise<RepositoryIndex>;

  // Validatie
  async isGitRepository(path): Promise<boolean>;

  // Search operaties
  searchFunctions(repoPath, funcName?, fileName?): any[];
  searchClasses(repoPath, className?, fileName?): any[];
  searchImports(repoPath, moduleName?, fileName?): any[];
  searchSqlTables(repoPath, tableName?, fileName?): any[];
  searchSqlViews(repoPath, viewName?, fileName?): any[];

  // Statistics
  getStatistics(repoPath): object;
}
```

**Design patterns:**

- **Repository Pattern**: Abstracts data access/caching
- **Facade Pattern**: Eenvoudige interface voor complexe parsing logic
- **Strategy Pattern**: Verschillende search strategies

**Belangrijke punten:**

- Cache is NIET persistent (alleen in-memory)
- Search methods gebruiken `.includes()` voor partial matching
- Errors worden gegooid als repository niet geïndexeerd is
- File scanning gebruikt `scanDirectory` uit parser.ts

---

### 📁 `src/parser.ts` - Parser Router & JS/TS Parsing

**Belangrijkste verantwoordelijkheden:**

- Route naar juiste parser op basis van file extensie
- Directory scanning met glob pattern support
- JavaScript/TypeScript AST parsing met Babel
- Extractie van functions, classes, imports, variables, exports

**Key functions:**

```typescript
// Router functie - ENTRY POINT voor file parsing
export async function parseFile(filePath: string): Promise<FileIndex> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.cs') return parseCSharpFile(filePath);
  if (ext === '.sql') return parseSqlFile(filePath);
  return parseJavaScriptFile(filePath); // default
}

// Directory scanner met glob support
export async function scanDirectory(
  dirPath: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<string[]>;
```

**Babel Parsing Strategy:**

```typescript
// Parser configuratie
const plugins: any[] = ['jsx'];
if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
  plugins.push('typescript');
}

const ast = parse(content, {
  sourceType: 'module',
  plugins,
});

// Traverse patroon voor extractie
traverse(ast, {
  FunctionDeclaration(path) {
    /* extract functions */
  },
  VariableDeclarator(path) {
    /* extract arrow functions */
  },
  ClassDeclaration(path) {
    /* extract classes */
  },
  ImportDeclaration(path) {
    /* extract imports */
  },
  // etc.
});
```

**Belangrijke punten:**

- Babel gebruikt voor JS/TS vanwege excellent TypeScript support
- Default excludePatterns: `node_modules`, `dist`, `.git`, binary files
- Arrow functions worden gedetecteerd via VariableDeclarator
- Class methods en properties worden recursief geëxtraheerd
- Relative paths worden gebruikt in FileIndex

---

### 📁 `src/csharp-parser.ts` - C# Parsing

**Belangrijkste verantwoordelijkheden:**

- Parse C# bestanden met Tree-sitter
- Extractie van namespaces, classes, interfaces, methods
- Support voor access modifiers (public, private, etc.)
- Extractie van using directives

**Tree-sitter Strategy:**

```typescript
const parser = new Parser();
parser.setLanguage(CSharp);
const tree = parser.parse(content);

// Recursieve traversal functie
const traverse = (node: Parser.SyntaxNode, namespace?: string) => {
  // Check node types en extract informatie
  if (node.type === 'class_declaration') {
    /* ... */
  }
  if (node.type === 'namespace_declaration') {
    /* ... */
  }

  // Recurse door children
  for (let i = 0; i < node.childCount; i++) {
    traverse(node.child(i)!, namespace);
  }
};
```

**Belangrijke extracties:**

- **Namespaces**: Worden doorgegeven aan child nodes
- **Modifiers**: public, private, static, abstract, etc.
- **Base classes**: Via `bases` field name
- **Interfaces**: Via `implements` array in ClassInfo
- **Methods & Properties**: Uit class body

**Belangrijke punten:**

- Tree-sitter geeft zero-based line numbers → +1 voor display
- `getNodeText()` helper gebruikt `node.startIndex/endIndex`
- Namespace context wordt door recursion doorgegeven
- Interface declarations worden gemarkeerd met `isInterface: true`

---

### 📁 `src/sql-parser.ts` - SQL Parsing

**Belangrijkste verantwoordelijkheden:**

- Parse SQL bestanden (CREATE statements)
- Extractie van tables, views, stored procedures, functions
- Column extractie voor tables
- Parameter extractie voor procedures/functions

**Parsing Strategy:**

```typescript
// Statement splitting (primitief maar effectief)
const statements = content.split(/;[\s\n]+/).filter((s) => s.trim());

// Regex-based parsing per statement type
for (const statement of statements) {
  if (trimmed.startsWith('CREATE TABLE')) {
    /* regex match */
  }
  if (trimmed.startsWith('CREATE VIEW')) {
    /* regex match */
  }
  if (trimmed.startsWith('CREATE PROCEDURE')) {
    /* regex match */
  }
  if (trimmed.startsWith('CREATE FUNCTION')) {
    /* regex match */
  }
}
```

**Regex Patterns:**

- **Table**: `/CREATE\s+TABLE\s+(\[?[\w.]+\]?)/i`
- **View**: `/CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(\[?[\w.]+\]?)/i`
- **Procedure**: `/CREATE\s+(?:PROCEDURE|PROC)\s+(\[?[\w.]+\]?)\s*(?:\((.*?)\))?/is`
- **Function**: `/CREATE\s+FUNCTION\s+(\[?[\w.]+\]?)\s*\((.*?)\)\s*RETURNS\s+([\w()]+)/is`

**Belangrijke punten:**

- Brackets `[` en `]` worden gestript (SQL Server syntax)
- Schema names (e.g., `dbo.Table`) blijven intact
- Parameters worden geëxtraheerd met `/@(\w+)/g` regex
- Return types worden bewaard voor functions
- Error handling: skip unparseable statements
- Line numbering wordt bijgehouden door newlines te tellen

---

### 📁 `src/schemas.ts` - Type Definitions

**Belangrijkste verantwoordelijkheden:**

- Definieer Zod schemas voor alle data structures
- Type inference met TypeScript
- Validatie van MCP tool arguments
- Documentatie via `.describe()` methods

**Schema Hierarchy:**

```
RepositoryIndex
└─ FileIndex[]
   ├─ FunctionInfo[]
   ├─ ClassInfo[]
   ├─ ImportInfo[]
   ├─ VariableInfo[]
   ├─ SqlTableInfo[] (optional)
   └─ SqlViewInfo[] (optional)
```

**Key Patterns:**

```typescript
// Schema definitie met Zod
export const FunctionSchema = z.object({
  name: z.string(),
  type: z.enum([...]),
  // ... fields
  returnType: z.string().optional(), // Language-specific
});

// Type inference
export type FunctionInfo = z.infer<typeof FunctionSchema>;

// MCP argument schemas met descriptions
export const SearchFunctionsArgsSchema = z.object({
  repositoryPath: z.string().describe("Path to indexed repository"),
  // ...
});
```

**Language-Specific Fields:**

| Field                | JS/TS | C#  | SQL |
| -------------------- | ----- | --- | --- |
| `returnType`         | ❌    | ✅  | ✅  |
| `isPublic/isStatic`  | ❌    | ✅  | ❌  |
| `namespace`          | ❌    | ✅  | ❌  |
| `implements`         | ❌    | ✅  | ❌  |
| `sqlTables/sqlViews` | ❌    | ❌  | ✅  |

**Belangrijke punten:**

- Alle language-specific fields zijn `optional()`
- `language` field in FileIndex voor type identification
- `type` enums zijn extensible (easy to add new types)
- Zod parsing wordt gebruikt in index.ts voor validation

---

## Testing Strategy

### Test Structure

```
tests/
├─ parser.test.ts          → JS/TS parsing tests
├─ csharp-parser.test.ts   → C# parsing tests
├─ sql-parser.test.ts      → SQL parsing tests
├─ indexer.test.ts         → Integration tests
└─ schemas.test.ts         → Schema validation tests
```

### Testing Patterns

**Unit tests per parser:**

```typescript
describe('parseFile', () => {
  it('should parse JavaScript functions', async () => {
    // Arrange: create temp file
    // Act: parse file
    // Assert: check extracted artifacts
  });
});
```

**Integration tests (indexer):**

```typescript
describe('RepositoryIndexer', () => {
  it('should index complete repository', async () => {
    // Arrange: setup git repo
    // Act: index repository
    // Assert: verify cache and search
  });
});
```

**Test Commands:**

- `pnpm test` - Run all tests once
- `pnpm run test:watch` - Watch mode voor TDD
- `pnpm run test:ui` - Interactive UI
- `pnpm run test:coverage` - Coverage report

---

## Development Workflow

### Setup & Building

```bash
# Install dependencies
pnpm install

# Development mode (met tsx hot-reload)
pnpm run dev

# Build TypeScript
pnpm run build

# Watch mode
pnpm run watch
```

### Testing tijdens ontwikkeling

```bash
# Watch mode voor TDD
pnpm run test:watch

# Test specifieke file
pnpm test -- parser.test.ts

# Coverage voor specifieke file
pnpm run test:coverage -- --coverage.include=src/parser.ts
```

### MCP Server Testing

De server communiceert via stdio volgens MCP protocol. Voor testing:

1. **Claude Desktop Integration**: Configureer in Claude settings
2. **MCP Inspector**: Gebruik officiele MCP debugging tool
3. **Manual stdio test**: Echo JSON via stdin

---

## Key Design Patterns

### 1. **Strategy Pattern** - Parser Selection

```typescript
// Context: parseFile router
// Strategies: parseJavaScriptFile, parseCSharpFile, parseSqlFile

export async function parseFile(filePath: string): Promise<FileIndex> {
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.cs') return parseCSharpFile(filePath);
  if (ext === '.sql') return parseSqlFile(filePath);
  return parseJavaScriptFile(filePath);
}
```

**Waarom**: Easy om nieuwe talen toe te voegen zonder bestaande code te wijzigen.

### 2. **Repository Pattern** - Indexer Cache

```typescript
class RepositoryIndexer {
  private cache: Map<string, RepositoryIndex> = new Map();

  getCachedIndex(repositoryPath: string): RepositoryIndex | undefined {
    return this.cache.get(repositoryPath);
  }
}
```

**Waarom**: Abstraheert data access, makkelijk om persistent storage toe te voegen.

### 3. **Visitor Pattern** - AST Traversal

```typescript
// Babel traverse gebruikt visitor pattern
traverse(ast, {
  FunctionDeclaration(path) {
    /* visit function nodes */
  },
  ClassDeclaration(path) {
    /* visit class nodes */
  },
});
```

**Waarom**: Clean separation of concerns voor verschillende node types.

### 4. **Facade Pattern** - Indexer Public API

```typescript
// Complex parsing logic hidden achter simple interface
await indexer.indexRepository(path);
const results = indexer.searchFunctions(path, 'handle');
```

**Waarom**: Gebruikers hoeven parsing details niet te kennen.

---

## Nieuwe Taal Toevoegen

### Stappen om nieuwe taal toe te voegen (bijv. Python)

1. **Installeer parser library**

   ```bash
   npm install tree-sitter-python
   ```

2. **Creëer `python-parser.ts`**

   ```typescript
   import Parser from 'tree-sitter';
   import Python from 'tree-sitter-python';

   export async function parsePythonFile(filePath: string): Promise<FileIndex> {
     const parser = new Parser();
     parser.setLanguage(Python);
     // ... implement traversal logic
   }
   ```

3. **Update schemas.ts**

   ```typescript
   // Voeg 'python' toe aan language enum
   language: z.enum(["javascript", "typescript", "csharp", "sql", "python"])

   // Voeg Python-specific fields toe indien nodig
   decorators: z.array(z.string()).optional(), // Voor @decorators
   ```

4. **Update parser.ts router**

   ```typescript
   export async function parseFile(filePath: string): Promise<FileIndex> {
     const ext = path.extname(filePath).toLowerCase();

     if (ext === '.cs') return parseCSharpFile(filePath);
     if (ext === '.sql') return parseSqlFile(filePath);
     if (ext === '.py') return parsePythonFile(filePath);
     return parseJavaScriptFile(filePath);
   }
   ```

5. **Update scanDirectory excludes**

   ```typescript
   const defaultExclude = [
     // ... existing
     '**/__pycache__/**',
     '**/*.pyc',
   ];
   ```

6. **Schrijf tests**

   ```typescript
   // tests/python-parser.test.ts
   describe('parsePythonFile', () => {
     it('should parse Python functions', async () => {
       /* ... */
     });
   });
   ```

7. **Update README.md** met Python support info

---

## Common Pitfalls & Best Practices

### ❌ Pitfall 1: Line Number Inconsistency

**Probleem**: Tree-sitter gebruikt 0-based line numbers, Babel gebruikt 1-based.

**Oplossing**:

```typescript
// Tree-sitter (C#, SQL)
startLine: node.startPosition.row + 1; // ✅ Add 1

// Babel (JS/TS)
startLine: path.node.loc.start.line; // ✅ Already 1-based
```

### ❌ Pitfall 2: Relative vs Absolute Paths

**Probleem**: FileIndex gebruikt basename, searches geven fullPath terug.

**Oplossing**:

```typescript
// In parser: use basename
file: path.basename(filePath);

// In search: augment with fullPath
results.push({
  ...func,
  fullPath: file.path, // ✅ Add full path to results
});
```

### ❌ Pitfall 3: Complex Node Types

**Probleem**: Parameter destructuring, spreads, etc. zijn complex AST nodes.

**Oplossing**:

```typescript
params: path.node.params.map(
  (param) => (t.isIdentifier(param) ? param.name : 'complex'), // ✅ Fallback
);
```

### ❌ Pitfall 4: Cache Invalidation

**Probleem**: Cache wordt nooit geïnvalideerd, ook niet na file changes.

**Oplossing**: (TODO voor toekomstige verbetering)

```typescript
// Implementeer file watching of timestamp checking
async indexRepository(path: string, force?: boolean) {
  if (force || this.isCacheStale(path)) {
    // Re-index
  }
}
```

### ✅ Best Practice 1: Type Safety

```typescript
// ✅ Gebruik Zod voor runtime validation
const validated = FunctionSchema.parse(extractedFunction);

// ✅ Gebruik TypeScript types voor compile-time safety
const func: FunctionInfo = {
  /* ... */
};
```

### ✅ Best Practice 2: Error Handling

```typescript
// ✅ Graceful degradation per file
for (const filePath of filePaths) {
  try {
    const fileIndex = await parseFile(filePath);
    files.push(fileIndex);
  } catch (error) {
    console.error(`Fout bij parsen van ${filePath}:`, error);
    // Continue met volgende bestand
  }
}
```

### ✅ Best Practice 3: Extensible Enums

```typescript
// ✅ Easy om nieuwe types toe te voegen
type: z.enum([
  'function',
  'method',
  'arrow',
  'async',
  'stored_procedure',
  'sql_function',
  // Voeg nieuwe types hier toe
]);
```

---

## MCP Server Specifics

### MCP Protocol Basics

MCP servers communiceren via **JSON-RPC over stdio**. Key concepts:

1. **Tools**: Beschikbare functies voor clients
2. **Requests**: Client stuurt request met tool name en arguments
3. **Responses**: Server stuurt result of error terug

### Server Lifecycle

```typescript
// 1. Initialize server
const server = new Server({ name: 'ast-indexer', version: '1.0.0' });

// 2. Register tool list handler
server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: TOOLS,
}));

// 3. Register tool invocation handler
server.setRequestHandler(CallToolRequestSchema, async (request) => {
  // Handle tool calls
});

// 4. Start stdio transport
const transport = new StdioServerTransport();
await server.connect(transport);
```

### Tool Response Format

```typescript
// ✅ Success response
return {
  content: [
    {
      type: 'text',
      text: JSON.stringify(result, null, 2),
    },
  ],
};

// ❌ Error response
return {
  content: [
    {
      type: 'text',
      text: `Error: ${error.message}`,
    },
  ],
  isError: true,
};
```

### Testing MCP Integration

**Via Claude Desktop:**

1. Add to `claude_desktop_config.json`:

   ```json
   {
     "mcpServers": {
       "ast-indexer": {
         "command": "node",
         "args": ["C:/path/to/AST-Indexer/dist/index.js"]
       }
     }
   }
   ```

2. Restart Claude Desktop

3. Test tools in conversation

---

## Toekomstige Verbeteringen

### 🚀 High Priority

1. **Persistent Cache**: SqlLite of file-based cache voor snellere re-indexing
2. **Incremental Updates**: Alleen gewijzigde files opnieuw parsen
3. **File Watching**: Auto-update index bij file changes
4. **Better Error Messages**: User-friendly error handling met recovery suggestions

### 💡 Medium Priority

5. **More Languages**: Python, Java, Go, Rust parsers toevoegen
6. **Semantic Search**: Embedding-based code search
7. **Dependency Graph**: Visualize imports en relationships
8. **Symbol Rename**: Refactoring support via MCP

### 🎯 Low Priority

9. **Performance Metrics**: Parsing tijd per file tracken
10. **Configuration File**: `.astindexerrc` voor custom settings
11. **Plugin System**: User-defined extractors
12. **Web UI**: Optional web interface voor browsing

---

## Quick Reference

### File Extensions → Parser Mapping

| Extension                     | Parser     | Library                 |
| ----------------------------- | ---------- | ----------------------- |
| `.js`, `.jsx`, `.mjs`, `.cjs` | JavaScript | Babel                   |
| `.ts`, `.tsx`                 | TypeScript | Babel                   |
| `.cs`                         | C#         | Tree-sitter             |
| `.sql`                        | SQL        | Regex + node-sql-parser |

### Key Data Structures

```typescript
RepositoryIndex {
  repositoryPath: string
  files: FileIndex[]
  indexedAt: string (ISO timestamp)
}

FileIndex {
  path: string
  functions: FunctionInfo[]
  classes: ClassInfo[]
  imports: ImportInfo[]
  variables: VariableInfo[]
  exports: string[]
  sqlTables?: SqlTableInfo[]  // SQL only
  sqlViews?: SqlViewInfo[]    // SQL only
  language?: "javascript" | "typescript" | "csharp" | "sql"
}
```

### Common Git Issues

**Problem**: Repository heeft submodules
**Solution**: Skip submodules in scanDirectory

**Problem**: Large repositories timeout
**Solution**: Use includePatterns to focus on specific dirs

**Problem**: Binary files cause parsing errors
**Solution**: Already excluded in defaultExcludePatterns

---

## Contact & Maintenance

**Author**: Jacco Klouwer  
**License**: ISC  
**Repository**: [Link to Git repo if exists]

**Voor vragen of issues**: Create issue in repository of contact via [contact method]

---

## Conclusie

Deze codebase is **goed gestructureerd, testbaar, en extensible**. De belangrijkste principes:

1. ✅ **Separation of concerns**: Elke parser is geïsoleerd
2. ✅ **Type safety**: Zod schemas + TypeScript
3. ✅ **Testability**: Unit en integration tests
4. ✅ **Extensibility**: Easy om nieuwe talen toe te voegen
5. ✅ **MCP compliance**: Volgt protocol specifications

**Bij wijzigingen altijd:**

- Run tests (`npm test`)
- Update schemas indien nodig
- Voeg tests toe voor nieuwe features
- Update deze documentatie
- Check MCP compatibility

Happy coding! 🚀

---

## Commit & Release Workflow

Voor committen en releasen in deze repository, volg de dedicated instructies in:

- `.github/git-release.instructions.md`

Kerncommando's:

- `pnpm commit`
- `pnpm release`
- `pnpm run publish:check`
- `pnpm push`

Standaard releasepad:

- lokaal: `pnpm run publish:check`, `pnpm release`, `pnpm push`
- daarna: GitHub Actions `publish.yml` publiceert naar npm na environment approval
- alleen als noodpad: `pnpm run publish:npm`
