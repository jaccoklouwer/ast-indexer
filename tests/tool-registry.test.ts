import { afterEach, describe, expect, it, vi } from 'vitest';
import * as astTools from '../src/ast-tools.js';
import type { RepositoryIndexer } from '../src/indexer.js';
import type { RepositoryIndex } from '../src/schemas.js';
import * as structuralTools from '../src/structural-tools.js';
import type { TreeSitterEngine } from '../src/tree-sitter-engine.js';
import { createCommonToolDefinitions } from '../src/tool-registry.js';

vi.mock('../src/ast-tools.js', () => ({
  getAst: vi.fn(),
  getAstNodeAtPosition: vi.fn(),
  getAstNodeRelatives: vi.fn(),
  getDocumentSymbols: vi.fn(),
  getFoldingRanges: vi.fn(),
  getHighlightCaptures: vi.fn(),
  getSyntaxErrors: vi.fn(),
}));

vi.mock('../src/structural-tools.js', () => ({
  detectTodos: vi.fn(),
  findEnclosingSymbol: vi.fn(),
  findSimilarNodes: vi.fn(),
  getExpandedSelection: vi.fn(),
  getScopeAtPosition: vi.fn(),
  structuralSearch: vi.fn(),
}));

type SerializedAstNode = Awaited<ReturnType<typeof astTools.getAst>>['tree'];

function createSerializedAstNode(
  type: string,
  overrides: Partial<SerializedAstNode> = {},
): SerializedAstNode {
  return {
    type,
    text: '',
    startLine: 1,
    startColumn: 1,
    endLine: 1,
    endColumn: 1,
    isNamed: true,
    hasError: false,
    isMissing: false,
    children: [],
    ...overrides,
  };
}

function createDependencies() {
  const repositoryIndex = {
    repositoryPath: 'C:\\repo',
    files: [],
  } as unknown as RepositoryIndex;

  const indexer = {
    indexRepository: vi.fn(async () => ({ files: [{}, {}] })),
    getStatistics: vi.fn(() => ({ filesIndexed: 2 })),
    searchFunctions: vi.fn(() => [{ name: 'add' }]),
    searchClasses: vi.fn(() => [{ name: 'Calculator' }]),
    searchImports: vi.fn(() => [{ source: './math.js' }]),
    searchSqlTables: vi.fn(() => [{ name: 'Users' }]),
    searchSqlViews: vi.fn(() => [{ name: 'UserView' }]),
    searchSqlTriggers: vi.fn(() => [{ name: 'UserTrigger' }]),
    searchSqlIndexes: vi.fn(() => [{ name: 'IX_Users_Email' }]),
    getRequiredIndex: vi.fn(() => repositoryIndex),
    getCrossFileReferences: vi.fn(() => [
      { filePath: 'C:\\repo\\src\\math.ts', kind: 'definition', line: 1 },
    ]),
    getFileStatus: vi.fn(async () => ({
      repositoryPath: 'C:\\repo',
      filePath: 'C:\\repo\\src\\index.ts',
      status: 'clean',
      modified: false,
    })),
    clearCache: vi.fn(async () => undefined),
  } as unknown as RepositoryIndexer;

  const treeSitterEngine = {
    clearCache: vi.fn(),
  } as unknown as TreeSitterEngine;

  return { indexer, repositoryIndex, treeSitterEngine };
}

function getToolMap(indexer: RepositoryIndexer, treeSitterEngine: TreeSitterEngine) {
  return Object.fromEntries(
    createCommonToolDefinitions({ indexer, treeSitterEngine }).map((tool) => [tool.name, tool]),
  );
}

afterEach(() => {
  vi.resetAllMocks();
});

describe('tool-registry', () => {
  it('dekt repository-, zoek- en cache-handlers', async () => {
    const { indexer, treeSitterEngine } = createDependencies();
    const tools = getToolMap(indexer, treeSitterEngine);

    const indexResult = await tools.index_repository.handler(
      {
        repositoryPath: 'C:\\repo',
        includePatterns: ['src/**/*.ts'],
        excludePatterns: ['dist/**'],
      },
      {},
    );
    const functionsResult = await tools.search_functions.handler({
      repositoryPath: 'C:\\repo',
      functionName: 'add',
      fileName: 'math.ts',
      caseInsensitive: true,
    });
    const classesResult = await tools.search_classes.handler({
      repositoryPath: 'C:\\repo',
      className: 'Calculator',
    });
    const importsResult = await tools.search_imports.handler({
      repositoryPath: 'C:\\repo',
      moduleName: './math.js',
    });
    const statisticsResult = await tools.get_statistics.handler({
      repositoryPath: 'C:\\repo',
    });
    const tablesResult = await tools.search_sql_tables.handler({
      repositoryPath: 'C:\\repo',
      tableName: 'Users',
    });
    const viewsResult = await tools.search_sql_views.handler({
      repositoryPath: 'C:\\repo',
      viewName: 'UserView',
    });
    const triggersResult = await tools.search_sql_triggers.handler({
      repositoryPath: 'C:\\repo',
      triggerName: 'UserTrigger',
    });
    const indexesResult = await tools.search_sql_indexes.handler({
      repositoryPath: 'C:\\repo',
      indexName: 'IX_Users_Email',
    });
    const referencesResult = await tools.get_cross_file_references.handler({
      repositoryPath: 'C:\\repo',
      symbolName: 'add',
      caseInsensitive: true,
    });
    const clearRepositoryResult = await tools.clear_cache.handler({
      repositoryPath: 'C:\\repo',
    });
    const clearAllResult = await tools.clear_cache.handler({});
    const fileStatusResult = await tools.get_file_status.handler({
      repositoryPath: 'C:\\repo',
      filePath: 'C:\\repo\\src\\index.ts',
    });

    expect(indexResult.structuredContent?.message).toContain('2 bestanden');
    expect(functionsResult.structuredContent?.count).toBe(1);
    expect(classesResult.structuredContent?.count).toBe(1);
    expect(importsResult.structuredContent?.count).toBe(1);
    expect(statisticsResult.structuredContent?.success).toBe(true);
    expect(tablesResult.structuredContent?.count).toBe(1);
    expect(viewsResult.structuredContent?.count).toBe(1);
    expect(triggersResult.structuredContent?.count).toBe(1);
    expect(indexesResult.structuredContent?.count).toBe(1);
    expect(referencesResult.structuredContent?.count).toBe(1);
    expect(clearRepositoryResult.structuredContent?.message).toContain('Cache gewist');
    expect(clearAllResult.structuredContent?.message).toBe('Alle cache gewist');
    expect(fileStatusResult.structuredContent?.success).toBe(true);
    expect(fileStatusResult.structuredContent?.status).toBe('clean');
    expect(fileStatusResult.structuredContent?.modified).toBe(false);
    expect(
      (indexer as unknown as { getCrossFileReferences: ReturnType<typeof vi.fn> })
        .getCrossFileReferences,
    ).toHaveBeenCalledWith('C:\\repo', 'add', true);
    expect(
      (treeSitterEngine as unknown as { clearCache: ReturnType<typeof vi.fn> }).clearCache,
    ).toHaveBeenCalledTimes(2);
  });

  it('dekt AST- en structurele handlers', async () => {
    const { indexer, repositoryIndex, treeSitterEngine } = createDependencies();
    const tools = getToolMap(indexer, treeSitterEngine);

    const programNode = createSerializedAstNode('program');
    const identifierNode = createSerializedAstNode('identifier');

    vi.mocked(astTools.getAst).mockResolvedValue({
      filePath: 'file.ts',
      language: 'typescript',
      tree: programNode,
    });
    vi.mocked(astTools.getAstNodeAtPosition).mockResolvedValue({
      filePath: 'file.ts',
      line: 1,
      column: 1,
      node: identifierNode,
      parents: [],
    });
    vi.mocked(astTools.getAstNodeRelatives).mockResolvedValue({
      filePath: 'file.ts',
      line: 1,
      column: 1,
      node: identifierNode,
      parent: null,
      children: [],
      previousSibling: null,
      nextSibling: null,
    });
    vi.mocked(astTools.getSyntaxErrors).mockResolvedValue({
      filePath: 'file.ts',
      count: 0,
      errors: [],
    });
    vi.mocked(astTools.getHighlightCaptures).mockResolvedValue({
      filePath: 'file.ts',
      count: 1,
      captures: [{ captureName: 'name' }],
    } as never);
    vi.mocked(astTools.getFoldingRanges).mockResolvedValue({
      filePath: 'file.ts',
      count: 1,
      foldingRanges: [{ startLine: 1, endLine: 3, kind: 'region' }],
    });
    vi.mocked(astTools.getDocumentSymbols).mockResolvedValue({
      filePath: 'file.ts',
      count: 1,
      symbols: [{ name: 'demo', kind: 'function', children: [] }],
    } as never);
    vi.mocked(structuralTools.structuralSearch).mockResolvedValue({
      repositoryPath: 'C:\\repo',
      count: 1,
      matches: [{ filePath: 'file.ts' }],
    } as never);
    vi.mocked(structuralTools.getScopeAtPosition).mockResolvedValue({
      filePath: 'file.ts',
      line: 1,
      column: 1,
      scopes: [{ type: 'program' }],
    } as never);
    vi.mocked(structuralTools.findEnclosingSymbol).mockResolvedValue({
      filePath: 'file.ts',
      line: 1,
      column: 1,
      symbol: { name: 'demo', type: 'function' },
    } as never);
    vi.mocked(structuralTools.findSimilarNodes).mockResolvedValue({
      filePath: 'file.ts',
      line: 1,
      column: 1,
      signature: 'function(identifier)',
      count: 1,
      matches: [{ filePath: 'other.ts' }],
    } as never);
    vi.mocked(structuralTools.detectTodos).mockResolvedValue({
      repositoryPath: 'C:\\repo',
      count: 1,
      matches: [{ filePath: 'file.ts', kind: 'TODO' }],
    } as never);
    vi.mocked(structuralTools.getExpandedSelection).mockResolvedValue({
      filePath: 'file.ts',
      selection: { startLine: 1, startColumn: 1, endLine: 1, endColumn: 3 },
      expanded: identifierNode,
    } as never);

    const indexResult = await tools.index_repository.handler(
      {
        repositoryPath: 'C:\\repo',
        includePatterns: ['src/**/*.ts'],
        excludePatterns: ['dist/**'],
      },
      {},
    );
    const functionsResult = await tools.search_functions.handler({
      repositoryPath: 'C:\\repo',
      functionName: 'add',
      fileName: 'math.ts',
      caseInsensitive: true,
    });
    const classesResult = await tools.search_classes.handler({
      repositoryPath: 'C:\\repo',
      className: 'Calculator',
    });
    const importsResult = await tools.search_imports.handler({
      repositoryPath: 'C:\\repo',
      moduleName: './math.js',
    });
    const statisticsResult = await tools.get_statistics.handler({
      repositoryPath: 'C:\\repo',
    });
    const tablesResult = await tools.search_sql_tables.handler({
      repositoryPath: 'C:\\repo',
      tableName: 'Users',
    });
    const viewsResult = await tools.search_sql_views.handler({
      repositoryPath: 'C:\\repo',
      viewName: 'UserView',
    });
    const triggersResult = await tools.search_sql_triggers.handler({
      repositoryPath: 'C:\\repo',
      triggerName: 'UserTrigger',
    });
    const indexesResult = await tools.search_sql_indexes.handler({
      repositoryPath: 'C:\\repo',
      indexName: 'IX_Users_Email',
    });
    const referencesResult = await tools.get_cross_file_references.handler({
      repositoryPath: 'C:\\repo',
      symbolName: 'add',
      caseInsensitive: true,
    });
    const clearRepositoryResult = await tools.clear_cache.handler({
      repositoryPath: 'C:\\repo',
    });
    const clearAllResult = await tools.clear_cache.handler({});
    const fileStatusResult = await tools.get_file_status.handler({
      repositoryPath: 'C:\\repo',
      filePath: 'C:\\repo\\src\\index.ts',
    });

    expect(indexResult.structuredContent?.message).toContain('2 bestanden');
    expect(functionsResult.structuredContent?.count).toBe(1);
    expect(classesResult.structuredContent?.count).toBe(1);
    expect(importsResult.structuredContent?.count).toBe(1);
    expect(statisticsResult.structuredContent?.success).toBe(true);
    expect(tablesResult.structuredContent?.count).toBe(1);
    expect(viewsResult.structuredContent?.count).toBe(1);
    expect(triggersResult.structuredContent?.count).toBe(1);
    expect(indexesResult.structuredContent?.count).toBe(1);
    expect(referencesResult.structuredContent?.count).toBe(1);
    expect(clearRepositoryResult.structuredContent?.message).toContain('Cache gewist');
    expect(clearAllResult.structuredContent?.message).toBe('Alle cache gewist');
    expect(fileStatusResult.structuredContent?.success).toBe(true);
    expect(fileStatusResult.structuredContent?.status).toBe('clean');
    expect(fileStatusResult.structuredContent?.modified).toBe(false);
    expect(
      (indexer as unknown as { getCrossFileReferences: ReturnType<typeof vi.fn> })
        .getCrossFileReferences,
    ).toHaveBeenCalledWith('C:\\repo', 'add', true);
    expect(
      (treeSitterEngine as unknown as { clearCache: ReturnType<typeof vi.fn> }).clearCache,
    ).toHaveBeenCalledTimes(2);

    expect(
      (await tools.get_ast.handler({ filePath: 'file.ts', maxDepth: 2, namedOnly: false }))
        .structuredContent?.success,
    ).toBe(true);
    expect(
      (await tools.get_ast_node_at_position.handler({ filePath: 'file.ts', line: 1, column: 1 }))
        .structuredContent?.success,
    ).toBe(true);
    expect(
      (
        await tools.get_ast_node_relatives.handler({
          filePath: 'file.ts',
          line: 1,
          column: 1,
          includeParent: true,
          includeSiblings: true,
        })
      ).structuredContent?.success,
    ).toBe(true);
    expect(
      (await tools.get_syntax_errors.handler({ filePath: 'file.ts' })).structuredContent?.success,
    ).toBe(true);
    expect(
      (
        await tools.get_highlight_captures.handler({
          filePath: 'file.ts',
          query: '(identifier) @name',
        })
      ).structuredContent?.success,
    ).toBe(true);
    expect(
      (await tools.get_folding_ranges.handler({ filePath: 'file.ts' })).structuredContent?.success,
    ).toBe(true);
    expect(
      (await tools.get_document_symbols.handler({ filePath: 'file.ts' })).structuredContent
        ?.success,
    ).toBe(true);
    expect(
      (
        await tools.structural_search.handler({
          repositoryPath: 'C:\\repo',
          query: '(function_declaration) @fn',
          language: 'typescript',
          fileName: 'file.ts',
        })
      ).structuredContent?.success,
    ).toBe(true);
    expect(
      (
        await tools.get_scope_at_position.handler({
          filePath: 'file.ts',
          line: 1,
          column: 1,
        })
      ).structuredContent?.success,
    ).toBe(true);
    expect(
      (
        await tools.find_enclosing_symbol.handler({
          filePath: 'file.ts',
          line: 1,
          column: 1,
        })
      ).structuredContent?.success,
    ).toBe(true);
    expect(
      (
        await tools.find_similar_nodes.handler({
          repositoryPath: 'C:\\repo',
          filePath: 'file.ts',
          line: 1,
          column: 1,
          fileName: 'file.ts',
        })
      ).structuredContent?.success,
    ).toBe(true);
    expect(
      (await tools.detect_todos.handler({ repositoryPath: 'C:\\repo' })).structuredContent?.success,
    ).toBe(true);
    expect(
      (
        await tools.get_expand_selection.handler({
          filePath: 'file.ts',
          startLine: 1,
          startColumn: 1,
          endLine: 1,
          endColumn: 3,
        })
      ).structuredContent?.success,
    ).toBe(true);

    expect(astTools.getAst).toHaveBeenCalledWith(treeSitterEngine, 'file.ts', 2, false);
    expect(structuralTools.structuralSearch).toHaveBeenCalledWith(
      treeSitterEngine,
      repositoryIndex,
      '(function_declaration) @fn',
      'typescript',
      'file.ts',
    );
    expect(structuralTools.detectTodos).toHaveBeenCalledWith(
      treeSitterEngine,
      repositoryIndex,
      undefined,
    );
  });

  it('geeft nette fouten terug bij schema- en uitvoerfouten', async () => {
    const { indexer, treeSitterEngine } = createDependencies();
    const tools = getToolMap(indexer, treeSitterEngine);

    vi.mocked(astTools.getAst).mockRejectedValue(new Error('kapot'));

    const invalidResult = await tools.search_functions.handler({});
    const executionErrorResult = await tools.get_ast.handler({ filePath: 'file.ts' });

    expect(invalidResult.isError).toBe(true);
    expect(executionErrorResult.isError).toBe(true);
    expect(executionErrorResult.content[0]?.text).toContain('kapot');
  });
});
