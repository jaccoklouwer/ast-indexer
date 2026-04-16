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
