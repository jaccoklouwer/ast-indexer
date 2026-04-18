import type Parser from 'tree-sitter';
import type { RepositoryIndex } from './schemas.js';
import { TreeSitterEngine } from './tree-sitter-engine.js';
import { getNodeName, isSymbolNode, walkSyntaxTree } from './tree-sitter-utils.js';

function matchesFileName(filePath: string, fileName?: string): boolean {
  return !fileName || filePath.includes(fileName);
}

function isScopeNode(node: Parser.SyntaxNode): boolean {
  return (
    node.type === 'program' ||
    node.type.includes('function') ||
    node.type.includes('class') ||
    node.type.includes('method') ||
    node.type.includes('block') ||
    node.type.includes('namespace')
  );
}

function normalizeSignature(node: Parser.SyntaxNode, maxDepth = 2): string {
  if (maxDepth === 0 || node.namedChildren.length === 0) {
    return node.type;
  }

  return `${node.type}(${node.namedChildren
    .map((child) => normalizeSignature(child, maxDepth - 1))
    .join(',')})`;
}

export async function structuralSearch(
  engine: TreeSitterEngine,
  repositoryIndex: RepositoryIndex,
  querySource: string,
  languageFilter?: 'javascript' | 'typescript' | 'tsx' | 'csharp' | 'sql',
  fileName?: string,
) {
  const matches: Array<{
    filePath: string;
    captureName: string;
    nodeType: string;
    text: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  }> = [];

  for (const file of repositoryIndex.files) {
    if (!matchesFileName(file.path, fileName)) {
      continue;
    }

    const fileLanguage = engine.getFileLanguage(file.path);
    if (languageFilter && fileLanguage !== languageFilter) {
      continue;
    }

    const tree = await engine.parseFile(file.path);

    try {
      const captures = (await engine.createQuery(file.path, querySource)).captures(tree.rootNode);
      matches.push(
        ...captures.map((capture) => ({
          filePath: file.path,
          captureName: capture.name,
          nodeType: capture.node.type,
          text: capture.node.text,
          startLine: capture.node.startPosition.row + 1,
          startColumn: capture.node.startPosition.column + 1,
          endLine: capture.node.endPosition.row + 1,
          endColumn: capture.node.endPosition.column + 1,
        })),
      );
    } catch {
      if (languageFilter) {
        throw new Error(`Query is ongeldig voor taal ${fileLanguage}`);
      }
    }
  }

  return {
    repositoryPath: repositoryIndex.repositoryPath,
    count: matches.length,
    matches,
  };
}

export async function getScopeAtPosition(
  engine: TreeSitterEngine,
  filePath: string,
  line: number,
  column: number,
) {
  const scopes: Array<{
    type: string;
    name?: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  }> = [];
  let currentNode: Parser.SyntaxNode | null = await engine.getNodeAtPosition(
    filePath,
    line,
    column,
  );

  while (currentNode) {
    if (isScopeNode(currentNode)) {
      scopes.push({
        type: currentNode.type,
        name: getNodeName(currentNode),
        startLine: currentNode.startPosition.row + 1,
        startColumn: currentNode.startPosition.column + 1,
        endLine: currentNode.endPosition.row + 1,
        endColumn: currentNode.endPosition.column + 1,
      });
    }
    currentNode = currentNode.parent;
  }

  return {
    filePath,
    line,
    column,
    scopes: scopes.reverse(),
  };
}

export async function findEnclosingSymbol(
  engine: TreeSitterEngine,
  filePath: string,
  line: number,
  column: number,
) {
  let currentNode: Parser.SyntaxNode | null = await engine.getNodeAtPosition(
    filePath,
    line,
    column,
  );

  while (currentNode) {
    if (isSymbolNode(currentNode)) {
      return {
        filePath,
        line,
        column,
        symbol: {
          type: currentNode.type,
          name: getNodeName(currentNode) ?? currentNode.type,
          startLine: currentNode.startPosition.row + 1,
          startColumn: currentNode.startPosition.column + 1,
          endLine: currentNode.endPosition.row + 1,
          endColumn: currentNode.endPosition.column + 1,
        },
      };
    }

    currentNode = currentNode.parent;
  }

  return {
    filePath,
    line,
    column,
    symbol: null,
  };
}

export async function findSimilarNodes(
  engine: TreeSitterEngine,
  repositoryIndex: RepositoryIndex,
  filePath: string,
  line: number,
  column: number,
  fileName?: string,
) {
  const sourceNode = await engine.getNodeAtPosition(filePath, line, column);
  const sourceSignature = normalizeSignature(sourceNode);
  const matches: Array<{
    filePath: string;
    nodeType: string;
    text: string;
    startLine: number;
    startColumn: number;
    endLine: number;
    endColumn: number;
  }> = [];

  for (const file of repositoryIndex.files) {
    if (!matchesFileName(file.path, fileName)) {
      continue;
    }

    const tree = await engine.parseFile(file.path);
    walkSyntaxTree(tree.rootNode, (node) => {
      if (!node.isNamed || node.type !== sourceNode.type) {
        return;
      }

      if (normalizeSignature(node) !== sourceSignature) {
        return;
      }

      matches.push({
        filePath: file.path,
        nodeType: node.type,
        text: node.text,
        startLine: node.startPosition.row + 1,
        startColumn: node.startPosition.column + 1,
        endLine: node.endPosition.row + 1,
        endColumn: node.endPosition.column + 1,
      });
    });
  }

  return {
    filePath,
    line,
    column,
    signature: sourceSignature,
    count: matches.length,
    matches,
  };
}

export async function detectTodos(
  engine: TreeSitterEngine,
  repositoryIndex: RepositoryIndex,
  fileName?: string,
) {
  const todoPattern = /\b(TODO|FIXME|HACK|NOTE|XXX)\b/i;
  const matches: Array<{
    filePath: string;
    line: number;
    kind: string;
    text: string;
  }> = [];

  for (const file of repositoryIndex.files) {
    if (!matchesFileName(file.path, fileName)) {
      continue;
    }

    const tree = await engine.parseFile(file.path);
    walkSyntaxTree(tree.rootNode, (node) => {
      if (!node.type.includes('comment')) {
        return;
      }

      const todoMatch = node.text.match(todoPattern);
      if (!todoMatch) {
        return;
      }

      matches.push({
        filePath: file.path,
        line: node.startPosition.row + 1,
        kind: todoMatch[1]?.toUpperCase() ?? 'TODO',
        text: node.text.trim(),
      });
    });
  }

  return {
    repositoryPath: repositoryIndex.repositoryPath,
    count: matches.length,
    matches,
  };
}

export async function getExpandedSelection(
  engine: TreeSitterEngine,
  filePath: string,
  startLine: number,
  startColumn: number,
  endLine: number,
  endColumn: number,
) {
  const tree = await engine.parseFile(filePath);
  const node = tree.rootNode.namedDescendantForPosition(
    { row: startLine - 1, column: startColumn - 1 },
    { row: endLine - 1, column: endColumn - 1 },
  );

  return {
    filePath,
    selection: {
      startLine,
      startColumn,
      endLine,
      endColumn,
    },
    expanded: {
      type: node.type,
      text: node.text,
      startLine: node.startPosition.row + 1,
      startColumn: node.startPosition.column + 1,
      endLine: node.endPosition.row + 1,
      endColumn: node.endPosition.column + 1,
    },
  };
}
