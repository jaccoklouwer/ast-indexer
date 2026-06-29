import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type Parser from 'tree-sitter';
import * as ts from 'typescript';
import { TreeSitterEngine } from './tree-sitter-engine.js';
import { getNodeName, isSymbolNode, walkSyntaxTree } from './tree-sitter-utils.js';

interface SerializedNodeContext {
  engine: TreeSitterEngine;
  node: Parser.SyntaxNode;
}

interface DocumentSymbolInfo {
  name: string;
  kind: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  children: DocumentSymbolInfo[];
}

function createErrorWithCause(message: string, cause: unknown): Error {
  return cause instanceof Error ? new Error(message, { cause }) : new Error(message);
}

function serializeNode(context: SerializedNodeContext) {
  return context.engine.serializeNode(context.node, 0, true);
}

function getNodeKind(node: Parser.SyntaxNode): string {
  if (node.type.includes('comment')) {
    return 'comment';
  }

  if (node.type.includes('import')) {
    return 'imports';
  }

  return 'region';
}

function isInterestingFoldingNode(node: Parser.SyntaxNode): boolean {
  const startLine = node.startPosition.row + 1;
  const endLine = node.endPosition.row + 1;

  if (startLine === endLine) {
    return false;
  }

  return (
    node.type.includes('comment') ||
    node.type.includes('declaration') ||
    node.type.includes('statement') ||
    node.type.includes('block') ||
    node.type.includes('body') ||
    node.type.includes('list') ||
    node.namedChildCount > 0
  );
}

function buildDocumentSymbols(node: Parser.SyntaxNode): DocumentSymbolInfo[] {
  const symbols: DocumentSymbolInfo[] = [];

  for (const child of node.namedChildren) {
    const children = buildDocumentSymbols(child);
    if (isSymbolNode(child)) {
      symbols.push({
        name: getNodeName(child) ?? child.type,
        kind: child.type,
        startLine: child.startPosition.row + 1,
        startColumn: child.startPosition.column + 1,
        endLine: child.endPosition.row + 1,
        endColumn: child.endPosition.column + 1,
        children,
      });
      continue;
    }

    symbols.push(...children);
  }

  return symbols;
}

export async function getAst(
  engine: TreeSitterEngine,
  filePath: string,
  maxDepth = 5,
  namedOnly = true,
) {
  const tree = await engine.parseFile(filePath);
  return {
    filePath,
    language: engine.getFileLanguage(filePath),
    tree: engine.serializeNode(tree.rootNode, maxDepth, namedOnly),
  };
}

export async function getAstNodeAtPosition(
  engine: TreeSitterEngine,
  filePath: string,
  line: number,
  column: number,
) {
  const node = await engine.getNodeAtPosition(filePath, line, column);
  const parents = [];
  let currentParent = node.parent;

  while (currentParent && parents.length < 5) {
    parents.push(serializeNode({ engine, node: currentParent }));
    currentParent = currentParent.parent;
  }

  return {
    filePath,
    line,
    column,
    node: serializeNode({ engine, node }),
    parents,
  };
}

export async function getAstNodeRelatives(
  engine: TreeSitterEngine,
  filePath: string,
  line: number,
  column: number,
  options?: { includeParent?: boolean; includeSiblings?: boolean },
) {
  const node = await engine.getNodeAtPosition(filePath, line, column);

  return {
    filePath,
    line,
    column,
    node: serializeNode({ engine, node }),
    parent:
      options?.includeParent && node.parent ? serializeNode({ engine, node: node.parent }) : null,
    children: node.namedChildren.map((child) => serializeNode({ engine, node: child })),
    previousSibling:
      options?.includeSiblings && node.previousNamedSibling
        ? serializeNode({ engine, node: node.previousNamedSibling })
        : null,
    nextSibling:
      options?.includeSiblings && node.nextNamedSibling
        ? serializeNode({ engine, node: node.nextNamedSibling })
        : null,
  };
}

export async function getSyntaxErrors(engine: TreeSitterEngine, filePath: string) {
  const tree = await engine.parseFile(filePath);
  const errors: Array<{
    type: string;
    text: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  }> = [];

  walkSyntaxTree(tree.rootNode, (node) => {
    if (!node.isError && !node.isMissing) {
      return;
    }

    errors.push({
      type: node.type,
      text: node.text,
      startLine: node.startPosition.row + 1,
      startColumn: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
    });
  });

  return {
    filePath,
    count: errors.length,
    errors,
  };
}

export async function getHighlightCaptures(
  engine: TreeSitterEngine,
  filePath: string,
  querySource: string,
) {
  const tree = await engine.parseFile(filePath);
  const query = await engine.createQuery(filePath, querySource);
  const captures = query.captures(tree.rootNode);

  return {
    filePath,
    count: captures.length,
    captures: captures.map((capture) => ({
      captureName: capture.name,
      nodeType: capture.node.type,
      text: capture.node.text,
      startLine: capture.node.startPosition.row + 1,
      startColumn: capture.node.startPosition.column + 1,
      endLine: capture.node.endPosition.row + 1,
      endColumn: capture.node.endPosition.column + 1,
    })),
  };
}

export async function getFoldingRanges(engine: TreeSitterEngine, filePath: string) {
  const tree = await engine.parseFile(filePath);
  const ranges = new Map<string, { startLine: number; endLine: number; kind: string }>();

  walkSyntaxTree(tree.rootNode, (node) => {
    if (!isInterestingFoldingNode(node)) {
      return;
    }

    const range = {
      startLine: node.startPosition.row + 1,
      endLine: node.endPosition.row + 1,
      kind: getNodeKind(node),
    };
    ranges.set(`${range.kind}:${range.startLine}:${range.endLine}`, range);
  });

  return {
    filePath,
    count: ranges.size,
    foldingRanges: [...ranges.values()].sort(
      (left, right) => left.startLine - right.startLine || left.endLine - right.endLine,
    ),
  };
}

async function getDocumentSymbolsFromTreeSitter(
  engine: TreeSitterEngine,
  filePath: string,
): Promise<DocumentSymbolInfo[]> {
  const tree = await engine.parseFile(filePath);
  return buildDocumentSymbols(tree.rootNode);
}

function getDocumentSymbolsFromTypeScript(
  filePath: string,
  sourceText: string,
): DocumentSymbolInfo[] {
  const sourceFile = ts.createSourceFile(
    filePath,
    sourceText,
    ts.ScriptTarget.Latest,
    true,
    /\.tsx?$/i.test(filePath) ? ts.ScriptKind.TS : ts.ScriptKind.JS,
  );

  const symbols: DocumentSymbolInfo[] = [];

  function visit(node: ts.Node): void {
    const kind = ts.SyntaxKind[node.kind];

    if (
      ts.isClassDeclaration(node) ||
      ts.isFunctionDeclaration(node) ||
      ts.isVariableDeclaration(node) ||
      ts.isInterfaceDeclaration(node) ||
      ts.isTypeAliasDeclaration(node) ||
      ts.isEnumDeclaration(node)
    ) {
      const sourceFile = node.getSourceFile();
      const { line: startLine, character: startColumn } = sourceFile.getLineAndCharacterOfPosition(
        node.getStart(),
      );
      const { line: endLine, character: endColumn } = sourceFile.getLineAndCharacterOfPosition(
        node.getEnd(),
      );

      const name =
        (node as ts.NamedDeclaration).name?.getText(sourceFile) ||
        (node as ts.VariableDeclaration).name.getText(sourceFile) ||
        'unnamed';

      symbols.push({
        name,
        kind,
        startLine: startLine + 1,
        startColumn: startColumn + 1,
        endLine: endLine + 1,
        endColumn: endColumn + 1,
        children: [],
      });
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return symbols;
}

export async function getDocumentSymbols(engine: TreeSitterEngine, filePath: string) {
  const extension = path.extname(filePath).toLowerCase();
  const isTypeScriptFile = ['.ts', '.tsx', '.js', '.jsx', '.mts', '.mjs', '.cts', '.cjs'].includes(
    extension,
  );
  const nodeMajorVersion = Number.parseInt(process.versions.node.split('.')[0] ?? '0', 10);

  // On Node 25+, prefer TypeScript Compiler API fallback to avoid Tree-sitter issues
  if (isTypeScriptFile && nodeMajorVersion >= 25) {
    try {
      const content = await fs.readFile(filePath, 'utf8');
      const symbols = getDocumentSymbolsFromTypeScript(filePath, content);
      return {
        filePath,
        count: symbols.length,
        symbols,
      };
    } catch (fallbackError) {
      // If fallback fails, try Tree-sitter anyway
      try {
        const symbols = await getDocumentSymbolsFromTreeSitter(engine, filePath);
        return {
          filePath,
          count: symbols.length,
          symbols,
        };
      } catch {
        throw new Error(
          `Kon symbolen niet ophalen uit ${filePath} op Node ${nodeMajorVersion}: TypeScript fallback faalde (${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)})`,
          { cause: fallbackError instanceof Error ? fallbackError : undefined },
        );
      }
    }
  }

  // Try Tree-sitter first for other files, with fallback for TS/JS
  try {
    const symbols = await getDocumentSymbolsFromTreeSitter(engine, filePath);
    return {
      filePath,
      count: symbols.length,
      symbols,
    };
  } catch (error) {
    // Fallback: use TypeScript Compiler API for TS/JS files
    if (isTypeScriptFile) {
      try {
        const content = await fs.readFile(filePath, 'utf8');
        const symbols = getDocumentSymbolsFromTypeScript(filePath, content);
        return {
          filePath,
          count: symbols.length,
          symbols,
        };
      } catch (fallbackError) {
        throw createErrorWithCause(
          `Kon symbolen niet ophalen uit ${filePath}: Tree-sitter faalde en TypeScript fallback ook: ${fallbackError instanceof Error ? fallbackError.message : String(fallbackError)}`,
          error,
        );
      }
    }

    // For non-TS/JS files, propagate the original error
    throw error;
  }
}
