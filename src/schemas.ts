import { z } from 'zod';

// Schema voor functie/method definitie
export const FunctionSchema = z.object({
  name: z.string(),
  type: z.enum(['function', 'method', 'arrow', 'async', 'stored_procedure', 'sql_function']),
  params: z.array(z.string()),
  startLine: z.number(),
  endLine: z.number(),
  file: z.string(),
  returnType: z.string().optional(), // Voor C# en SQL
  isPublic: z.boolean().optional(), // Voor C#
  isStatic: z.boolean().optional(), // Voor C#
  isAsync: z.boolean().optional(), // Voor C#
});

export type FunctionInfo = z.infer<typeof FunctionSchema>;

// Schema voor class definitie
export const ClassSchema = z.object({
  name: z.string(),
  methods: z.array(z.string()),
  properties: z.array(z.string()),
  startLine: z.number(),
  endLine: z.number(),
  file: z.string(),
  extends: z.string().optional(),
  implements: z.array(z.string()).optional(), // Voor C# interfaces
  namespace: z.string().optional(), // Voor C#
  isPublic: z.boolean().optional(), // Voor C#
  isAbstract: z.boolean().optional(), // Voor C#
  isInterface: z.boolean().optional(), // Voor C#
});

export type ClassInfo = z.infer<typeof ClassSchema>;

// Schema voor import statements
export const ImportSchema = z.object({
  source: z.string(),
  imported: z.array(z.string()),
  isDefault: z.boolean(),
  file: z.string(),
  line: z.number(),
  isNamespace: z.boolean().optional(), // Voor C# using statements
});

export type ImportInfo = z.infer<typeof ImportSchema>;

// Schema voor variable declaraties
export const VariableSchema = z.object({
  name: z.string(),
  type: z.enum(['const', 'let', 'var']),
  isExported: z.boolean(),
  file: z.string(),
  line: z.number(),
});

export type VariableInfo = z.infer<typeof VariableSchema>;

// Schema voor SQL database objecten
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

// Schema voor file index
export const FileIndexSchema = z.object({
  path: z.string(),
  functions: z.array(FunctionSchema),
  classes: z.array(ClassSchema),
  imports: z.array(ImportSchema),
  variables: z.array(VariableSchema),
  exports: z.array(z.string()),
  sqlTables: z.array(SqlTableSchema).optional(), // Voor SQL files
  sqlViews: z.array(SqlViewSchema).optional(), // Voor SQL files
  language: z.enum(['javascript', 'typescript', 'csharp', 'sql']).optional(),
});

export type FileIndex = z.infer<typeof FileIndexSchema>;

// Schema voor repository index
export const RepositoryIndexSchema = z.object({
  repositoryPath: z.string(),
  files: z.array(FileIndexSchema),
  indexedAt: z.string(),
});

export type RepositoryIndex = z.infer<typeof RepositoryIndexSchema>;

// MCP Tool argument schemas
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

// SQL search schemas
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
