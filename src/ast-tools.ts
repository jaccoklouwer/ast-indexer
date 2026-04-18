import type Parser from 'tree-sitter';
import { TreeSitterEngine } from './tree-sitter-engine.js';
import { getNodeName, isSymbolNode, walkSyntaxTree } from './tree-sitter-utils.js';

interface SerializedNodeContext {
  engine: TreeSitterEngine;
  node: Parser.SyntaxNode;
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

function buildDocumentSymbols(node: Parser.SyntaxNode): Array<{
  name: string;
  kind: string;
  startLine: number;
  startColumn: number;
  endLine: number;
  endColumn: number;
  children: ReturnType<typeof buildDocumentSymbols>;
}> {
  const symbols: Array<{
    name: string;
    kind: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
    children: ReturnType<typeof buildDocumentSymbols>;
  }> = [];

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

export async function getDocumentSymbols(engine: TreeSitterEngine, filePath: string) {
  const tree = await engine.parseFile(filePath);
  const symbols = buildDocumentSymbols(tree.rootNode);

  return {
    filePath,
    count: symbols.length,
    symbols,
  };
}
