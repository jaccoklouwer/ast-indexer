#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'node:http';
import { createRequire } from 'node:module';
import { z } from 'zod';
import { RepositoryIndexer } from './indexer.js';
import {
  SearchClassesArgsSchema,
  SearchFunctionsArgsSchema,
  SearchImportsArgsSchema,
  SearchSqlTablesArgsSchema,
  SearchSqlViewsArgsSchema,
} from './schemas.js';

// Gedeelde indexer singleton — alle clients delen dezelfde in-memory cache
const indexer = new RepositoryIndexer();
const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json') as { name?: string; version?: string };
const CLI_NAME = 'ast-indexer';
const PACKAGE_NAME = packageMetadata.name ?? '@klouwer94/ast-indexer';
const SERVER_VERSION = packageMetadata.version ?? '0.0.0';
const DEFAULT_HTTP_PORT = 3847;

/**
 * Toon hulp/usage voor de MCP server CLI.
 */
function printHelp(): void {
  console.log(
    [
      'AST-Indexer MCP Server — hulp/usage',
      '',
      'Gebruik:',
      `  npx ${PACKAGE_NAME} [opties]`,
      `  ${CLI_NAME} [opties]`,
      '',
      'Opties:',
      '  -h, --help                Toon deze hulptekst en sluit af',
      '  --http                    Start in HTTP modus (meerdere clients)',
      `  --port <n>                Poort voor HTTP modus (standaard: ${DEFAULT_HTTP_PORT})`,
      '  --concurrency <n>         Overschrijf aantal parse workers (env: AST_INDEXER_CONCURRENCY)',
      '',
      'Omgevingsvariabelen:',
      '  AST_INDEXER_CONCURRENCY  Aantal workers tijdens indexeren (standaard: min(16, cpu cores))',
      '',
      'Beschrijving:',
      '  Deze server biedt MCP tools voor het indexeren van Git repositories met AST parsing',
      '  en het zoeken naar functies, classes, imports en SQL objecten.',
      '',
      'Tools:',
      '  - index_repository       Indexeer een repository',
      '  - search_functions       Zoek functies',
      '  - search_classes         Zoek classes',
      '  - search_imports         Zoek imports',
      '  - get_statistics         Haal statistieken op',
      '  - search_sql_tables      Zoek SQL tables',
      '  - search_sql_views       Zoek SQL views',
    ].join('\n'),
  );
}

const IndexRepositoryArgsSchema = z.object({
  repositoryPath: z.string().describe('Absolute pad naar de Git repository'),
  includePatterns: z
    .array(z.string())
    .optional()
    .describe('Optionele glob patterns voor bestanden om te includeren'),
  excludePatterns: z
    .array(z.string())
    .optional()
    .describe('Optionele glob patterns voor bestanden om te excluderen'),
});

const GetStatisticsArgsSchema = z.object({
  repositoryPath: z.string().describe('Pad naar geïndexeerde repository'),
});

/**
 * Maakt een nieuwe McpServer instantie aan met alle tool handlers.
 * De gedeelde indexer singleton wordt via closure ingevangen.
 */
function createMcpServer(): McpServer {
  const server = new McpServer({
    name: 'ast-indexer',
    version: SERVER_VERSION,
  });

  server.registerTool(
    'index_repository',
    {
      description:
        'Indexeer een Git repository en analyseer de code structuur met AST parsing. Dit parseert alle JavaScript/TypeScript bestanden en extraheert functies, classes, imports en variabelen.',
    },
    async (args) => {
      const validatedArgs = IndexRepositoryArgsSchema.parse(args);
      const index = await indexer.indexRepository(
        validatedArgs.repositoryPath,
        validatedArgs.includePatterns,
        validatedArgs.excludePatterns,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                message: `Repository geïndexeerd: ${index.files.length} bestanden`,
                statistics: indexer.getStatistics(validatedArgs.repositoryPath),
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'search_functions',
    {
      description:
        'Zoek functies in een geïndexeerde repository. Je kunt filteren op functienaam en bestandsnaam.',
    },
    async (args) => {
      const validatedArgs = SearchFunctionsArgsSchema.parse(args);
      const results = indexer.searchFunctions(
        validatedArgs.repositoryPath,
        validatedArgs.functionName,
        validatedArgs.fileName,
        validatedArgs.caseInsensitive,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                count: results.length,
                functions: results,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'search_classes',
    {
      description:
        'Zoek classes in een geïndexeerde repository. Je kunt filteren op classnaam en bestandsnaam.',
    },
    async (args) => {
      const validatedArgs = SearchClassesArgsSchema.parse(args);
      const results = indexer.searchClasses(
        validatedArgs.repositoryPath,
        validatedArgs.className,
        validatedArgs.fileName,
        validatedArgs.caseInsensitive,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                count: results.length,
                classes: results,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'search_imports',
    {
      description:
        'Zoek import statements in een geïndexeerde repository. Je kunt filteren op module naam en bestandsnaam.',
    },
    async (args) => {
      const validatedArgs = SearchImportsArgsSchema.parse(args);
      const results = indexer.searchImports(
        validatedArgs.repositoryPath,
        validatedArgs.moduleName,
        validatedArgs.fileName,
        validatedArgs.caseInsensitive,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                count: results.length,
                imports: results,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'get_statistics',
    {
      description:
        'Haal statistieken op van een geïndexeerde repository, inclusief aantal functies, classes, imports en bestanden.',
    },
    async (args) => {
      const validatedArgs = GetStatisticsArgsSchema.parse(args);
      const stats = indexer.getStatistics(validatedArgs.repositoryPath);

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                statistics: stats,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'search_sql_tables',
    {
      description:
        'Zoek SQL tables in een geïndexeerde repository. Ondersteunt SQL bestanden met CREATE TABLE statements.',
    },
    async (args) => {
      const validatedArgs = SearchSqlTablesArgsSchema.parse(args);
      const results = indexer.searchSqlTables(
        validatedArgs.repositoryPath,
        validatedArgs.tableName,
        validatedArgs.fileName,
        validatedArgs.caseInsensitive,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                count: results.length,
                tables: results,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  server.registerTool(
    'search_sql_views',
    {
      description:
        'Zoek SQL views in een geïndexeerde repository. Ondersteunt SQL bestanden met CREATE VIEW statements.',
    },
    async (args) => {
      const validatedArgs = SearchSqlViewsArgsSchema.parse(args);
      const results = indexer.searchSqlViews(
        validatedArgs.repositoryPath,
        validatedArgs.viewName,
        validatedArgs.fileName,
        validatedArgs.caseInsensitive,
      );

      return {
        content: [
          {
            type: 'text',
            text: JSON.stringify(
              {
                success: true,
                count: results.length,
                views: results,
              },
              null,
              2,
            ),
          },
        ],
      };
    },
  );

  return server;
}

// Start server
/**
 * Haal de HTTP-poort op uit CLI-args, env-variabele, of gebruik de default (3847).
 * Volgorde: CLI --port > AST_INDEXER_HTTP_PORT > 3847
 */
function resolveHttpPort(args: string[]): number {
  const portArgIdx = args.findIndex((a) => a === '--port');
  const portStr =
    portArgIdx !== -1
      ? args[portArgIdx + 1]
      : (args.find((a) => a.startsWith('--port='))?.split('=')[1] ??
        process.env.AST_INDEXER_HTTP_PORT);
  return portStr ? Number.parseInt(portStr, 10) : DEFAULT_HTTP_PORT;
}

/**
 * Start de HTTP + StreamableHTTP server op de opgegeven poort.
 * Retourneert een Promise die resolvet zodra de server luistert,
 * of rejectet als de poort al in gebruik is (EADDRINUSE).
 */
function startHttpServer(port: number): Promise<void> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const httpServer = http.createServer(async (req, res) => {
    const url = new URL(req.url ?? '/', `http://localhost:${port}`);

    if (url.pathname !== '/mcp') {
      res.writeHead(404, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: 'Niet gevonden' }));
      return;
    }

    // Lees de request body
    const body = await new Promise<unknown>((resolve) => {
      let data = '';
      req.on('data', (chunk: Buffer) => {
        data += chunk.toString();
      });
      req.on('end', () => {
        try {
          resolve(JSON.parse(data));
        } catch {
          resolve(undefined);
        }
      });
    });

    const sessionId = req.headers['mcp-session-id'] as string | undefined;

    if (sessionId && sessions.has(sessionId)) {
      // Bestaande sessie hergebruiken
      const transport = sessions.get(sessionId)!;
      await transport.handleRequest(req, res, body);
      return;
    }

    if (!sessionId && req.method === 'POST' && isInitializeRequest(body)) {
      // Nieuwe sessie aanmaken
      const transport = new StreamableHTTPServerTransport({
        sessionIdGenerator: () => crypto.randomUUID(),
        onsessioninitialized: (sid): void => {
          sessions.set(sid, transport);
        },
      });
      transport.onclose = () => {
        if (transport.sessionId) sessions.delete(transport.sessionId);
      };
      const server = createMcpServer();
      await server.connect(transport);
      await transport.handleRequest(req, res, body);
      return;
    }

    res.writeHead(400, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Ongeldig verzoek' }));
  });

  return new Promise((resolve, reject) => {
    httpServer.once('error', reject);
    httpServer.listen(port, () => {
      console.error(`AST-Indexer HTTP server luistert op http://localhost:${port}/mcp`);
      resolve();
    });
  });
}

async function main() {
  // CLI help afhandelen voordat we verbinden
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }

  const httpPort = resolveHttpPort(args);

  if (args.includes('--http')) {
    // Expliciete HTTP-only modus: alleen HTTP server starten
    await startHttpServer(httpPort);
  } else {
    // Stdio modus: verbind stdio transport én start HTTP server in hetzelfde proces.
    // Alle clients (stdio + HTTP) delen zo dezelfde in-memory cache.
    // Als de poort al bezet is, draait er al een instantie — geen actie nodig.
    const transport = new StdioServerTransport();
    await createMcpServer().connect(transport);

    await startHttpServer(httpPort).catch((err: NodeJS.ErrnoException) => {
      if (err.code !== 'EADDRINUSE') {
        console.error('HTTP server fout:', err.message);
      }
    });

    console.error('AST-Indexer MCP Server gestart');
  }
}

main().catch((error) => {
  console.error('Server fout:', error);
  process.exit(1);
});
