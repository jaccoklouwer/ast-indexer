#!/usr/bin/env node

import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { StreamableHTTPServerTransport } from '@modelcontextprotocol/sdk/server/streamableHttp.js';
import { isInitializeRequest } from '@modelcontextprotocol/sdk/types.js';
import * as http from 'node:http';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { RepositoryIndexer } from './indexer.js';
import { TreeSitterEngine } from './tree-sitter-engine.js';
import { createCommonToolDefinitions } from './tool-registry.js';

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
const sharedTreeSitterEngine = new TreeSitterEngine();

type TransportType = 'stdio' | 'http';

interface CliOptions {
  transport: TransportType;
  port: number;
}

interface RequestBodyResult {
  body: unknown;
  hasInvalidJson: boolean;
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
  for (const tool of createCommonToolDefinitions({
    indexer,
    treeSitterEngine: sharedTreeSitterEngine,
  })) {
    server.registerTool(
      tool.name,
      {
        title: tool.title,
        description: tool.description,
        inputSchema: tool.inputSchema,
      },
      tool.handler,
    );
  }
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
