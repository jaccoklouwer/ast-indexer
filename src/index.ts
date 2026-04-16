#!/usr/bin/env node

import * as http from 'node:http';
import * as path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { RepositoryIndexer } from './indexer.js';
import {
  IndexRepositoryArgsSchema,
  SearchClassesArgsSchema,
  SearchFunctionsArgsSchema,
  SearchImportsArgsSchema,
  SearchSqlIndexesArgsSchema,
  SearchSqlTablesArgsSchema,
  SearchSqlTriggersArgsSchema,
  SearchSqlViewsArgsSchema,
} from './schemas.js';

const require = createRequire(import.meta.url);
const packageMetadata = require('../package.json') as {
  name?: string;
  version?: string;
  description?: string;
};

const SERVER_NAME = 'ast-indexer';
const SERVER_VERSION = packageMetadata.version ?? '0.0.0';
const DEFAULT_TRANSPORT = 'stdio';
const DEFAULT_HTTP_PORT = 3847;
const JSON_HEADERS = { 'Content-Type': 'application/json' };
const sharedIndexer = new RepositoryIndexer();

const GetStatisticsArgsSchema = z.object({
  repositoryPath: z.string().describe('Pad naar geindexeerde repository'),
});

const ClearCacheArgsSchema = z.object({
  repositoryPath: z
    .string()
    .optional()
    .describe('Pad naar repository waarvan cache gewist moet worden'),
});

type TransportType = 'stdio' | 'http';

interface CliOptions {
  transport: TransportType;
  port: number;
}

interface RequestBodyResult {
  body: unknown;
  hasInvalidJson: boolean;
}

function createToolResponse<T extends Record<string, unknown>>(
  payload: T,
): {
  content: Array<{ type: 'text'; text: string }>;
  structuredContent: T;
} {
  return {
    content: [
      {
        type: 'text',
        text: JSON.stringify(payload, null, 2),
      },
    ],
    structuredContent: payload,
  };
}

function createToolErrorResponse(error: unknown): {
  isError: true;
  content: Array<{ type: 'text'; text: string }>;
} {
  return {
    isError: true,
    content: [
      {
        type: 'text',
        text: `Fout: ${error instanceof Error ? error.message : String(error)}`,
      },
    ],
  };
}

function parseCliOptions(argv: string[]): CliOptions {
  let transport: TransportType = DEFAULT_TRANSPORT;
  let port = DEFAULT_HTTP_PORT;

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    const nextArg = argv[index + 1];

    if (arg === '--transport' && nextArg) {
      if (nextArg === 'stdio' || nextArg === 'http') {
        transport = nextArg;
      } else {
        throw new Error(`Ongeldige transport waarde: ${nextArg}`);
      }
      index += 1;
      continue;
    }

    if (arg.startsWith('--transport=')) {
      const value = arg.split('=')[1];
      if (value === 'stdio' || value === 'http') {
        transport = value;
      } else {
        throw new Error(`Ongeldige transport waarde: ${value}`);
      }
      continue;
    }

    if (arg === '--http') {
      transport = 'http';
      continue;
    }

    if (arg === '--port' && nextArg) {
      port = parsePort(nextArg);
      index += 1;
      continue;
    }

    if (arg.startsWith('--port=')) {
      port = parsePort(arg.split('=')[1] ?? '');
    }
  }

  return { transport, port };
}

function parsePort(value: string): number {
  const parsedValue = Number.parseInt(value, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    throw new Error(`Ongeldige poort: ${value}`);
  }

  return parsedValue;
}

function printHelp(): void {
  console.log(
    [
      `${packageMetadata.name ?? SERVER_NAME} v${SERVER_VERSION}`,
      packageMetadata.description ?? 'MCP server voor repository indexering via AST parsing.',
      '',
      'Gebruik:',
      '  ast-indexer [--transport stdio|http] [--port <nummer>]',
      '  ast-indexer --http [--port <nummer>]',
      '',
      'Opties:',
      '  --transport <stdio|http>  Kies het transport (standaard: stdio)',
      `  --port <nummer>           Poort voor http transport (standaard: ${DEFAULT_HTTP_PORT})`,
      '  --http                    Shortcut voor --transport http',
      '  -h, --help                Toon deze helptekst',
    ].join('\n'),
  );
}

function createServerInfo() {
  return {
    name: SERVER_NAME,
    version: SERVER_VERSION,
    description:
      packageMetadata.description ??
      'Indexeert Git repositories en maakt functies, classes, imports en SQL objecten doorzoekbaar.',
  };
}

function sendJsonResponse(
  response: http.ServerResponse,
  statusCode: number,
  payload: Record<string, unknown>,
): void {
  response.writeHead(statusCode, JSON_HEADERS);
  response.end(JSON.stringify(payload));
}

async function readRequestBody(request: http.IncomingMessage): Promise<RequestBodyResult> {
  if (request.method === 'GET' || request.method === 'HEAD') {
    return { body: undefined, hasInvalidJson: false };
  }

  return new Promise<RequestBodyResult>((resolve, reject) => {
    let rawBody = '';

    request.on('error', reject);
    request.on('data', (chunk: Buffer | string) => {
      rawBody += Buffer.isBuffer(chunk) ? chunk.toString('utf-8') : chunk;
    });
    request.on('end', () => {
      if (!rawBody) {
        resolve({ body: undefined, hasInvalidJson: false });
        return;
      }

      try {
        resolve({ body: JSON.parse(rawBody), hasInvalidJson: false });
      } catch {
        resolve({ body: undefined, hasInvalidJson: true });
      }
    });
  });
}

function registerCommonTools(server: McpServer, indexer: RepositoryIndexer): void {
  server.registerTool(
    'index_repository',
    {
      title: 'Index Repository',
      description: 'Indexeer een Git repository en cache parse-resultaten per bestand.',
      inputSchema: IndexRepositoryArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = IndexRepositoryArgsSchema.parse(args);
        const index = await indexer.indexRepository(
          validatedArgs.repositoryPath,
          validatedArgs.includePatterns,
          validatedArgs.excludePatterns,
        );

        return createToolResponse({
          success: true,
          message: `Repository geindexeerd: ${index.files.length} bestanden`,
          statistics: indexer.getStatistics(validatedArgs.repositoryPath),
        });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );

  server.registerTool(
    'search_functions',
    {
      title: 'Search Functions',
      description: 'Zoek functies in een geindexeerde repository.',
      inputSchema: SearchFunctionsArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = SearchFunctionsArgsSchema.parse(args);
        const results = indexer.searchFunctions(
          validatedArgs.repositoryPath,
          validatedArgs.functionName,
          validatedArgs.fileName,
          validatedArgs.caseInsensitive,
        );
        return createToolResponse({ success: true, count: results.length, functions: results });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );

  server.registerTool(
    'search_classes',
    {
      title: 'Search Classes',
      description: 'Zoek classes in een geindexeerde repository.',
      inputSchema: SearchClassesArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = SearchClassesArgsSchema.parse(args);
        const results = indexer.searchClasses(
          validatedArgs.repositoryPath,
          validatedArgs.className,
          validatedArgs.fileName,
          validatedArgs.caseInsensitive,
        );
        return createToolResponse({ success: true, count: results.length, classes: results });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );

  server.registerTool(
    'search_imports',
    {
      title: 'Search Imports',
      description: 'Zoek imports in een geindexeerde repository.',
      inputSchema: SearchImportsArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = SearchImportsArgsSchema.parse(args);
        const results = indexer.searchImports(
          validatedArgs.repositoryPath,
          validatedArgs.moduleName,
          validatedArgs.fileName,
          validatedArgs.caseInsensitive,
        );
        return createToolResponse({ success: true, count: results.length, imports: results });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );

  server.registerTool(
    'get_statistics',
    {
      title: 'Get Statistics',
      description: 'Haal statistieken op van een geindexeerde repository.',
      inputSchema: GetStatisticsArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = GetStatisticsArgsSchema.parse(args);
        return createToolResponse({
          success: true,
          statistics: indexer.getStatistics(validatedArgs.repositoryPath),
        });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );

  server.registerTool(
    'search_sql_tables',
    {
      title: 'Search SQL Tables',
      description: 'Zoek SQL tables in een geindexeerde repository.',
      inputSchema: SearchSqlTablesArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = SearchSqlTablesArgsSchema.parse(args);
        const results = indexer.searchSqlTables(
          validatedArgs.repositoryPath,
          validatedArgs.tableName,
          validatedArgs.fileName,
          validatedArgs.caseInsensitive,
        );
        return createToolResponse({ success: true, count: results.length, tables: results });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );

  server.registerTool(
    'search_sql_views',
    {
      title: 'Search SQL Views',
      description: 'Zoek SQL views in een geindexeerde repository.',
      inputSchema: SearchSqlViewsArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = SearchSqlViewsArgsSchema.parse(args);
        const results = indexer.searchSqlViews(
          validatedArgs.repositoryPath,
          validatedArgs.viewName,
          validatedArgs.fileName,
          validatedArgs.caseInsensitive,
        );
        return createToolResponse({ success: true, count: results.length, views: results });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );

  server.registerTool(
    'search_sql_triggers',
    {
      title: 'Search SQL Triggers',
      description: 'Zoek SQL triggers in een geindexeerde repository.',
      inputSchema: SearchSqlTriggersArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = SearchSqlTriggersArgsSchema.parse(args);
        const results = indexer.searchSqlTriggers(
          validatedArgs.repositoryPath,
          validatedArgs.triggerName,
          validatedArgs.fileName,
          validatedArgs.caseInsensitive,
        );
        return createToolResponse({ success: true, count: results.length, triggers: results });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );

  server.registerTool(
    'search_sql_indexes',
    {
      title: 'Search SQL Indexes',
      description: 'Zoek SQL indexes in een geindexeerde repository.',
      inputSchema: SearchSqlIndexesArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = SearchSqlIndexesArgsSchema.parse(args);
        const results = indexer.searchSqlIndexes(
          validatedArgs.repositoryPath,
          validatedArgs.indexName,
          validatedArgs.fileName,
          validatedArgs.caseInsensitive,
        );
        return createToolResponse({ success: true, count: results.length, indexes: results });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );

  server.registerTool(
    'clear_cache',
    {
      title: 'Clear Cache',
      description: 'Wis de memory- en disk-cache van een repository of van alle repositories.',
      inputSchema: ClearCacheArgsSchema,
    },
    async (args) => {
      try {
        const validatedArgs = ClearCacheArgsSchema.parse(args);
        await indexer.clearCache(validatedArgs.repositoryPath);
        return createToolResponse({
          success: true,
          message: validatedArgs.repositoryPath
            ? `Cache gewist voor ${validatedArgs.repositoryPath}`
            : 'Alle cache gewist',
        });
      } catch (error) {
        return createToolErrorResponse(error);
      }
    },
  );
}

export function createMcpServer(): McpServer {
  const server = new McpServer(createServerInfo(), {
    instructions:
      'Gebruik deze server voor het indexeren van repositories en het zoeken naar functies, classes, imports en SQL objecten. Indexeer eerst met index_repository voordat je zoektools aanroept.',
  });

  registerCommonTools(server, sharedIndexer);
  return server;
}

async function handleHttpRequest(
  request: http.IncomingMessage,
  response: http.ServerResponse,
  port: number,
  sessions: Map<string, StreamableHTTPServerTransport>,
): Promise<void> {
  const requestUrl = new URL(request.url ?? '/', `http://localhost:${port}`);

  if (requestUrl.pathname !== '/mcp') {
    sendJsonResponse(response, 404, { error: 'Niet gevonden' });
    return;
  }

  const { body, hasInvalidJson } = await readRequestBody(request);
  if (hasInvalidJson) {
    sendJsonResponse(response, 400, { error: 'Ongeldige JSON payload' });
    return;
  }

  const sessionHeader = request.headers['mcp-session-id'];
  const sessionId = Array.isArray(sessionHeader) ? sessionHeader[0] : sessionHeader;

  if (sessionId && sessions.has(sessionId)) {
    const transport = sessions.get(sessionId);
    if (!transport) {
      sendJsonResponse(response, 400, { error: 'Ongeldige sessie' });
      return;
    }

    await transport.handleRequest(request, response, body);
    return;
  }

  if (!sessionId && request.method === 'POST' && isInitializeRequest(body)) {
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => crypto.randomUUID(),
      onsessioninitialized: (generatedSessionId): void => {
        sessions.set(generatedSessionId, transport);
      },
    });

    transport.onclose = () => {
      if (transport.sessionId) {
        sessions.delete(transport.sessionId);
      }
    };

    const mcpServer = createMcpServer();
    await mcpServer.connect(transport);
    await transport.handleRequest(request, response, body);
    return;
  }

  sendJsonResponse(response, 400, { error: 'Ongeldig verzoek' });
}

async function startHttpServer(port: number): Promise<void> {
  const sessions = new Map<string, StreamableHTTPServerTransport>();

  const server = http.createServer((request, response) => {
    handleHttpRequest(request, response, port, sessions).catch((error: unknown) => {
      console.error('[AST-Indexer] Onverwachte fout in HTTP handler:', error);
      if (!response.headersSent) {
        sendJsonResponse(response, 500, { error: 'Interne serverfout' });
      }
    });
  });

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve());
  });

  console.error(`AST-Indexer MCP Server v${SERVER_VERSION} draait op http://localhost:${port}/mcp`);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }

  const options = parseCliOptions(args);

  if (options.transport === 'http') {
    await startHttpServer(options.port);
    return;
  }

  const transport = new StdioServerTransport();
  const server = createMcpServer();
  await server.connect(transport);
  console.error(`AST-Indexer MCP Server v${SERVER_VERSION} draait op stdio`);
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] ?? '')) {
  main().catch((error) => {
    console.error('Fatal error in main():', error);
    process.exit(1);
  });
}
