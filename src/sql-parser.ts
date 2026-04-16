import * as fs from 'node:fs/promises';
import type { FileIndex, SqlTriggerInfo } from './schemas.js';

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function normalizeIdentifier(value: string): string {
  return value
    .replaceAll('[', '')
    .replaceAll(']', '')
    .replaceAll('"', '')
    .replaceAll('`', '')
    .trim();
}

function extractParamNames(section: string | undefined): string[] {
  if (!section) {
    return [];
  }

  return [...section.matchAll(/@?(\w+)/g)]
    .map((match) => match[1])
    .filter((value) => typeof value === 'string' && value.length > 0);
}

function extractColumnsFromDefinition(definition: string): string[] {
  return [...definition.matchAll(/^[\t ]*\[?(\w+)\]?\s+[A-Z][A-Z0-9_]*(?:\([^\n)]*\))?/gim)]
    .map((match) => match[1])
    .filter(
      (value) =>
        !['CONSTRAINT', 'PRIMARY', 'FOREIGN', 'UNIQUE', 'CHECK'].includes(value.toUpperCase()),
    );
}

function createSqlFileIndex(filePath: string): FileIndex {
  return {
    path: filePath,
    functions: [],
    classes: [],
    imports: [],
    variables: [],
    exports: [],
    sqlTables: [],
    sqlViews: [],
    sqlTriggers: [],
    sqlIndexes: [],
    language: 'sql',
  };
}

export async function parseSqlFile(filePath: string): Promise<FileIndex> {
  const content = await fs.readFile(filePath, 'utf-8');
  const result = createSqlFileIndex(filePath);

  const tableRegex = /CREATE\s+TABLE\s+([^\s(]+)\s*\(([\s\S]*?)\)\s*(?:;|\bGO\b|$)/gim;
  for (const match of content.matchAll(tableRegex)) {
    const tableName = normalizeIdentifier(match[1]);
    result.sqlTables?.push({
      name: tableName,
      columns: extractColumnsFromDefinition(match[2]),
      file: filePath,
      line: getLineNumber(content, match.index ?? 0),
    });
  }

  const viewRegex = /CREATE\s+(?:OR\s+REPLACE\s+)?VIEW\s+([^\s]+)\s+AS/gim;
  for (const match of content.matchAll(viewRegex)) {
    result.sqlViews?.push({
      name: normalizeIdentifier(match[1]),
      file: filePath,
      line: getLineNumber(content, match.index ?? 0),
    });
  }

  const procedureRegex =
    /CREATE\s+(?:OR\s+ALTER\s+)?(?:PROCEDURE|PROC)\s+([^\s(]+)([\s\S]*?)(?:\bAS\b|\bBEGIN\b)/gim;
  for (const match of content.matchAll(procedureRegex)) {
    const body = match[0];
    const startIndex = match.index ?? 0;
    result.functions.push({
      name: normalizeIdentifier(match[1]),
      type: 'stored_procedure',
      params: extractParamNames(body),
      startLine: getLineNumber(content, startIndex),
      endLine: getLineNumber(content, startIndex + body.length),
      file: filePath,
    });
  }

  const functionRegex =
    /CREATE\s+(?:OR\s+REPLACE\s+|OR\s+ALTER\s+)?FUNCTION\s+([^\s(]+)\s*\(([^)]*)\)\s*RETURNS\s+([^\s]+(?:\([^)]*\))?)/gim;
  for (const match of content.matchAll(functionRegex)) {
    const body = match[0];
    const startIndex = match.index ?? 0;
    result.functions.push({
      name: normalizeIdentifier(match[1]),
      type: 'sql_function',
      params: extractParamNames(match[2]),
      startLine: getLineNumber(content, startIndex),
      endLine: getLineNumber(content, startIndex + body.length),
      file: filePath,
      returnType: match[3].trim(),
    });
  }

  const triggerRegex =
    /CREATE\s+(?:OR\s+REPLACE\s+)?TRIGGER\s+([^\s]+)\s+(?:BEFORE|AFTER|INSTEAD\s+OF)\s+((?:INSERT|UPDATE|DELETE)(?:\s+OR\s+(?:INSERT|UPDATE|DELETE))*)\s+ON\s+([^\s(]+)/gim;
  for (const match of content.matchAll(triggerRegex)) {
    const events = match[2].split(/\s+OR\s+/i).map((value) => value.trim().toUpperCase());
    for (const event of events) {
      result.sqlTriggers?.push({
        name: normalizeIdentifier(match[1]),
        event: event as SqlTriggerInfo['event'],
        table: normalizeIdentifier(match[3]),
        file: filePath,
        line: getLineNumber(content, match.index ?? 0),
      });
    }
  }

  const indexRegex = /CREATE\s+(UNIQUE\s+)?INDEX\s+([^\s]+)\s+ON\s+([^\s(]+)\s*\(([^)]+)\)/gim;
  for (const match of content.matchAll(indexRegex)) {
    result.sqlIndexes?.push({
      name: normalizeIdentifier(match[2]),
      table: normalizeIdentifier(match[3]),
      columns: match[4].split(',').map((value) => normalizeIdentifier(value)),
      isUnique: Boolean(match[1]?.trim()),
      file: filePath,
      line: getLineNumber(content, match.index ?? 0),
    });
  }

  return result;
}
