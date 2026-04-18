import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type Parser from 'tree-sitter';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const parserState = vi.hoisted(() => ({
  parse: vi.fn(),
  queryCalls: [] as Array<{ language: unknown; source: string | Buffer }>,
  setLanguage: vi.fn(),
}));

const languageState = vi.hoisted(() => ({
  csharp: { name: 'csharp' },
  javascript: { name: 'javascript' },
  sql: { name: 'sql' },
  tsx: { name: 'tsx' },
  typescript: { name: 'typescript' },
}));

vi.mock('tree-sitter', () => {
  class FakeQuery {
    constructor(language: unknown, source: string | Buffer) {
      parserState.queryCalls.push({ language, source });
    }

    captures() {
      return [];
    }

    matches() {
      return [];
    }
  }

  class FakeParser {
    static Query = FakeQuery;

    setLanguage = parserState.setLanguage;

    parse = parserState.parse;
  }

  return { default: FakeParser };
});

vi.mock('tree-sitter-javascript', () => ({ default: languageState.javascript }));
vi.mock('tree-sitter-typescript', () => ({
  default: {
    tsx: languageState.tsx,
    typescript: languageState.typescript,
  },
}));
vi.mock('tree-sitter-c-sharp', () => ({ default: languageState.csharp }));
vi.mock('tree-sitter-sql', () => ({ default: languageState.sql }));

import { TreeSitterEngine } from '../src/tree-sitter-engine.js';

interface FakeNodeOptions {
  children?: Parser.SyntaxNode[];
  endRow?: number;
  isNamed?: boolean;
  namedChildren?: Parser.SyntaxNode[];
  startRow?: number;
  text?: string;
  type: string;
}

function createNode(options: FakeNodeOptions): Parser.SyntaxNode {
  const children = options.children ?? [];
  const namedChildren = options.namedChildren ?? children;
  const node = {
    children,
    descendantForPosition: vi.fn(),
    endPosition: { row: options.endRow ?? options.startRow ?? 0, column: 2 },
    hasError: false,
    isMissing: false,
    isNamed: options.isNamed ?? true,
    namedChildren,
    namedDescendantForPosition: vi.fn(),
    startPosition: { row: options.startRow ?? 0, column: 0 },
    text: options.text ?? options.type,
    type: options.type,
  } as unknown as Parser.SyntaxNode;

  (
    node as unknown as { descendantForPosition: ReturnType<typeof vi.fn> }
  ).descendantForPosition.mockReturnValue(children[1] ?? node);
  (
    node as unknown as { namedDescendantForPosition: ReturnType<typeof vi.fn> }
  ).namedDescendantForPosition.mockReturnValue(namedChildren[0] ?? node);

  return node;
}

function createTree(content: string) {
  const identifierNode = createNode({
    endRow: 0,
    startRow: 0,
    text: content.includes('welcome') ? 'welcome' : 'greet',
    type: 'identifier',
  });
  const punctuationNode = createNode({
    endRow: 0,
    isNamed: false,
    startRow: 0,
    text: ';',
    type: ';',
  });
  const rootNode = createNode({
    children: [identifierNode, punctuationNode],
    endRow: 2,
    namedChildren: [identifierNode],
    startRow: 0,
    text: content,
    type: 'program',
  });

  return {
    edit: vi.fn(),
    rootNode,
    walk: vi.fn(),
  } as unknown as Parser.Tree;
}

describe('tree-sitter-engine met gemockte runtime', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-tree-sitter-mocked-'));
  });

  beforeEach(() => {
    parserState.parse.mockReset();
    parserState.setLanguage.mockReset();
    parserState.queryCalls.length = 0;
    (TreeSitterEngine as unknown as { languageCache: Map<string, unknown> }).languageCache.clear();
    (TreeSitterEngine as unknown as { parserCache: Map<string, unknown> }).parserCache.clear();
    (TreeSitterEngine as unknown as { parserConstructor?: unknown }).parserConstructor = undefined;
    parserState.parse.mockImplementation((content: string) => createTree(content));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('dekt taalresolutie, parsercaching en query-creatie', async () => {
    const engine = new TreeSitterEngine();

    await expect(TreeSitterEngine.getLanguage('javascript')).resolves.toBe(
      languageState.javascript,
    );
    await expect(TreeSitterEngine.getLanguage('typescript')).resolves.toBe(
      languageState.typescript,
    );
    await expect(TreeSitterEngine.getLanguage('tsx')).resolves.toBe(languageState.tsx);
    await expect(TreeSitterEngine.getLanguage('csharp')).resolves.toBe(languageState.csharp);
    await expect(TreeSitterEngine.getLanguage('sql')).resolves.toBe(languageState.sql);

    const parserOne = await TreeSitterEngine.getParser('typescript');
    const parserTwo = await TreeSitterEngine.getParser('typescript');
    const query = await engine.createQuery('C:\\repo\\src\\demo.ts', '(program) @root');

    expect(parserOne).toBe(parserTwo);
    expect(parserState.setLanguage).toHaveBeenCalledTimes(1);
    expect(parserState.setLanguage).toHaveBeenCalledWith(languageState.typescript);
    expect(parserState.queryCalls).toEqual([
      {
        language: languageState.typescript,
        source: '(program) @root',
      },
    ]);
    expect(query).toBeDefined();
  });

  it('dekt parsing, cache-opslag, content lookup en node lookups', async () => {
    const engine = new TreeSitterEngine();
    const filePath = path.join(tempDir, 'sample.ts');
    const otherFilePath = path.join(tempDir, 'other.ts');
    await fs.writeFile(filePath, 'export function greet() { return 1; }');
    await fs.writeFile(otherFilePath, 'export const value = 1;');

    const firstTree = await engine.parseFile(filePath);
    const secondTree = await engine.parseContent(
      filePath,
      'export function welcome() { return 2; }',
    );
    const cachedTree = await engine.getTree(filePath);
    const cachedContent = await engine.getContent(filePath);
    const uncachedContent = await engine.getContent(otherFilePath);
    const namedNode = await engine.getNodeAtPosition(filePath, 1, 1);
    const anyNode = await engine.getNodeAtPosition(filePath, 1, 1, false);

    expect(parserState.parse.mock.calls).toHaveLength(3);
    expect(parserState.parse.mock.calls[0]?.[1]).toBeNull();
    expect(parserState.parse.mock.calls[1]?.[1]).toBe(firstTree);
    expect(cachedTree).toBe(secondTree);
    expect(cachedContent).toContain('welcome');
    expect(uncachedContent).toContain('value');
    expect(namedNode.type).toBe('identifier');
    expect(anyNode.type).toBe(';');
    expect(
      (
        secondTree.rootNode as unknown as {
          namedDescendantForPosition: ReturnType<typeof vi.fn>;
        }
      ).namedDescendantForPosition,
    ).toHaveBeenCalledWith({ row: 0, column: 0 });
    expect(
      (
        secondTree.rootNode as unknown as {
          descendantForPosition: ReturnType<typeof vi.fn>;
        }
      ).descendantForPosition,
    ).toHaveBeenCalledWith({ row: 0, column: 0 });
    expect(await engine.getLanguageForFile(filePath)).toBe(languageState.typescript);
    expect(engine.getFileLanguage('component.tsx')).toBe('tsx');
    expect(engine.getFileLanguage('script.js')).toBe('javascript');
    expect(engine.getFileLanguage('service.cs')).toBe('csharp');
    expect(engine.getFileLanguage('schema.sql')).toBe('sql');
    expect(() => engine.getFileLanguage('README.md')).toThrow('Tree-sitter wordt niet ondersteund');
  });

  it('dekt cachebeheer, updates, getTreeAndContent-fout en serialisatie', async () => {
    const engine = new TreeSitterEngine();
    const rootPath = 'C:\\repo\\src';
    const nestedPath = 'C:\\repo\\src\\nested\\demo.ts';
    const exactPath = 'C:\\repo\\other.ts';

    await engine.parseContent(path.join(rootPath, 'index.ts'), 'export function greet() {}');
    await engine.parseContent(nestedPath, 'export function nested() {}');
    const originalTree = await engine.parseContent(exactPath, 'export function target() {}');

    const updatedTree = await engine.updateFile(
      exactPath,
      {
        newEndIndex: 24,
        newEndPosition: { row: 0, column: 24 },
        oldEndIndex: 22,
        oldEndPosition: { row: 0, column: 22 },
        startIndex: 16,
        startPosition: { row: 0, column: 16 },
      },
      'export function welcome() {}',
    );

    expect(
      (originalTree as unknown as { edit: ReturnType<typeof vi.fn> }).edit,
    ).toHaveBeenCalledWith({
      newEndIndex: 24,
      newEndPosition: { row: 0, column: 24 },
      oldEndIndex: 22,
      oldEndPosition: { row: 0, column: 22 },
      startIndex: 16,
      startPosition: { row: 0, column: 16 },
    });
    expect(parserState.parse.mock.calls.at(-1)?.[1]).toBe(originalTree);
    expect(updatedTree).toBeDefined();

    engine.clearCache(rootPath);
    expect(await engine.getTree(path.join(rootPath, 'index.ts'))).toBeUndefined();
    expect(await engine.getTree(nestedPath)).toBeUndefined();
    expect(await engine.getTree(exactPath)).toBe(updatedTree);

    engine.invalidateFile(exactPath);
    expect(await engine.getTree(exactPath)).toBeUndefined();

    await engine.parseContent(exactPath, 'export function restored() {}');
    engine.clearCache();
    expect(await engine.getTree(exactPath)).toBeUndefined();

    const parseSpy = vi.spyOn(engine, 'parseFile').mockResolvedValue(createTree('missing'));
    await expect(engine.getTreeAndContent('C:\\repo\\missing.ts')).rejects.toThrow(
      'Bestand kon niet met Tree-sitter worden geladen',
    );
    parseSpy.mockRestore();

    const leafNode = createNode({ endRow: 1, startRow: 1, text: 'leaf', type: 'identifier' });
    const hiddenNode = createNode({
      endRow: 1,
      isNamed: false,
      startRow: 1,
      text: ';',
      type: ';',
    });
    const parentNode = createNode({
      children: [leafNode, hiddenNode],
      endRow: 2,
      namedChildren: [leafNode],
      startRow: 0,
      text: 'parent',
      type: 'program',
    });

    const namedSerialized = engine.serializeNode(parentNode, 0, true);
    const fullSerialized = engine.serializeNode(parentNode, 2, false);

    expect(namedSerialized.children).toEqual([]);
    expect(fullSerialized.children).toHaveLength(2);
    expect(fullSerialized.startLine).toBe(1);
    expect(fullSerialized.endColumn).toBe(3);
  });
});
