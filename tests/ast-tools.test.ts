import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import {
  getAst,
  getAstNodeAtPosition,
  getAstNodeRelatives,
  getDocumentSymbols,
  getFoldingRanges,
  getHighlightCaptures,
  getSyntaxErrors,
} from '../src/ast-tools.js';
import { TreeSitterEngine } from '../src/tree-sitter-engine.js';

async function isTreeSitterAvailable(): Promise<boolean> {
  try {
    await import('tree-sitter');
    return true;
  } catch {
    return false;
  }
}

describe('ast-tools', () => {
  let tempDir: string;
  let validFilePath: string;
  let invalidFilePath: string;
  let engine: TreeSitterEngine;
  let treeSitterAvailable: boolean;

  beforeAll(async () => {
    treeSitterAvailable = await isTreeSitterAvailable();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-ast-tools-'));
    validFilePath = path.join(tempDir, 'sample.ts');
    invalidFilePath = path.join(tempDir, 'broken.js');
    engine = new TreeSitterEngine();

    await fs.writeFile(
      validFilePath,
      [
        'export class Greeter {',
        '  greet(name: string) {',
        '    return `hello ${name}`;',
        '  }',
        '}',
        '',
        'export function wave(name: string) {',
        '  return name.toUpperCase();',
        '}',
      ].join('\n'),
    );

    await fs.writeFile(invalidFilePath, ['function broken( {', '  return true;', '}'].join('\n'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('serialiseert de syntaxboom', async () => {
    if (!treeSitterAvailable) {
      await expect(getAst(engine, validFilePath, 2, true)).rejects.toThrow('Tree-sitter runtime');
      return;
    }

    const result = await getAst(engine, validFilePath, 2, true);

    expect(result.tree.type).toBe('program');
    expect(result.tree.children.length).toBeGreaterThan(0);
  });

  it('zoekt een node en relatives op positie', async () => {
    if (!treeSitterAvailable) {
      await expect(getAstNodeAtPosition(engine, validFilePath, 2, 4)).rejects.toThrow(
        'Tree-sitter runtime',
      );
      return;
    }

    const nodeAtPosition = await getAstNodeAtPosition(engine, validFilePath, 2, 4);
    const relatives = await getAstNodeRelatives(engine, validFilePath, 2, 4, {
      includeParent: true,
      includeSiblings: true,
    });

    // L2:C4 is op de identifier 'greet' → property_identifier
    // De parent-keten bevat method_definition
    expect(nodeAtPosition.node.type).toBe('property_identifier');
    expect(nodeAtPosition.parents.some((p) => p.type.includes('method'))).toBe(true);
    expect(nodeAtPosition.parents.length).toBeGreaterThan(0);
    expect(relatives.parent).not.toBeNull();
  });

  it('vindt syntax errors in ongeldig JavaScript', async () => {
    if (!treeSitterAvailable) {
      await expect(getSyntaxErrors(engine, invalidFilePath)).rejects.toThrow('Tree-sitter runtime');
      return;
    }

    const result = await getSyntaxErrors(engine, invalidFilePath);

    expect(result.count).toBeGreaterThan(0);
  });

  it('voert highlight captures uit', async () => {
    if (!treeSitterAvailable) {
      await expect(
        getHighlightCaptures(
          engine,
          validFilePath,
          '(function_declaration name: (identifier) @name)',
        ),
      ).rejects.toThrow('Tree-sitter runtime');
      return;
    }

    const result = await getHighlightCaptures(
      engine,
      validFilePath,
      '(function_declaration name: (identifier) @name)',
    );

    expect(result.count).toBe(1);
    expect(result.captures[0]?.captureName).toBe('name');
  });

  it('bepaalt folding ranges en document symbols', async () => {
    if (!treeSitterAvailable) {
      await expect(getFoldingRanges(engine, validFilePath)).rejects.toThrow('Tree-sitter runtime');
      return;
    }

    const foldingRanges = await getFoldingRanges(engine, validFilePath);
    const documentSymbols = await getDocumentSymbols(engine, validFilePath);

    expect(foldingRanges.count).toBeGreaterThan(0);
    expect(documentSymbols.symbols.map((item) => item.name)).toEqual(
      expect.arrayContaining(['Greeter', 'wave']),
    );
  });
});
