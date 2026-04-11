import * as fs from 'fs/promises';
import sqlParserPkg from 'node-sql-parser';
// import * as path from 'path';
import { FileIndex, FunctionInfo, SqlTableInfo, SqlViewInfo } from './schemas.js';

// Ondersteun verschillende exportstijlen van node-sql-parser (CJS/ESM) zonder any
type SqlParserCtor = new () => {
  astify(sql: string, options?: { database?: string }): unknown;
};

function isCtor(val: unknown): val is SqlParserCtor {
  return typeof val === 'function';
}

function hasParser(val: unknown): val is { Parser: SqlParserCtor } {
  const maybe = val as { Parser?: unknown };
  return typeof maybe.Parser === 'function';
}

const SqlParserCtorResolved: SqlParserCtor = hasParser(sqlParserPkg)
  ? sqlParserPkg.Parser
  : isCtor(sqlParserPkg)
    ? sqlParserPkg
    : (() => {
        throw new Error('node-sql-parser export heeft geen Parser constructor');
      })();

/**
 * Parse een SQL bestand
 */
export async function parseSqlFile(filePath: string): Promise<FileIndex> {
  const content = await fs.readFile(filePath, 'utf-8');
  // const relativePath = path.basename(filePath);

  const functions: FunctionInfo[] = [];
  const sqlTables: SqlTableInfo[] = [];
  const sqlViews: SqlViewInfo[] = [];

  // Split op statements: semicolons en T-SQL batch separator 'GO'
  const statements = content.split(/(?:;[\s\n]+|\bGO\b[\s\n]+)/i).filter((s) => s.trim());

  let lineNumber = 1;
  for (const statement of statements) {
    const trimmed = statement.trim().toUpperCase();
    const originalStatement = statement.trim();

    try {
      // Parse CREATE TABLE statements
      if (trimmed.startsWith('CREATE TABLE')) {
        const match = originalStatement.match(/CREATE\s+TABLE\s+(\[?[\w.]+\]?)/i);
        if (match) {
          const tableName = match[1].replace(/\[|\]/g, '');
          const columns: string[] = [];

          // Extract column names (basic regex - kan verbeterd worden)
          const columnMatches = originalStatement.matchAll(/\n\s*(\[?\w+\]?)\s+[\w()]+/gi);
          for (const colMatch of columnMatches) {
            columns.push(colMatch[1].replace(/\[|\]/g, ''));
          }

          sqlTables.push({
            name: tableName,
            columns,
            file: filePath,
            line: lineNumber,
          });
        }
      }

      // Parse CREATE VIEW statements
      else if (trimmed.startsWith('CREATE VIEW') || trimmed.startsWith('CREATE OR REPLACE VIEW')) {
        const match = originalStatement.match(
          /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+(\[?[\w.]+\]?)/i,
        );
        if (match) {
          const viewName = match[1].replace(/\[|\]/g, '');
          sqlViews.push({
            name: viewName,
            file: filePath,
            line: lineNumber,
          });
        }
      }

      // Parse CREATE PROCEDURE statements
      else if (trimmed.startsWith('CREATE PROCEDURE') || trimmed.startsWith('CREATE PROC')) {
        const match = originalStatement.match(
          /CREATE\s+(?:PROCEDURE|PROC)\s+(\[?[\w.]+\]?)\s*(?:\((.*?)\))?/is,
        );
        if (match) {
          const procName = match[1].replace(/\[|\]/g, '');
          const params: string[] = [];

          // Extract parameter names: handle both parenthesized and header block before AS
          let paramSection: string | undefined = match[2];
          if (!paramSection) {
            const header = originalStatement.match(/CREATE\s+(?:PROCEDURE|PROC)[\s\S]*?\bAS\b/i);
            if (header && header[0]) {
              // exclude the 'CREATE ... procName' prefix from header
              const afterName = header[0].replace(
                /CREATE\s+(?:PROCEDURE|PROC)\s+\[?[\w.]+\]?/i,
                '',
              );
              paramSection = afterName;
            }
          }

          if (paramSection) {
            const paramMatches = paramSection.matchAll(/@(\w+)/g);
            for (const pm of paramMatches) {
              params.push(pm[1]);
            }
          }

          functions.push({
            name: procName,
            type: 'stored_procedure',
            params,
            startLine: lineNumber,
            endLine: lineNumber + statement.split('\n').length - 1,
            file: filePath,
          });
        }
      }

      // Parse CREATE FUNCTION statements
      else if (trimmed.startsWith('CREATE FUNCTION')) {
        const match = originalStatement.match(
          /CREATE\s+FUNCTION\s+(\[?[\w.]+\]?)\s*\((.*?)\)\s*RETURNS\s+([\w()]+)/is,
        );
        if (match) {
          const funcName = match[1].replace(/\[|\]/g, '');
          const params: string[] = [];
          const returnType = match[3];

          // Extract parameter names
          if (match[2]) {
            const paramMatches = match[2].matchAll(/@(\w+)/g);
            for (const paramMatch of paramMatches) {
              params.push(paramMatch[1]);
            }
          }

          functions.push({
            name: funcName,
            type: 'sql_function',
            params,
            startLine: lineNumber,
            endLine: lineNumber + statement.split('\n').length - 1,
            file: filePath,
            returnType,
          });
        }
      }
    } catch (error) {
      // Skip statements die niet geparseerd kunnen worden
      console.error(`Fout bij parsen van SQL statement op lijn ${lineNumber}:`, error);
    }

    lineNumber += statement.split('\n').length;
  }

  return {
    path: filePath,
    functions,
    classes: [],
    imports: [],
    variables: [],
    exports: [],
    sqlTables,
    sqlViews,
    language: 'sql',
  };
}

/**
 * Parse een SQL bestand met alternatieve methode (voor complexere queries)
 */
export async function parseSqlFileAdvanced(filePath: string): Promise<FileIndex> {
  const content = await fs.readFile(filePath, 'utf-8');
  // const relativePath = path.basename(filePath);

  const parser = new SqlParserCtorResolved();
  const functions: FunctionInfo[] = [];
  const sqlTables: SqlTableInfo[] = [];
  const sqlViews: SqlViewInfo[] = [];

  // Split content into individual statements
  const statements = content.split(';').filter((s) => s.trim());

  let lineNumber = 1;
  for (const statement of statements) {
    const trimmed = statement.trim();
    if (!trimmed) continue;

    try {
      // Try to parse with node-sql-parser
      const ast = parser.astify(trimmed, { database: 'TransactSQL' });

      if (Array.isArray(ast)) {
        for (const node of ast) {
          processAstNode(node, lineNumber, filePath, functions, sqlTables, sqlViews);
        }
      } else if (ast) {
        processAstNode(ast, lineNumber, filePath, functions, sqlTables, sqlViews);
      }
    } catch {
      // Fallback to basic parsing if advanced parsing fails
      // Already handled in parseSqlFile
    }

    lineNumber += statement.split('\n').length;
  }

  return {
    path: filePath,
    functions,
    classes: [],
    imports: [],
    variables: [],
    exports: [],
    sqlTables,
    sqlViews,
    language: 'sql',
  };
}

function processAstNode(
  node: unknown,
  lineNumber: number,
  relativePath: string,
  functions: FunctionInfo[],
  sqlTables: SqlTableInfo[],
  sqlViews: SqlViewInfo[],
) {
  if (!node) return;

  // Handle CREATE TABLE
  const n = node as {
    type?: unknown;
    keyword?: unknown;
    table?: unknown;
    create_definitions?: unknown;
  };
  if (n.type === 'create' && n.keyword === 'table') {
    const tableRaw = n.table as unknown;
    const tableName =
      typeof tableRaw === 'string'
        ? tableRaw
        : ((tableRaw as { table?: unknown }).table as string | undefined) || 'unknown';

    const defs = n.create_definitions as unknown;
    const columns = Array.isArray(defs)
      ? (defs
          .map((def) => {
            const d = def as { column?: unknown };
            const c = d.column as unknown;
            return typeof c === 'string'
              ? c
              : ((c as { column?: unknown }).column as string | undefined) || undefined;
          })
          .filter((v): v is string => Boolean(v)) as string[])
      : [];

    sqlTables.push({
      name: tableName,
      columns,
      file: relativePath,
      line: lineNumber,
    });
  }

  // Handle CREATE VIEW
  if (n.type === 'create' && n.keyword === 'view') {
    const viewRaw = (node as { view?: unknown }).view;
    const viewName =
      typeof viewRaw === 'string'
        ? viewRaw
        : ((viewRaw as { view?: unknown }).view as string | undefined) || 'unknown';

    sqlViews.push({
      name: viewName,
      file: relativePath,
      line: lineNumber,
    });
  }
}
