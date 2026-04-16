import { describe, expect, it } from 'vitest';
import { createMcpServer } from '../src/index.js';

const TOOL_NAMES = [
  'index_repository',
  'search_functions',
  'search_classes',
  'search_imports',
  'get_statistics',
  'search_sql_tables',
  'search_sql_views',
  'search_sql_triggers',
  'search_sql_indexes',
  'clear_cache',
] as const;

describe('MCP server toolregistratie', () => {
  it('registreert voor elke tool een inputSchema', () => {
    const server = createMcpServer() as unknown as {
      _registeredTools: Record<
        string,
        { inputSchema?: { safeParse: (value: unknown) => { success: boolean } } }
      >;
    };

    for (const toolName of TOOL_NAMES) {
      expect(server._registeredTools[toolName]?.inputSchema).toBeDefined();
    }
  });

  it('vereist repositoryPath voor index_repository', () => {
    const server = createMcpServer() as unknown as {
      _registeredTools: Record<
        string,
        { inputSchema?: { safeParse: (value: unknown) => { success: boolean } } }
      >;
    };

    const inputSchema = server._registeredTools.index_repository?.inputSchema;

    expect(inputSchema?.safeParse({}).success).toBe(false);
    expect(inputSchema?.safeParse({ repositoryPath: 'C:/repo' }).success).toBe(true);
  });
});
