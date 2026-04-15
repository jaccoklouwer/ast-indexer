import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { RepositoryIndexer } from '../src/indexer.js';

describe('RepositoryIndexer', () => {
  let tempDir: string;
  let indexer: RepositoryIndexer;
  let repoPath: string;
  let consoleErrorSpy: ReturnType<typeof vi.spyOn>;

  beforeAll(async () => {
    // Create temporary directory
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-repo-test-'));
    repoPath = path.join(tempDir, 'test-repo');
    await fs.mkdir(repoPath);

    // Initialize git repository
    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    // Create test files
    const srcDir = path.join(repoPath, 'src');
    await fs.mkdir(srcDir);

    await fs.writeFile(
      path.join(srcDir, 'index.js'),
      `
        export function add(a, b) {
          return a + b;
        }

        export class Calculator {
          multiply(x, y) {
            return x * y;
          }
        }
      `,
    );

    await fs.writeFile(
      path.join(srcDir, 'utils.ts'),
      `
        import { add } from './index';

        export const subtract = (a: number, b: number): number => {
          return a - b;
        };

        export class MathUtils {
          static square(n: number): number {
            return n * n;
          }
        }
      `,
    );

    // Commit files
    await git.add('.');
    await git.commit('Initial commit');
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    indexer = new RepositoryIndexer();
  });

  afterEach(() => {
    consoleErrorSpy.mockRestore();
  });

  describe('isGitRepository', () => {
    it('should return true for valid git repository', async () => {
      const result = await indexer.isGitRepository(repoPath);
      expect(result).toBe(true);
    });

    it('should return false for non-git directory', async () => {
      const nonGitDir = path.join(tempDir, 'not-a-repo');
      await fs.mkdir(nonGitDir, { recursive: true });

      const result = await indexer.isGitRepository(nonGitDir);
      expect(result).toBe(false);
    });
  });

  describe('indexRepository', () => {
    it('should index a git repository successfully', async () => {
      const index = await indexer.indexRepository(repoPath);

      expect(index.repositoryPath).toBe(repoPath);
      expect(index.files.length).toBeGreaterThan(0);
      expect(index.indexedAt).toBeDefined();

      // Verify files are indexed
      const indexFile = index.files.find((f) => f.path.includes('index.js'));
      expect(indexFile).toBeDefined();
      expect(indexFile?.functions.length).toBeGreaterThan(0);
      expect(indexFile?.classes.length).toBeGreaterThan(0);
    });

    it('should throw error for non-git directory', async () => {
      const nonGitDir = path.join(tempDir, 'not-a-repo-2');
      await fs.mkdir(nonGitDir, { recursive: true });

      await expect(indexer.indexRepository(nonGitDir)).rejects.toThrow();
    });

    it('should cache indexed repository', async () => {
      await indexer.indexRepository(repoPath);
      const cached = indexer.getCachedIndex(repoPath);

      expect(cached).toBeDefined();
      expect(cached?.repositoryPath).toBe(repoPath);
    });

    it('should respect include patterns during indexing', async () => {
      const index = await indexer.indexRepository(repoPath, ['src/**/*.ts']);

      expect(index.files).toHaveLength(1);
      expect(index.files[0]?.path.endsWith(path.join('src', 'utils.ts'))).toBe(true);
    });
  });

  describe('searchFunctions', () => {
    beforeEach(async () => {
      await indexer.indexRepository(repoPath);
    });

    it('should find all functions when no filter is provided', () => {
      const results = indexer.searchFunctions(repoPath);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter functions by name', () => {
      const results = indexer.searchFunctions(repoPath, 'add');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.name.includes('add'))).toBe(true);
    });

    it('should filter functions by file name', () => {
      const results = indexer.searchFunctions(repoPath, undefined, 'index');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.fullPath.includes('index'))).toBe(true);
    });

    it('should throw error for non-indexed repository', () => {
      const nonIndexed = path.join(tempDir, 'non-indexed');
      expect(() => indexer.searchFunctions(nonIndexed)).toThrow();
    });
  });

  describe('searchClasses', () => {
    beforeEach(async () => {
      await indexer.indexRepository(repoPath);
    });

    it('should find all classes when no filter is provided', () => {
      const results = indexer.searchClasses(repoPath);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter classes by name', () => {
      const results = indexer.searchClasses(repoPath, 'Calculator');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.name.includes('Calculator'))).toBe(true);
    });

    it('should filter classes by file name', () => {
      const results = indexer.searchClasses(repoPath, undefined, 'utils');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.fullPath.includes('utils'))).toBe(true);
    });
  });

  describe('searchImports', () => {
    beforeEach(async () => {
      await indexer.indexRepository(repoPath);
    });

    it('should find all imports when no filter is provided', () => {
      const results = indexer.searchImports(repoPath);
      expect(results.length).toBeGreaterThan(0);
    });

    it('should filter imports by module name', () => {
      const results = indexer.searchImports(repoPath, './index');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.source.includes('./index'))).toBe(true);
    });

    it('should filter imports by file name', () => {
      const results = indexer.searchImports(repoPath, undefined, 'utils');
      expect(results.length).toBeGreaterThan(0);
      expect(results.every((r) => r.fullPath.includes('utils'))).toBe(true);
    });
  });

  describe('getStatistics', () => {
    beforeEach(async () => {
      await indexer.indexRepository(repoPath);
    });

    it('should return statistics for indexed repository', () => {
      const stats = indexer.getStatistics(repoPath);

      expect(stats).toBeDefined();
      expect(stats.filesIndexed).toBeGreaterThan(0);
      expect(stats.totalFunctions).toBeGreaterThanOrEqual(0);
      expect(stats.totalClasses).toBeGreaterThanOrEqual(0);
      expect(stats.totalImports).toBeGreaterThanOrEqual(0);
      expect(stats.totalVariables).toBeGreaterThanOrEqual(0);
      expect(stats.indexedAt).toBeDefined();
    });

    it('should throw error for non-indexed repository', () => {
      const nonIndexed = path.join(tempDir, 'non-indexed-2');
      expect(() => indexer.getStatistics(nonIndexed)).toThrow();
    });
  });

  describe('getCachedIndex', () => {
    it('should return undefined for non-cached repository', () => {
      const cached = indexer.getCachedIndex('/non/existent/path');
      expect(cached).toBeUndefined();
    });

    it('should return cached index after indexing', async () => {
      await indexer.indexRepository(repoPath);
      const cached = indexer.getCachedIndex(repoPath);

      expect(cached).toBeDefined();
      expect(cached?.repositoryPath).toBe(repoPath);
    });
  });
});
