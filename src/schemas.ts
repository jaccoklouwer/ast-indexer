import { z } from 'zod';

export const FunctionSchema = z.object({
  name: z.string(),
  type: z.enum(['function', 'method', 'arrow', 'async', 'stored_procedure', 'sql_function']),
  params: z.array(z.string()),
  startLine: z.number(),
  endLine: z.number(),
  file: z.string(),
  returnType: z.string().optional(),
  isPublic: z.boolean().optional(),
  isStatic: z.boolean().optional(),
  isAsync: z.boolean().optional(),
});

export type FunctionInfo = z.infer<typeof FunctionSchema>;

export const ClassSchema = z.object({
  name: z.string(),
  methods: z.array(z.string()),
  properties: z.array(z.string()),
  startLine: z.number(),
  endLine: z.number(),
  file: z.string(),
  extends: z.string().optional(),
  implements: z.array(z.string()).optional(),
  namespace: z.string().optional(),
  isPublic: z.boolean().optional(),
  isAbstract: z.boolean().optional(),
  isInterface: z.boolean().optional(),
});

export type ClassInfo = z.infer<typeof ClassSchema>;

export const ImportSchema = z.object({
  source: z.string(),
  imported: z.array(z.string()),
  isDefault: z.boolean(),
  file: z.string(),
  line: z.number(),
  isNamespace: z.boolean().optional(),
});

export type ImportInfo = z.infer<typeof ImportSchema>;

export const ExportSchema = z.object({
  name: z.string(),
  line: z.number(),
});

export type ExportInfo = z.infer<typeof ExportSchema>;

export const VariableSchema = z.object({
  name: z.string(),
  type: z.enum(['const', 'let', 'var']),
  isExported: z.boolean(),
  file: z.string(),
  line: z.number(),
});

export type VariableInfo = z.infer<typeof VariableSchema>;

export const SqlTableSchema = z.object({
  name: z.string(),
  columns: z.array(z.string()),
  file: z.string(),
  line: z.number(),
});

export type SqlTableInfo = z.infer<typeof SqlTableSchema>;

export const SqlViewSchema = z.object({
  name: z.string(),
  file: z.string(),
  line: z.number(),
});

export type SqlViewInfo = z.infer<typeof SqlViewSchema>;

export const SqlTriggerSchema = z.object({
  name: z.string(),
  event: z.enum(['INSERT', 'UPDATE', 'DELETE']),
  table: z.string(),
  file: z.string(),
  line: z.number(),
});

export type SqlTriggerInfo = z.infer<typeof SqlTriggerSchema>;

export const SqlIndexSchema = z.object({
  name: z.string(),
  table: z.string(),
  columns: z.array(z.string()),
  isUnique: z.boolean(),
  file: z.string(),
  line: z.number(),
});

export type SqlIndexInfo = z.infer<typeof SqlIndexSchema>;

export const FileIndexSchema = z.object({
  path: z.string(),
  functions: z.array(FunctionSchema),
  classes: z.array(ClassSchema),
  imports: z.array(ImportSchema),
  variables: z.array(VariableSchema),
  exports: z.array(z.string()),
  exportDetails: z.array(ExportSchema).optional(),
  sqlTables: z.array(SqlTableSchema).optional(),
  sqlViews: z.array(SqlViewSchema).optional(),
  sqlTriggers: z.array(SqlTriggerSchema).optional(),
  sqlIndexes: z.array(SqlIndexSchema).optional(),
  language: z.enum(['javascript', 'typescript', 'csharp', 'sql']).optional(),
});

export type FileIndex = z.infer<typeof FileIndexSchema>;

export const RepositoryIndexSchema = z.object({
  repositoryPath: z.string(),
  files: z.array(FileIndexSchema),
  indexedAt: z.string(),
});

export type RepositoryIndex = z.infer<typeof RepositoryIndexSchema>;

export const IndexRepositoryArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to Git repository'),
  includePatterns: z.array(z.string()).optional().describe('File patterns to include (glob)'),
  excludePatterns: z.array(z.string()).optional().describe('File patterns to exclude (glob)'),
});

export const SearchFunctionsArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  functionName: z.string().optional().describe('Function name to search for'),
  fileName: z.string().optional().describe('File name filter'),
  caseInsensitive: z.boolean().optional().describe('Perform case-insensitive matching'),
});

export const SearchClassesArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  className: z.string().optional().describe('Class name to search for'),
  fileName: z.string().optional().describe('File name filter'),
  caseInsensitive: z.boolean().optional().describe('Perform case-insensitive matching'),
});

export const SearchImportsArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  moduleName: z.string().optional().describe('Module name to search for'),
  fileName: z.string().optional().describe('File name filter'),
  caseInsensitive: z.boolean().optional().describe('Perform case-insensitive matching'),
});

export const SearchSqlTablesArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  tableName: z.string().optional().describe('Table name to search for'),
  fileName: z.string().optional().describe('File name filter'),
  caseInsensitive: z.boolean().optional().describe('Perform case-insensitive matching'),
});

export const SearchSqlViewsArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  viewName: z.string().optional().describe('View name to search for'),
  fileName: z.string().optional().describe('File name filter'),
  caseInsensitive: z.boolean().optional().describe('Perform case-insensitive matching'),
});

export const SearchSqlTriggersArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  triggerName: z.string().optional().describe('Trigger name to search for'),
  fileName: z.string().optional().describe('File name filter'),
  caseInsensitive: z.boolean().optional().describe('Perform case-insensitive matching'),
});

export const SearchSqlIndexesArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  indexName: z.string().optional().describe('Index name to search for'),
  fileName: z.string().optional().describe('File name filter'),
  caseInsensitive: z.boolean().optional().describe('Perform case-insensitive matching'),
});

export const GetStatisticsArgsSchema = z.object({
  repositoryPath: z.string().describe('Pad naar geindexeerde repository'),
});

export const ClearCacheArgsSchema = z.object({
  repositoryPath: z
    .string()
    .optional()
    .describe('Pad naar repository waarvan cache gewist moet worden'),
});

export const AstPositionSchema = z.object({
  line: z.number().int().min(1).describe('1-based line number'),
  column: z.number().int().min(1).describe('1-based column number'),
});

export type AstPosition = z.infer<typeof AstPositionSchema>;

export const AstNodeSchema: z.ZodType<{
  type: string;
  text: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  isNamed: boolean;
  hasError: boolean;
  isMissing: boolean;
  children: Array<z.infer<typeof AstNodeSchema>>;
}> = z.lazy(() =>
  z.object({
    type: z.string(),
    text: z.string(),
    startLine: z.number().int().min(1),
    startColumn: z.number().int().min(1),
    endLine: z.number().int().min(1),
    endColumn: z.number().int().min(1),
    isNamed: z.boolean(),
    hasError: z.boolean(),
    isMissing: z.boolean(),
    children: z.array(AstNodeSchema),
  }),
);

export type AstNode = z.infer<typeof AstNodeSchema>;

export const TreeEditSchema = z.object({
  startIndex: z.number().int().min(0),
  oldEndIndex: z.number().int().min(0),
  newEndIndex: z.number().int().min(0),
  startPosition: z.object({ row: z.number().int().min(0), column: z.number().int().min(0) }),
  oldEndPosition: z.object({ row: z.number().int().min(0), column: z.number().int().min(0) }),
  newEndPosition: z.object({ row: z.number().int().min(0), column: z.number().int().min(0) }),
});

export type TreeEdit = z.infer<typeof TreeEditSchema>;

export const GetAstArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
  maxDepth: z.number().int().min(1).max(25).optional().describe('Maximum tree depth to serialize'),
  namedOnly: z.boolean().optional().describe('Only include named nodes'),
});

export const GetAstNodeAtPositionArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
  line: z.number().int().min(1).describe('1-based line number'),
  column: z.number().int().min(1).describe('1-based column number'),
});

export const GetAstNodeRelativesArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
  line: z.number().int().min(1).describe('1-based line number'),
  column: z.number().int().min(1).describe('1-based column number'),
  includeParent: z.boolean().optional().describe('Include parent node'),
  includeSiblings: z.boolean().optional().describe('Include previous and next siblings'),
});

export const GetSyntaxErrorsArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
});

export const GetHighlightCapturesArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
  query: z.string().describe('Tree-sitter query string'),
});

export const GetFoldingRangesArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
});

export const GetDocumentSymbolsArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
});

export const StructuralSearchArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  query: z.string().describe('Tree-sitter query string'),
  language: z.enum(['javascript', 'typescript', 'tsx', 'csharp', 'sql']).optional(),
  fileName: z.string().optional().describe('File name filter'),
});

export const GetScopeAtPositionArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
  line: z.number().int().min(1).describe('1-based line number'),
  column: z.number().int().min(1).describe('1-based column number'),
});

export const FindEnclosingSymbolArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
  line: z.number().int().min(1).describe('1-based line number'),
  column: z.number().int().min(1).describe('1-based column number'),
});

export const FindSimilarNodesArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  filePath: z.string().describe('Path to source file'),
  line: z.number().int().min(1).describe('1-based line number'),
  column: z.number().int().min(1).describe('1-based column number'),
  fileName: z.string().optional().describe('File name filter'),
});

export const DetectTodosArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  fileName: z.string().optional().describe('File name filter'),
});

export const GetExpandSelectionArgsSchema = z.object({
  filePath: z.string().describe('Path to source file'),
  startLine: z.number().int().min(1).describe('Selection start line, 1-based'),
  startColumn: z.number().int().min(1).describe('Selection start column, 1-based'),
  endLine: z.number().int().min(1).describe('Selection end line, 1-based'),
  endColumn: z.number().int().min(1).describe('Selection end column, 1-based'),
});

export const GetCrossFileReferencesArgsSchema = z.object({
  repositoryPath: z.string().describe('Path to indexed repository'),
  symbolName: z.string().describe('Symbol name to search for'),
  caseInsensitive: z.boolean().optional().describe('Perform case-insensitive matching'),
});
