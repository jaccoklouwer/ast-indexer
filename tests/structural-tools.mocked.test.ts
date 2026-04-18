import type Parser from 'tree-sitter';
import { describe, expect, it, vi } from 'vitest';
import type { RepositoryIndex } from '../src/schemas.js';
import {
  detectTodos,
  findEnclosingSymbol,
  findSimilarNodes,
  getExpandedSelection,
  getScopeAtPosition,
  structuralSearch,
} from '../src/structural-tools.js';
import type { TreeSitterEngine } from '../src/tree-sitter-engine.js';

interface FakeNodeOptions {
  type: string;
  text?: string;
  startRow?: number;
  endRow?: number;
  isNamed?: boolean;
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
    isNamed: options.isNamed ?? true,
    children,
    namedChildren,
    parent: null,
    childForFieldName(fieldName: string) {
      return fields[fieldName] ?? null;
    },
  } as unknown as Parser.SyntaxNode;

  for (const child of namedChildren) {
    (child as { parent: Parser.SyntaxNode | null }).parent = node;
  }

  for (const child of children) {
    (child as { parent: Parser.SyntaxNode | null }).parent = node;
  }

  return node;
}

describe('structural-tools met gemockte TreeSitterEngine', () => {
  it('dekt structural search success, filters en swallowed query errors', async () => {
    const captureNode = createNode({ type: 'arrow_function', text: '(a) => a' });
    const rootNode = createNode({
      type: 'program',
      children: [captureNode],
      namedChildren: [captureNode],
    });
    const repositoryIndex = {
      repositoryPath: 'C:\\repo',
      files: [
        { path: 'C:\\repo\\src\\math.ts' },
        { path: 'C:\\repo\\src\\skip.ts' },
        { path: 'C:\\repo\\src\\ignore.js' },
      ],
    } as unknown as RepositoryIndex;
    const engine = {
      getFileLanguage: vi.fn((filePath: string) =>
        filePath.endsWith('.js') ? 'javascript' : 'typescript',
      ),
      parseFile: vi.fn(async () => ({ rootNode })),
      createQuery: vi.fn(async (filePath: string) => {
        if (filePath.includes('skip.ts')) {
          throw new Error('bad query');
        }

        return {
          captures: () => [{ name: 'fn', node: captureNode }],
        };
      }),
    } as unknown as TreeSitterEngine;

    const result = await structuralSearch(engine, repositoryIndex, '(arrow_function) @fn');
    const filteredResult = await structuralSearch(
      engine,
      repositoryIndex,
      '(arrow_function) @fn',
      'typescript',
      'math.ts',
    );

    expect(result.count).toBe(2);
    expect(filteredResult.count).toBe(1);
    await expect(
      structuralSearch(engine, repositoryIndex, '(arrow_function) @fn', 'typescript', 'skip.ts'),
    ).rejects.toThrow('Query is ongeldig');
  });

  it('dekt scope lookup, enclosing symbol en similar node matching', async () => {
    const sourceIdentifier = createNode({ type: 'identifier', text: 'value' });
    const sourceArgumentList = createNode({
      type: 'arguments',
      namedChildren: [createNode({ type: 'identifier', text: 'arg' })],
    });
    const sourceCall = createNode({
      type: 'call_expression',
      namedChildren: [sourceIdentifier, sourceArgumentList],
    });
    const methodName = createNode({ type: 'property_identifier', text: 'run' });
    const methodNode = createNode({
      type: 'method_definition',
      startRow: 3,
      endRow: 6,
      fields: { name: methodName },
      namedChildren: [methodName, sourceCall],
    });
    const className = createNode({ type: 'identifier', text: 'Worker' });
    const classNode = createNode({
      type: 'class_declaration',
      startRow: 1,
      endRow: 7,
      fields: { name: className },
      namedChildren: [className, methodNode],
    });
    const programNode = createNode({
      type: 'program',
      endRow: 7,
      namedChildren: [classNode],
      children: [classNode],
    });
    const matchingCall = createNode({
      type: 'call_expression',
      namedChildren: [
        createNode({ type: 'identifier', text: 'another' }),
        createNode({
          type: 'arguments',
          namedChildren: [createNode({ type: 'identifier', text: 'arg' })],
        }),
      ],
    });
    const unmatchedCall = createNode({
      type: 'call_expression',
      namedChildren: [createNode({ type: 'identifier', text: 'x' })],
    });
    const otherRootNode = createNode({
      type: 'program',
      children: [matchingCall, unmatchedCall],
      namedChildren: [matchingCall, unmatchedCall],
    });
    const repositoryIndex = {
      repositoryPath: 'C:\\repo',
      files: [{ path: 'C:\\repo\\src\\source.ts' }, { path: 'C:\\repo\\src\\other.ts' }],
    } as unknown as RepositoryIndex;
    const engine = {
      getNodeAtPosition: vi.fn(
        async (_filePath: string, _line: number, _column: number) => sourceCall,
      ),
      parseFile: vi.fn(async (filePath: string) => ({
        rootNode: filePath.endsWith('source.ts') ? programNode : otherRootNode,
      })),
    } as unknown as TreeSitterEngine;

    const scope = await getScopeAtPosition(engine, 'C:\\repo\\src\\source.ts', 4, 5);
    const symbol = await findEnclosingSymbol(engine, 'C:\\repo\\src\\source.ts', 4, 5);
    const similarNodes = await findSimilarNodes(
      engine,
      repositoryIndex,
      'C:\\repo\\src\\source.ts',
      4,
      5,
      'other.ts',
    );
    const noSymbolEngine = {
      getNodeAtPosition: vi.fn(async () => createNode({ type: 'identifier', text: 'x' })),
    } as unknown as TreeSitterEngine;
    const missingSymbol = await findEnclosingSymbol(noSymbolEngine, 'file.ts', 1, 1);

    expect(scope.scopes.map((item) => item.type)).toEqual(
      expect.arrayContaining(['program', 'class_declaration', 'method_definition']),
    );
    expect(symbol.symbol?.name).toBe('run');
    expect(similarNodes.count).toBe(1);
    expect(missingSymbol.symbol).toBeNull();
  });

  it('dekt TODO detectie en selection expansion', async () => {
    const todoComment = createNode({
      type: 'line_comment',
      text: '// TODO: fix this',
      startRow: 1,
    });
    const noteComment = createNode({ type: 'block_comment', text: '/* note: doc */', startRow: 2 });
    const plainNode = createNode({ type: 'identifier', text: 'value', startRow: 3 });
    const rootNode = createNode({
      type: 'program',
      children: [todoComment, noteComment, plainNode],
      namedChildren: [todoComment, noteComment, plainNode],
    });
    const expandedNode = createNode({
      type: 'binary_expression',
      text: 'value * 2',
      startRow: 4,
      endRow: 4,
    });
    const engine = {
      parseFile: vi.fn(async () => ({
        rootNode: {
          ...rootNode,
          namedDescendantForPosition: () => expandedNode,
        },
      })),
    } as unknown as TreeSitterEngine;
    const repositoryIndex = {
      repositoryPath: 'C:\\repo',
      files: [{ path: 'C:\\repo\\src\\math.ts' }, { path: 'C:\\repo\\src\\skip.ts' }],
    } as unknown as RepositoryIndex;

    const todos = await detectTodos(engine, repositoryIndex, 'math.ts');
    const expanded = await getExpandedSelection(engine, 'C:\\repo\\src\\math.ts', 5, 10, 5, 14);

    expect(todos.matches.map((item) => item.kind)).toEqual(
      expect.arrayContaining(['TODO', 'NOTE']),
    );
    expect(expanded.expanded.type).toBe('binary_expression');
  });
});
