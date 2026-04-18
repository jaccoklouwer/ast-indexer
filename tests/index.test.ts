import { describe, expect, it } from 'vitest';
import { RepositoryIndexer } from '../src/indexer.js';
import { TreeSitterEngine } from '../src/tree-sitter-engine.js';
import { createCommonToolDefinitions } from '../src/tool-registry.js';

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
  'get_ast',
  'get_ast_node_at_position',
  'get_ast_node_relatives',
  'get_syntax_errors',
  'get_highlight_captures',
  'get_folding_ranges',
  'get_document_symbols',
  'structural_search',
  'get_scope_at_position',
  'find_enclosing_symbol',
  'find_similar_nodes',
  'detect_todos',
  'get_expand_selection',
  'get_cross_file_references',
  'clear_cache',
] as const;

describe('MCP server toolregistratie', () => {
  it('registreert voor elke tool een inputSchema', () => {
    const toolDefinitions = createCommonToolDefinitions({
      indexer: new RepositoryIndexer(),
      treeSitterEngine: new TreeSitterEngine(),
    });
    const toolMap = Object.fromEntries(toolDefinitions.map((tool) => [tool.name, tool]));

    for (const toolName of TOOL_NAMES) {
      expect(toolMap[toolName]?.inputSchema).toBeDefined();
    }
  });

  it('vereist repositoryPath voor index_repository', () => {
    const toolDefinitions = createCommonToolDefinitions({
      indexer: new RepositoryIndexer(),
      treeSitterEngine: new TreeSitterEngine(),
    });
    const inputSchema = toolDefinitions.find(
      (tool) => tool.name === 'index_repository',
    )?.inputSchema;

    expect(inputSchema?.safeParse({}).success).toBe(false);
    expect(inputSchema?.safeParse({ repositoryPath: 'C:/repo' }).success).toBe(true);
  });
});
