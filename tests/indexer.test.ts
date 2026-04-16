import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { simpleGit } from 'simple-git';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { getRepoCacheDir } from '../src/cache/disk-cache.js';
import { RepositoryIndexer } from '../src/indexer.js';

describe('RepositoryIndexer', () => {
  let tempDir: string;
  let repoPath: string;
  let indexer: RepositoryIndexer;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-repo-'));
    repoPath = path.join(tempDir, 'repo');
    await fs.mkdir(path.join(repoPath, 'src'), { recursive: true });
    await fs.writeFile(
      path.join(repoPath, 'src', 'index.js'),
      [
        'export function add(a, b) { return a + b; }',
        'export class Calculator { multiply(x, y) { return x * y; } }',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(repoPath, 'src', 'utils.ts'),
      [
        "import { add } from './index';",
        'export const subtract = (a: number, b: number): number => a - b;',
      ].join('\n'),
    );
    await fs.writeFile(
      path.join(repoPath, 'src', 'schema.sql'),
      [
        'CREATE TABLE Users (Id INT PRIMARY KEY, Email NVARCHAR(255));',
        'CREATE VIEW UserView AS SELECT * FROM Users;',
        'CREATE TRIGGER UsersAuditTrigger AFTER INSERT ON Users BEGIN SELECT 1; END;',
        'CREATE INDEX IX_Users_Email ON Users (Email);',
      ].join('\n'),
    );

    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    await git.add('.');
    await git.commit('Initial commit');
  });

  beforeEach(() => {
    indexer = new RepositoryIndexer();
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('indexeert een repository en vult memory cache', async () => {
    const index = await indexer.indexRepository(repoPath);

    expect(index.files.length).toBe(3);
    expect(indexer.getCachedIndex(repoPath)?.repositoryPath).toBe(repoPath);
  });

  it('zoekt functies, classes, imports, SQL triggers en indexes', async () => {
    await indexer.indexRepository(repoPath);

    expect(indexer.searchFunctions(repoPath, 'add')).toHaveLength(1);
    expect(indexer.searchClasses(repoPath, 'Calculator')).toHaveLength(1);
    expect(indexer.searchImports(repoPath, './index')).toHaveLength(1);
    expect(indexer.searchSqlTriggers(repoPath, 'UsersAuditTrigger')).toHaveLength(1);
    expect(indexer.searchSqlIndexes(repoPath, 'IX_Users_Email')).toHaveLength(1);
  });

  it('geeft statistieken inclusief SQL trigger en index totalen', async () => {
    await indexer.indexRepository(repoPath);

    const statistics = indexer.getStatistics(repoPath);

    expect(statistics.filesIndexed).toBe(3);
    expect(statistics.totalSqlTables).toBe(1);
    expect(statistics.totalSqlViews).toBe(1);
    expect(statistics.totalSqlTriggers).toBe(1);
    expect(statistics.totalSqlIndexes).toBe(1);
  });

  it('schrijft disk cache en kan die weer wissen', async () => {
    await indexer.indexRepository(repoPath);

    expect(await indexer.hasDiskCache(repoPath)).toBe(true);
    expect(getRepoCacheDir(repoPath)).toContain('.ast-indexer');

    await indexer.clearCache(repoPath);

    expect(indexer.getCachedIndex(repoPath)).toBeUndefined();
    await expect(fs.access(getRepoCacheDir(repoPath))).rejects.toThrow();
  });
});
