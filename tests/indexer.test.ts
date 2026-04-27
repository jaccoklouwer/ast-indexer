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

  it('zoekt cross-file references voor een symbool', async () => {
    await indexer.indexRepository(repoPath);

    const addReferences = indexer.getCrossFileReferences(repoPath, 'add');
    const subtractReferences = indexer.getCrossFileReferences(repoPath, 'subtract');
    const subtractExportReference = subtractReferences.find((item) => item.kind === 'export');

    expect(addReferences.some((item) => item.kind === 'definition')).toBe(true);
    expect(addReferences.some((item) => item.kind === 'import')).toBe(true);
    expect(addReferences.some((item) => item.kind === 'export')).toBe(true);
    expect(subtractExportReference?.line).toBe(2);
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

  describe('getFileStatus', () => {
    let statusRepoPath: string;
    let cleanFilePath: string;
    let modifyFilePath: string;
    let stageFilePath: string;

    beforeAll(async () => {
      statusRepoPath = path.join(tempDir, 'status-repo');
      await fs.mkdir(path.join(statusRepoPath, 'src'), { recursive: true });
      cleanFilePath = path.join(statusRepoPath, 'src', 'clean.ts');
      modifyFilePath = path.join(statusRepoPath, 'src', 'modify.ts');
      stageFilePath = path.join(statusRepoPath, 'src', 'stage.ts');

      await fs.writeFile(cleanFilePath, 'export const clean = true;\n');
      await fs.writeFile(modifyFilePath, 'export const x = 1;\n');
      await fs.writeFile(stageFilePath, 'export const s = 1;\n');

      const git = simpleGit(statusRepoPath);
      await git.init();
      await git.addConfig('user.name', 'Test User');
      await git.addConfig('user.email', 'test@example.com');
      await git.addConfig('core.autocrlf', 'false');
      await git.add('.');
      await git.commit('Initial commit');
    });

    it('geeft clean terug voor een gecommit ongewijzigd bestand', async () => {
      const result = await indexer.getFileStatus(statusRepoPath, cleanFilePath);

      expect(result.status).toBe('clean');
      expect(result.modified).toBe(false);
      expect(result.filePath).toBe(cleanFilePath);
      expect(result.repositoryPath).toBe(statusRepoPath);
    });

    it('geeft modified terug voor een unstaged gewijzigd bestand', async () => {
      await fs.writeFile(modifyFilePath, 'export const x = 2;\n');

      const result = await indexer.getFileStatus(statusRepoPath, modifyFilePath);

      expect(result.status).toBe('modified');
      expect(result.modified).toBe(true);

      await simpleGit(statusRepoPath).raw(['checkout', '--', modifyFilePath]);
    });

    it('geeft staged terug voor een gestagede wijziging', async () => {
      const git = simpleGit(statusRepoPath);
      await fs.writeFile(stageFilePath, 'export const s = 2;\n');
      await git.add(stageFilePath);

      const result = await indexer.getFileStatus(statusRepoPath, stageFilePath);

      expect(result.status).toBe('staged');
      expect(result.modified).toBe(true);

      await git.raw(['restore', '--staged', '--', stageFilePath]);
      await git.raw(['checkout', '--', stageFilePath]);
    });

    it('geeft untracked terug voor een nieuw bestand buiten de index', async () => {
      const untrackedPath = path.join(statusRepoPath, 'src', 'untracked.ts');
      await fs.writeFile(untrackedPath, 'export const y = 99;\n');

      const result = await indexer.getFileStatus(statusRepoPath, untrackedPath);

      expect(result.status).toBe('untracked');
      expect(result.modified).toBe(true);

      await fs.unlink(untrackedPath);
    });

    it('geeft deleted terug voor een verwijderd getrackt bestand', async () => {
      const toDeletePath = path.join(statusRepoPath, 'src', 'todelete.ts');
      await fs.writeFile(toDeletePath, 'export const z = 0;\n');
      const git = simpleGit(statusRepoPath);
      await git.add(toDeletePath);
      await git.commit('voeg todelete toe');
      await fs.unlink(toDeletePath);

      const result = await indexer.getFileStatus(statusRepoPath, toDeletePath);

      expect(result.status).toBe('deleted');
      expect(result.modified).toBe(true);

      await git.raw(['restore', toDeletePath]);
      await git.rm([toDeletePath]);
      await git.commit('verwijder todelete');
    });

    it('gooit een fout voor een pad dat niet bestaat en niet in Git zit', async () => {
      const missingPath = path.join(statusRepoPath, 'src', 'does-not-exist.ts');

      await expect(indexer.getFileStatus(statusRepoPath, missingPath)).rejects.toThrow(
        'Bestand niet gevonden',
      );
    });

    it('herindexeert de repository automatisch voor de statusbepaling', async () => {
      const newFilePath = path.join(statusRepoPath, 'src', 'fresh.ts');
      await fs.writeFile(newFilePath, 'export const fresh = true;\n');

      await indexer.getFileStatus(statusRepoPath, newFilePath);

      const cached = indexer.getCachedIndex(statusRepoPath);
      expect(cached).toBeDefined();
      expect(indexer.searchFunctions(statusRepoPath)).toBeDefined();

      await fs.unlink(newFilePath);
    });
  });
});
