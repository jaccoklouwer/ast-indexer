import { z } from 'zod';
import {
  getAst,
  getAstNodeAtPosition,
  getAstNodeRelatives,
  getDocumentSymbols,
  getFoldingRanges,
  getHighlightCaptures,
  getSyntaxErrors,
} from './ast-tools.js';
import { RepositoryIndexer } from './indexer.js';
import {
  ClearCacheArgsSchema,
  DetectTodosArgsSchema,
  FindEnclosingSymbolArgsSchema,
  FindSimilarNodesArgsSchema,
  GetAstArgsSchema,
  GetAstNodeAtPositionArgsSchema,
  GetAstNodeRelativesArgsSchema,
  GetCrossFileReferencesArgsSchema,
  GetDocumentSymbolsArgsSchema,
  GetExpandSelectionArgsSchema,
  GetFileStatusArgsSchema,
  GetFoldingRangesArgsSchema,
  GetHighlightCapturesArgsSchema,
  GetScopeAtPositionArgsSchema,
  GetStatisticsArgsSchema,
  GetSyntaxErrorsArgsSchema,
  IndexRepositoryArgsSchema,
  SearchClassesArgsSchema,
  SearchFunctionsArgsSchema,
  SearchImportsArgsSchema,
  SearchSqlIndexesArgsSchema,
  SearchSqlTablesArgsSchema,
  SearchSqlTriggersArgsSchema,
  SearchSqlViewsArgsSchema,
  StructuralSearchArgsSchema,
} from './schemas.js';
import {
  detectTodos,
  findEnclosingSymbol,
  findSimilarNodes,
  getExpandedSelection,
  getScopeAtPosition,
  structuralSearch,
} from './structural-tools.js';
import { TreeSitterEngine } from './tree-sitter-engine.js';

export interface ToolExecutionResult {
  [key: string]: unknown;
  isError?: true;
  content: Array<{ type: 'text'; text: string }>;
  structuredContent?: Record<string, unknown>;
}

export interface CommonToolDefinition {
  name: string;
  title: string;
  description: string;
  inputSchema: z.ZodTypeAny;
  handler: (args: unknown, extra?: unknown) => Promise<ToolExecutionResult>;
}

interface CommonToolDependencies {
  indexer: RepositoryIndexer;
  treeSitterEngine: TreeSitterEngine;
}

function createToolResponse<T extends Record<string, unknown>>(payload: T): ToolExecutionResult {
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

function createToolErrorResponse(error: unknown): ToolExecutionResult {
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

function createToolHandler<TSchema extends z.ZodTypeAny>(
  schema: TSchema,
  execute: (args: z.infer<TSchema>) => Promise<Record<string, unknown>>,
): (args: unknown, extra?: unknown) => Promise<ToolExecutionResult> {
  return async (args: unknown, _extra?: unknown) => {
    try {
      const validatedArgs = schema.parse(args);
      return createToolResponse(await execute(validatedArgs));
    } catch (error) {
      return createToolErrorResponse(error);
    }
  };
}

export function createCommonToolDefinitions({
  indexer,
  treeSitterEngine,
}: CommonToolDependencies): CommonToolDefinition[] {
  return [
    {
      name: 'index_repository',
      title: 'Index Repository',
      description: 'Indexeer een Git repository en cache parse-resultaten per bestand.',
      inputSchema: IndexRepositoryArgsSchema,
      handler: createToolHandler(IndexRepositoryArgsSchema, async (args) => {
        const index = await indexer.indexRepository(
          args.repositoryPath,
          args.includePatterns,
          args.excludePatterns,
        );

        return {
          success: true,
          message: `Repository geindexeerd: ${index.files.length} bestanden`,
          statistics: indexer.getStatistics(args.repositoryPath),
        };
      }),
    },
    {
      name: 'search_functions',
      title: 'Search Functions',
      description: 'Zoek functies in een geindexeerde repository.',
      inputSchema: SearchFunctionsArgsSchema,
      handler: createToolHandler(SearchFunctionsArgsSchema, async (args) => {
        const functions = indexer.searchFunctions(
          args.repositoryPath,
          args.functionName,
          args.fileName,
          args.caseInsensitive,
        );
        return { success: true, count: functions.length, functions };
      }),
    },
    {
      name: 'search_classes',
      title: 'Search Classes',
      description: 'Zoek classes in een geindexeerde repository.',
      inputSchema: SearchClassesArgsSchema,
      handler: createToolHandler(SearchClassesArgsSchema, async (args) => {
        const classes = indexer.searchClasses(
          args.repositoryPath,
          args.className,
          args.fileName,
          args.caseInsensitive,
        );
        return { success: true, count: classes.length, classes };
      }),
    },
    {
      name: 'search_imports',
      title: 'Search Imports',
      description: 'Zoek imports in een geindexeerde repository.',
      inputSchema: SearchImportsArgsSchema,
      handler: createToolHandler(SearchImportsArgsSchema, async (args) => {
        const imports = indexer.searchImports(
          args.repositoryPath,
          args.moduleName,
          args.fileName,
          args.caseInsensitive,
        );
        return { success: true, count: imports.length, imports };
      }),
    },
    {
      name: 'get_statistics',
      title: 'Get Statistics',
      description: 'Haal statistieken op van een geindexeerde repository.',
      inputSchema: GetStatisticsArgsSchema,
      handler: createToolHandler(GetStatisticsArgsSchema, async (args) => ({
        success: true,
        statistics: indexer.getStatistics(args.repositoryPath),
      })),
    },
    {
      name: 'search_sql_tables',
      title: 'Search SQL Tables',
      description: 'Zoek SQL tables in een geindexeerde repository.',
      inputSchema: SearchSqlTablesArgsSchema,
      handler: createToolHandler(SearchSqlTablesArgsSchema, async (args) => {
        const tables = indexer.searchSqlTables(
          args.repositoryPath,
          args.tableName,
          args.fileName,
          args.caseInsensitive,
        );
        return { success: true, count: tables.length, tables };
      }),
    },
    {
      name: 'search_sql_views',
      title: 'Search SQL Views',
      description: 'Zoek SQL views in een geindexeerde repository.',
      inputSchema: SearchSqlViewsArgsSchema,
      handler: createToolHandler(SearchSqlViewsArgsSchema, async (args) => {
        const views = indexer.searchSqlViews(
          args.repositoryPath,
          args.viewName,
          args.fileName,
          args.caseInsensitive,
        );
        return { success: true, count: views.length, views };
      }),
    },
    {
      name: 'search_sql_triggers',
      title: 'Search SQL Triggers',
      description: 'Zoek SQL triggers in een geindexeerde repository.',
      inputSchema: SearchSqlTriggersArgsSchema,
      handler: createToolHandler(SearchSqlTriggersArgsSchema, async (args) => {
        const triggers = indexer.searchSqlTriggers(
          args.repositoryPath,
          args.triggerName,
          args.fileName,
          args.caseInsensitive,
        );
        return { success: true, count: triggers.length, triggers };
      }),
    },
    {
      name: 'search_sql_indexes',
      title: 'Search SQL Indexes',
      description: 'Zoek SQL indexes in een geindexeerde repository.',
      inputSchema: SearchSqlIndexesArgsSchema,
      handler: createToolHandler(SearchSqlIndexesArgsSchema, async (args) => {
        const indexes = indexer.searchSqlIndexes(
          args.repositoryPath,
          args.indexName,
          args.fileName,
          args.caseInsensitive,
        );
        return { success: true, count: indexes.length, indexes };
      }),
    },
    {
      name: 'get_ast',
      title: 'Get AST',
      description: 'Geef een Tree-sitter syntaxboom terug voor een bestand.',
      inputSchema: GetAstArgsSchema,
      handler: createToolHandler(GetAstArgsSchema, async (args) => ({
        success: true,
        ...(await getAst(treeSitterEngine, args.filePath, args.maxDepth, args.namedOnly)),
      })),
    },
    {
      name: 'get_ast_node_at_position',
      title: 'Get AST Node At Position',
      description: 'Zoek de kleinste named Tree-sitter node op een positie.',
      inputSchema: GetAstNodeAtPositionArgsSchema,
      handler: createToolHandler(GetAstNodeAtPositionArgsSchema, async (args) => ({
        success: true,
        ...(await getAstNodeAtPosition(treeSitterEngine, args.filePath, args.line, args.column)),
      })),
    },
    {
      name: 'get_ast_node_relatives',
      title: 'Get AST Node Relatives',
      description: 'Geef parent, children en siblings van een Tree-sitter node terug.',
      inputSchema: GetAstNodeRelativesArgsSchema,
      handler: createToolHandler(GetAstNodeRelativesArgsSchema, async (args) => ({
        success: true,
        ...(await getAstNodeRelatives(treeSitterEngine, args.filePath, args.line, args.column, {
          includeParent: args.includeParent,
          includeSiblings: args.includeSiblings,
        })),
      })),
    },
    {
      name: 'get_syntax_errors',
      title: 'Get Syntax Errors',
      description: 'Zoek syntaxfouten en missing nodes in een bestand.',
      inputSchema: GetSyntaxErrorsArgsSchema,
      handler: createToolHandler(GetSyntaxErrorsArgsSchema, async (args) => ({
        success: true,
        ...(await getSyntaxErrors(treeSitterEngine, args.filePath)),
      })),
    },
    {
      name: 'get_highlight_captures',
      title: 'Get Highlight Captures',
      description: 'Voer een Tree-sitter query uit en geef captures terug.',
      inputSchema: GetHighlightCapturesArgsSchema,
      handler: createToolHandler(GetHighlightCapturesArgsSchema, async (args) => ({
        success: true,
        ...(await getHighlightCaptures(treeSitterEngine, args.filePath, args.query)),
      })),
    },
    {
      name: 'get_folding_ranges',
      title: 'Get Folding Ranges',
      description: 'Bepaal folding ranges op basis van de Tree-sitter syntaxboom.',
      inputSchema: GetFoldingRangesArgsSchema,
      handler: createToolHandler(GetFoldingRangesArgsSchema, async (args) => ({
        success: true,
        ...(await getFoldingRanges(treeSitterEngine, args.filePath)),
      })),
    },
    {
      name: 'get_document_symbols',
      title: 'Get Document Symbols',
      description: 'Geef een outline van symbolen in een bestand terug.',
      inputSchema: GetDocumentSymbolsArgsSchema,
      handler: createToolHandler(GetDocumentSymbolsArgsSchema, async (args) => ({
        success: true,
        ...(await getDocumentSymbols(treeSitterEngine, args.filePath)),
      })),
    },
    {
      name: 'structural_search',
      title: 'Structural Search',
      description: 'Voer een Tree-sitter query uit over een geindexeerde repository.',
      inputSchema: StructuralSearchArgsSchema,
      handler: createToolHandler(StructuralSearchArgsSchema, async (args) => ({
        success: true,
        ...(await structuralSearch(
          treeSitterEngine,
          indexer.getRequiredIndex(args.repositoryPath),
          args.query,
          args.language,
          args.fileName,
        )),
      })),
    },
    {
      name: 'get_scope_at_position',
      title: 'Get Scope At Position',
      description: 'Geef de enclosing scopes van een positie terug.',
      inputSchema: GetScopeAtPositionArgsSchema,
      handler: createToolHandler(GetScopeAtPositionArgsSchema, async (args) => ({
        success: true,
        ...(await getScopeAtPosition(treeSitterEngine, args.filePath, args.line, args.column)),
      })),
    },
    {
      name: 'find_enclosing_symbol',
      title: 'Find Enclosing Symbol',
      description: 'Zoek het dichtstbijzijnde omhullende symbool op een positie.',
      inputSchema: FindEnclosingSymbolArgsSchema,
      handler: createToolHandler(FindEnclosingSymbolArgsSchema, async (args) => ({
        success: true,
        ...(await findEnclosingSymbol(treeSitterEngine, args.filePath, args.line, args.column)),
      })),
    },
    {
      name: 'find_similar_nodes',
      title: 'Find Similar Nodes',
      description: 'Zoek nodes met een vergelijkbare structuur in een repository.',
      inputSchema: FindSimilarNodesArgsSchema,
      handler: createToolHandler(FindSimilarNodesArgsSchema, async (args) => ({
        success: true,
        ...(await findSimilarNodes(
          treeSitterEngine,
          indexer.getRequiredIndex(args.repositoryPath),
          args.filePath,
          args.line,
          args.column,
          args.fileName,
        )),
      })),
    },
    {
      name: 'detect_todos',
      title: 'Detect TODOs',
      description: 'Detecteer TODO, FIXME, HACK, NOTE en XXX comments.',
      inputSchema: DetectTodosArgsSchema,
      handler: createToolHandler(DetectTodosArgsSchema, async (args) => ({
        success: true,
        ...(await detectTodos(
          treeSitterEngine,
          indexer.getRequiredIndex(args.repositoryPath),
          args.fileName,
        )),
      })),
    },
    {
      name: 'get_expand_selection',
      title: 'Get Expand Selection',
      description: 'Vergroot een selectie naar de kleinste omhullende named node.',
      inputSchema: GetExpandSelectionArgsSchema,
      handler: createToolHandler(GetExpandSelectionArgsSchema, async (args) => ({
        success: true,
        ...(await getExpandedSelection(
          treeSitterEngine,
          args.filePath,
          args.startLine,
          args.startColumn,
          args.endLine,
          args.endColumn,
        )),
      })),
    },
    {
      name: 'get_cross_file_references',
      title: 'Get Cross File References',
      description: 'Zoek imports, exports en definities van een symbool over meerdere bestanden.',
      inputSchema: GetCrossFileReferencesArgsSchema,
      handler: createToolHandler(GetCrossFileReferencesArgsSchema, async (args) => {
        const references = indexer.getCrossFileReferences(
          args.repositoryPath,
          args.symbolName,
          args.caseInsensitive,
        );
        return { success: true, count: references.length, references };
      }),
    },
    {
      name: 'get_file_status',
      title: 'Get File Status',
      description:
        'Herindexeer de repository en geef daarna de Git working tree status van één bestand terug.',
      inputSchema: GetFileStatusArgsSchema,
      handler: createToolHandler(GetFileStatusArgsSchema, async (args) => {
        const result = await indexer.getFileStatus(args.repositoryPath, args.filePath);
        return {
          success: true,
          repositoryPath: result.repositoryPath,
          filePath: result.filePath,
          status: result.status,
          modified: result.modified,
        };
      }),
    },
    {
      name: 'clear_cache',
      title: 'Clear Cache',
      description: 'Wis de memory- en disk-cache van een repository of van alle repositories.',
      inputSchema: ClearCacheArgsSchema,
      handler: createToolHandler(ClearCacheArgsSchema, async (args) => {
        await indexer.clearCache(args.repositoryPath);
        treeSitterEngine.clearCache(args.repositoryPath);
        return {
          success: true,
          message: args.repositoryPath
            ? `Cache gewist voor ${args.repositoryPath}`
            : 'Alle cache gewist',
        };
      }),
    },
  ];
}
