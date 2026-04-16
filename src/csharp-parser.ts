import * as fs from 'node:fs/promises';
import iconv from 'iconv-lite';
import type { ClassInfo, FileIndex, FunctionInfo, ImportInfo, VariableInfo } from './schemas.js';

function decodeContent(raw: Buffer): string {
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    return iconv.decode(Buffer.from(raw.slice(2)), 'utf16le');
  }

  if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    const swapped = Buffer.alloc(raw.length - 2);
    for (let index = 2; index < raw.length; index += 2) {
      swapped[index - 2] = raw[index + 1] ?? 0;
      swapped[index - 1] = raw[index] ?? 0;
    }
    return iconv.decode(swapped, 'utf16le');
  }

  const nulCount = [...raw].filter((value) => value === 0).length;
  return nulCount / Math.max(raw.length, 1) > 0.2
    ? iconv.decode(raw, 'utf16le')
    : iconv.decode(raw, 'utf8');
}

function getLineNumber(content: string, index: number): number {
  return content.slice(0, index).split(/\r?\n/).length;
}

function findBlock(
  content: string,
  startIndex: number,
): { start: number; end: number } | undefined {
  const openBraceIndex = content.indexOf('{', startIndex);
  if (openBraceIndex === -1) {
    return undefined;
  }

  let depth = 0;
  for (let index = openBraceIndex; index < content.length; index += 1) {
    const char = content[index];
    if (char === '{') {
      depth += 1;
    } else if (char === '}') {
      depth -= 1;
      if (depth === 0) {
        return { start: openBraceIndex, end: index };
      }
    }
  }

  return undefined;
}

function extractParameters(parameterSection: string): string[] {
  return parameterSection
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean)
    .map((value) => value.split(/\s+/).at(-1)?.replace(/^@/, '') ?? 'param');
}

export async function parseCSharpFile(filePath: string): Promise<FileIndex> {
  const raw = await fs.readFile(filePath);
  const content = decodeContent(raw);
  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const variables: VariableInfo[] = [];
  const exports: string[] = [];
  const namespaceMatch = content.match(/namespace\s+([\w.]+)/);
  const namespaceName = namespaceMatch?.[1];

  for (const match of content.matchAll(/^\s*using\s+([\w.]+)\s*;/gm)) {
    imports.push({
      source: match[1],
      imported: [],
      isDefault: false,
      file: filePath,
      line: getLineNumber(content, match.index ?? 0),
      isNamespace: true,
    });
  }

  const classRegex =
    /((?:public|internal|protected|private|abstract|sealed|static)\s+)*(class|interface)\s+(\w+)(?:\s*:\s*([^{]+))?\s*{/g;
  const methodRegex =
    /((?:public|internal|protected|private|static|async|virtual|override|sealed|partial|extern|unsafe|new)\s+)*(?:[^\s(]+\s+)+(\w+)\s*\(([^)]*)\)\s*{/g;
  const propertyRegex =
    /((?:public|internal|protected|private|static)\s+)*(?:[^\s(]+\s+)+(\w+)\s*{\s*(?:get|set)/g;

  for (const match of content.matchAll(classRegex)) {
    const className = match[3];
    const modifiers = match[1] ?? '';
    const baseTypes =
      match[4]
        ?.split(',')
        .map((value) => value.trim())
        .filter(Boolean) ?? [];
    const block = findBlock(content, match.index ?? 0);
    const blockContent = block ? content.slice(block.start + 1, block.end) : '';
    const methods: string[] = [];
    const properties: string[] = [];

    for (const methodMatch of blockContent.matchAll(methodRegex)) {
      methods.push(methodMatch[2]);
    }

    for (const propertyMatch of blockContent.matchAll(propertyRegex)) {
      properties.push(propertyMatch[2]);
    }

    classes.push({
      name: className,
      methods,
      properties,
      startLine: getLineNumber(content, match.index ?? 0),
      endLine: getLineNumber(content, block?.end ?? match.index ?? 0),
      file: filePath,
      extends: match[2] === 'class' ? baseTypes[0] : undefined,
      implements: match[2] === 'class' ? baseTypes.slice(1) : baseTypes,
      namespace: namespaceName,
      isPublic: modifiers.includes('public'),
      isAbstract: modifiers.includes('abstract'),
      isInterface: match[2] === 'interface',
    });

    if (modifiers.includes('public')) {
      exports.push(className);
    }
  }

  for (const match of content.matchAll(methodRegex)) {
    const methodName = match[2];
    if (classes.some((item) => item.methods.includes(methodName))) {
      continue;
    }

    const modifiers = match[1] ?? '';
    functions.push({
      name: methodName,
      type: 'method',
      params: extractParameters(match[3]),
      startLine: getLineNumber(content, match.index ?? 0),
      endLine: getLineNumber(content, (match.index ?? 0) + match[0].length),
      file: filePath,
      isPublic: modifiers.includes('public'),
      isStatic: modifiers.includes('static'),
      isAsync: modifiers.includes('async'),
    });
  }

  return {
    path: filePath,
    functions,
    classes,
    imports,
    variables,
    exports,
    language: 'csharp',
  };
}
