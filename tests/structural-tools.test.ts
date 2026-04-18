import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { simpleGit } from 'simple-git';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RepositoryIndexer } from '../src/indexer.js';
import {
  detectTodos,
  findEnclosingSymbol,
  findSimilarNodes,
  getExpandedSelection,
  getScopeAtPosition,
  structuralSearch,
} from '../src/structural-tools.js';
import { TreeSitterEngine } from '../src/tree-sitter-engine.js';

async function isTreeSitterAvailable(): Promise<boolean> {
  try {
    await import('tree-sitter');
    return true;
  } catch {
    return false;
  }
}

describe('structural-tools', () => {
  let tempDir: string;
  let repoPath: string;
  let indexer: RepositoryIndexer;
  let engine: TreeSitterEngine;
  let treeSitterAvailable: boolean;

  beforeAll(async () => {
    treeSitterAvailable = await isTreeSitterAvailable();
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-structural-tools-'));
    repoPath = path.join(tempDir, 'repo');
    await fs.mkdir(path.join(repoPath, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, 'src', 'math.ts'),
      [
        '// TODO: improve validation',
        'export const add = (a: number, b: number) => a + b;',
        'export const sum = (left: number, right: number) => left + right;',
        'export function wrap(value: number) {',
        '  const doubled = value * 2;',
        '  return doubled;',
        '}',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(repoPath, 'src', 'consumer.ts'),
      ["import { add } from './math';", 'export const value = add(1, 2);'].join('\n'),
    );

    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    await git.add('.');
    await git.commit('Initial commit');

    indexer = new RepositoryIndexer();
    engine = new TreeSitterEngine();
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('voert structural search uit over een geindexeerde repository', async () => {
    const repositoryIndex = await indexer.indexRepository(repoPath);
    if (!treeSitterAvailable) {
      await expect(
        structuralSearch(engine, repositoryIndex, '(arrow_function) @fn', 'typescript', 'math.ts'),
      ).rejects.toThrow('Tree-sitter runtime');
      return;
    }

    const result = await structuralSearch(
      engine,
      repositoryIndex,
      '(arrow_function) @fn',
      'typescript',
      'math.ts',
    );

    expect(result.count).toBeGreaterThanOrEqual(2);
  });

  it('vindt scope, enclosing symbol en vergelijkbare nodes', async () => {
    const repositoryIndex = await indexer.indexRepository(repoPath);
    const mathFilePath = path.join(repoPath, 'src', 'math.ts');
    if (!treeSitterAvailable) {
      await expect(getScopeAtPosition(engine, mathFilePath, 5, 10)).rejects.toThrow(
        'Tree-sitter runtime',
      );
      return;
    }

    const scope = await getScopeAtPosition(engine, mathFilePath, 5, 10);
    const enclosingSymbol = await findEnclosingSymbol(engine, mathFilePath, 5, 10);
    const similarNodes = await findSimilarNodes(engine, repositoryIndex, mathFilePath, 2, 20);

    expect(scope.scopes.length).toBeGreaterThan(0);
    expect(enclosingSymbol.symbol?.name).toBe('wrap');
    expect(similarNodes.count).toBeGreaterThanOrEqual(2);
  });

  it('detecteert TODO comments en vergroot een selectie', async () => {
    const repositoryIndex = await indexer.indexRepository(repoPath);
    const mathFilePath = path.join(repoPath, 'src', 'math.ts');
    if (!treeSitterAvailable) {
      await expect(detectTodos(engine, repositoryIndex, 'math.ts')).rejects.toThrow(
        'Tree-sitter runtime',
      );
      return;
    }

    const todos = await detectTodos(engine, repositoryIndex, 'math.ts');
    const expandedSelection = await getExpandedSelection(engine, mathFilePath, 5, 19, 5, 27);

    expect(todos.count).toBe(1);
    expect(expandedSelection.expanded.type).toContain('binary_expression');
  });
});
