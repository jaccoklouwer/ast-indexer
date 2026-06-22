import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { TreeSitterEngine } from '../src/tree-sitter-engine.js';

describe('TreeSitterEngine', () => {
  let tempDir: string;
  let sampleFilePath: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-tree-sitter-'));
    sampleFilePath = path.join(tempDir, 'sample.ts');
    await fs.writeFile(
      sampleFilePath,
      ['export function greet(name: string) {', '  return `hello ${name}`;', '}'].join('\n'),
    );
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('parseert een TypeScript bestand en serialiseert de root node', async () => {
    const engine = new TreeSitterEngine();
    const tree = await engine.parseFile(sampleFilePath);
    const serializedRoot = engine.serializeNode(tree.rootNode, 1, true);

    expect(tree.rootNode.type).toBe('program');
    expect(serializedRoot.type).toBe('program');
    expect(serializedRoot.children.length).toBeGreaterThan(0);
  });

  it('werkt een bestaande tree incrementeel bij', async () => {
    const engine = new TreeSitterEngine();
    await engine.parseFile(sampleFilePath);

    const updatedTree = await engine.updateFile(
      sampleFilePath,
      {
        startIndex: 16,
        oldEndIndex: 21,
        newEndIndex: 23,
        startPosition: { row: 0, column: 16 },
        oldEndPosition: { row: 0, column: 21 },
        newEndPosition: { row: 0, column: 23 },
      },
      ['export function welcome(name: string) {', '  return `hello ${name}`;', '}'].join('\n'),
    );

    expect(updatedTree.rootNode.type).toBe('program');
    await expect(engine.getContent(sampleFilePath)).resolves.toContain('welcome');
  });
});
