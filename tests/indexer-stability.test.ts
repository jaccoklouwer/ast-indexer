import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { simpleGit } from 'simple-git';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FileIndex } from '../src/schemas.js';

const scanDirectoryMock = vi.fn();
const parseFileMock = vi.fn();
const readDiskCacheMock = vi.fn();
const writeDiskCacheMock = vi.fn();
const cleanupOldEntriesMock = vi.fn();

vi.mock('../src/parser.js', () => ({
  parseFile: parseFileMock,
  scanDirectory: scanDirectoryMock,
}));

vi.mock('../src/cache.js', () => ({
  readDiskCache: readDiskCacheMock,
  writeDiskCache: writeDiskCacheMock,
  cleanupOldEntries: cleanupOldEntriesMock,
}));

let RepositoryIndexerClass: typeof import('../src/indexer.js').RepositoryIndexer;
let tempDir: string;
let repoPath: string;

function createIndexedFile(filePath: string): FileIndex {
  return {
    path: filePath,
    functions: [],
    classes: [],
    imports: [],
    variables: [],
    exports: [],
    language: 'typescript',
  };
}

describe('RepositoryIndexer stability guardrails', () => {
  beforeAll(async () => {
    ({ RepositoryIndexer: RepositoryIndexerClass } = await import('../src/indexer.js'));

    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-stability-test-'));
    repoPath = path.join(tempDir, 'guardrail-repo');
    await fs.mkdir(repoPath);

    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');

    await fs.writeFile(path.join(repoPath, 'README.md'), '# test');
    await git.add('.');
    await git.commit('Initial commit');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  beforeEach(() => {
    readDiskCacheMock.mockResolvedValue(null);
    writeDiskCacheMock.mockResolvedValue(undefined);
    cleanupOldEntriesMock.mockResolvedValue(undefined);
    scanDirectoryMock.mockResolvedValue([]);
    parseFileMock.mockReset();
    readDiskCacheMock.mockClear();
    writeDiskCacheMock.mockClear();
    cleanupOldEntriesMock.mockClear();
    scanDirectoryMock.mockClear();
  });

  afterEach(() => {
    vi.resetAllMocks();
    delete process.env.AST_INDEXER_CONCURRENCY;
    delete process.env.AST_INDEXER_MAX_FILES;
    delete process.env.AST_INDEXER_MAX_PARSE_FAILURES;
  });

  it('fails fast when a repository exceeds the configured file limit', async () => {
    process.env.AST_INDEXER_MAX_FILES = '2';
    scanDirectoryMock.mockResolvedValue([
      path.join(repoPath, 'src', 'a.ts'),
      path.join(repoPath, 'src', 'b.ts'),
      path.join(repoPath, 'src', 'c.ts'),
    ]);

    const indexer = new RepositoryIndexerClass();

    await expect(indexer.indexRepository(repoPath)).rejects.toThrow(/Limiet is 2/);
    expect(parseFileMock).not.toHaveBeenCalled();
  });

  it('aborts indexing when too many files fail to parse', async () => {
    process.env.AST_INDEXER_CONCURRENCY = '1';
    process.env.AST_INDEXER_MAX_PARSE_FAILURES = '2';
    scanDirectoryMock.mockResolvedValue([
      path.join(repoPath, 'src', 'a.ts'),
      path.join(repoPath, 'src', 'b.ts'),
      path.join(repoPath, 'src', 'c.ts'),
    ]);
    parseFileMock.mockRejectedValue(new Error('kapotte syntax'));

    const indexer = new RepositoryIndexerClass();

    await expect(indexer.indexRepository(repoPath)).rejects.toThrow(/Te veel parse-fouten/);
    expect(parseFileMock).toHaveBeenCalledTimes(2);
    expect(writeDiskCacheMock).not.toHaveBeenCalled();
  });

  it('keeps indexing successful when cache writing fails', async () => {
    const indexedFilePath = path.join(repoPath, 'src', 'safe.ts');
    scanDirectoryMock.mockResolvedValue([indexedFilePath]);
    parseFileMock.mockResolvedValue(createIndexedFile(indexedFilePath));
    writeDiskCacheMock.mockRejectedValue(new Error('disk full'));

    const indexer = new RepositoryIndexerClass();
    const result = await indexer.indexRepository(repoPath);

    expect(result.files).toHaveLength(1);
    expect(result.files[0]?.path).toBe(indexedFilePath);
    expect(writeDiskCacheMock).toHaveBeenCalledTimes(1);
    expect(cleanupOldEntriesMock).toHaveBeenCalledTimes(1);
  });
});
