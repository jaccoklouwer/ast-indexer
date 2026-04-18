import type Parser from 'tree-sitter';

const SYMBOL_NODE_TYPES = [
  'class',
  'enum',
  'function',
  'interface',
  'method',
  'namespace',
  'record',
  'struct',
  'type_alias',
] as const;

export function walkSyntaxTree(
  node: Parser.SyntaxNode,
  visitor: (currentNode: Parser.SyntaxNode) => void,
): void {
  visitor(node);
  for (const child of node.children) {
    walkSyntaxTree(child, visitor);
  }
}

export function getNodeName(node: Parser.SyntaxNode): string | undefined {
  const nameNode =
    node.childForFieldName('name') ??
    node.namedChildren.find(
      (child) => child.type === 'identifier' || child.type.endsWith('_identifier'),
    );
  return nameNode?.text || undefined;
}

export function isSymbolNode(node: Parser.SyntaxNode): boolean {
  return SYMBOL_NODE_TYPES.some((nodeType) => node.type.includes(nodeType));
}
