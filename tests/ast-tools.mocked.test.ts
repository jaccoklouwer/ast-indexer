import type Parser from 'tree-sitter';
import { describe, expect, it, vi } from 'vitest';
import {
  getAst,
  getAstNodeAtPosition,
  getAstNodeRelatives,
  getDocumentSymbols,
  getFoldingRanges,
  getHighlightCaptures,
  getSyntaxErrors,
} from '../src/ast-tools.js';
import type { TreeSitterEngine } from '../src/tree-sitter-engine.js';

interface FakeNodeOptions {
  type: string;
  text?: string;
  startRow?: number;
  endRow?: number;
  isNamed?: boolean;
  isError?: boolean;
  isMissing?: boolean;
  children?: Parser.SyntaxNode[];
  namedChildren?: Parser.SyntaxNode[];
  fields?: Record<string, Parser.SyntaxNode>;
}

function createNode(options: FakeNodeOptions): Parser.SyntaxNode {
  const children = options.children ?? [];
  const namedChildren = options.namedChildren ?? children;
  const fields = options.fields ?? {};
  const node = {
    type: options.type,
    text: options.text ?? options.type,
    startPosition: { row: options.startRow ?? 0, column: 0 },
    endPosition: { row: options.endRow ?? options.startRow ?? 0, column: 1 },
    startIndex: 0,
    endIndex: 1,
    isNamed: options.isNamed ?? true,
    hasError: options.isError ?? false,
    isError: options.isError ?? false,
    isMissing: options.isMissing ?? false,
    parent: null,
    children,
    namedChildren,
    namedChildCount: namedChildren.length,
    previousNamedSibling: null,
    nextNamedSibling: null,
    childForFieldName(fieldName: string) {
      return fields[fieldName] ?? null;
    },
  } as unknown as Parser.SyntaxNode;

  for (let index = 0; index < namedChildren.length; index += 1) {
    const child = namedChildren[index];
    (child as { parent: Parser.SyntaxNode | null }).parent = node;
    (child as { previousNamedSibling: Parser.SyntaxNode | null }).previousNamedSibling =
      namedChildren[index - 1] ?? null;
    (child as { nextNamedSibling: Parser.SyntaxNode | null }).nextNamedSibling =
      namedChildren[index + 1] ?? null;
  }

  for (const child of children) {
    (child as { parent: Parser.SyntaxNode | null }).parent = node;
  }

  return node;
}

function createEngine(
  rootNode: Parser.SyntaxNode,
  nodeAtPosition: Parser.SyntaxNode,
): TreeSitterEngine {
  const serializeNode = vi.fn((node: Parser.SyntaxNode) => ({
    type: node.type,
    text: node.text,
    startLine: node.startPosition.row + 1,
    startColumn: 1,
    endLine: node.endPosition.row + 1,
    endColumn: 2,
    isNamed: node.isNamed,
    hasError: node.hasError,
    isMissing: node.isMissing,
    children: [],
  }));

  return {
    parseFile: vi.fn(async () => ({ rootNode })),
    getNodeAtPosition: vi.fn(async () => nodeAtPosition),
    createQuery: vi.fn(async () => ({
      captures: () => [
        {
          name: 'name',
          node: createNode({
            type: 'identifier',
            text: 'wave',
            startRow: 5,
            endRow: 5,
          }),
        },
      ],
    })),
    getFileLanguage: vi.fn(() => 'typescript'),
    serializeNode,
  } as unknown as TreeSitterEngine;
}

describe('ast-tools met gemockte TreeSitterEngine', () => {
  it('dekt AST serialisatie, parent limiting en relatives branches', async () => {
    const leaf = createNode({ type: 'identifier', text: 'value' });
    const parent6 = createNode({ type: 'program' });
    const parent5 = createNode({ type: 'module_block' });
    const parent4 = createNode({ type: 'namespace_declaration' });
    const parent3 = createNode({ type: 'class_declaration' });
    const parent2 = createNode({ type: 'method_definition' });
    const parent1 = createNode({ type: 'statement_block' });
    (leaf as { parent: Parser.SyntaxNode | null }).parent = parent1;
    (parent1 as { parent: Parser.SyntaxNode | null }).parent = parent2;
    (parent2 as { parent: Parser.SyntaxNode | null }).parent = parent3;
    (parent3 as { parent: Parser.SyntaxNode | null }).parent = parent4;
    (parent4 as { parent: Parser.SyntaxNode | null }).parent = parent5;
    (parent5 as { parent: Parser.SyntaxNode | null }).parent = parent6;
    const previousSibling = createNode({ type: 'property_identifier', text: 'before' });
    const nextSibling = createNode({ type: 'property_identifier', text: 'after' });
    const target = createNode({
      type: 'property_identifier',
      text: 'current',
      namedChildren: [leaf],
    });
    (target as { parent: Parser.SyntaxNode | null }).parent = parent1;
    (target as { previousNamedSibling: Parser.SyntaxNode | null }).previousNamedSibling =
      previousSibling;
    (target as { nextNamedSibling: Parser.SyntaxNode | null }).nextNamedSibling = nextSibling;
    const rootTarget = createNode({
      type: 'property_identifier',
      text: 'current',
      namedChildren: [createNode({ type: 'identifier', text: 'value' })],
    });
    const root = createNode({
      type: 'program',
      namedChildren: [previousSibling, rootTarget, nextSibling],
    });
    const engine = createEngine(root, target);

    const ast = await getAst(engine, 'file.ts', 3, false);
    const nodeAtPosition = await getAstNodeAtPosition(engine, 'file.ts', 1, 1);
    const relativesWithoutOptions = await getAstNodeRelatives(engine, 'file.ts', 1, 1);
    const relativesWithOptions = await getAstNodeRelatives(engine, 'file.ts', 1, 1, {
      includeParent: true,
      includeSiblings: true,
    });

    expect(ast.language).toBe('typescript');
    expect((engine.serializeNode as ReturnType<typeof vi.fn>).mock.calls[0]).toEqual([
      root,
      3,
      false,
    ]);
    expect(nodeAtPosition.parents).toHaveLength(5);
    expect(relativesWithoutOptions.parent).toBeNull();
    expect(relativesWithoutOptions.previousSibling).toBeNull();
    expect(relativesWithOptions.previousSibling?.text).toBe('before');
    expect(relativesWithOptions.nextSibling?.text).toBe('after');
  });

  it('dekt syntax errors, folding ranges en document symbols zonder runtime', async () => {
    const className = createNode({ type: 'identifier', text: 'Greeter' });
    const methodName = createNode({ type: 'property_identifier', text: 'greet' });
    const method = createNode({
      type: 'method_definition',
      startRow: 2,
      endRow: 4,
      fields: { name: methodName },
      namedChildren: [methodName],
    });
    const classNode = createNode({
      type: 'class_declaration',
      startRow: 1,
      endRow: 5,
      fields: { name: className },
      namedChildren: [className, method],
    });
    const wrappedFunctionName = createNode({ type: 'identifier', text: 'wave' });
    const functionNode = createNode({
      type: 'function_declaration',
      startRow: 7,
      endRow: 9,
      namedChildren: [wrappedFunctionName],
    });
    const exportNode = createNode({
      type: 'export_statement',
      startRow: 7,
      endRow: 9,
      namedChildren: [functionNode],
    });
    const commentNode = createNode({
      type: 'line_comment',
      text: '// TODO',
      startRow: 10,
      endRow: 11,
    });
    const importNode = createNode({
      type: 'import_declaration',
      startRow: 12,
      endRow: 13,
    });
    const blockNode = createNode({
      type: 'statement_block',
      startRow: 14,
      endRow: 16,
      namedChildren: [createNode({ type: 'identifier', text: 'child' })],
    });
    const errorNode = createNode({
      type: 'ERROR',
      text: 'broken',
      isError: true,
      startRow: 17,
      endRow: 17,
    });
    const missingNode = createNode({
      type: 'identifier',
      text: '',
      isMissing: true,
      startRow: 18,
      endRow: 18,
    });
    const root = createNode({
      type: 'program',
      endRow: 18,
      children: [classNode, exportNode, commentNode, importNode, blockNode, errorNode, missingNode],
      namedChildren: [
        classNode,
        exportNode,
        commentNode,
        importNode,
        blockNode,
        errorNode,
        missingNode,
      ],
    });
    const engine = createEngine(root, classNode);

    const syntaxErrors = await getSyntaxErrors(engine, 'file.ts');
    const captures = await getHighlightCaptures(engine, 'file.ts', '(identifier) @name');
    const foldingRanges = await getFoldingRanges(engine, 'file.ts');
    const documentSymbols = await getDocumentSymbols(engine, 'file.ts');

    expect(syntaxErrors.count).toBe(2);
    expect(captures.captures[0]?.captureName).toBe('name');
    expect(foldingRanges.foldingRanges.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['comment', 'imports', 'region']),
    );
    expect(documentSymbols.symbols.map((item) => item.name)).toEqual(
      expect.arrayContaining(['Greeter', 'wave']),
    );
    expect(documentSymbols.symbols[0]?.children.map((item) => item.name)).toContain('greet');
  });
});
