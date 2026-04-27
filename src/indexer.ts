import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import { simpleGit, type SimpleGit } from 'simple-git';
import { CacheManager } from './cache/cache-manager.js';
import { getRepoCacheDir } from './cache/disk-cache.js';
import { parseFile, scanDirectory } from './parser.js';
import type {
  ClassInfo,
  FileIndex,
  FunctionInfo,
  GitFileStatus,
  ImportInfo,
  RepositoryIndex,
  SqlIndexInfo,
  SqlTableInfo,
  SqlTriggerInfo,
  SqlViewInfo,
} from './schemas.js';

const BATCH_SIZE = 10;

export interface FileStatusResult {
  repositoryPath: string;
  filePath: string;
  status: GitFileStatus;
  modified: boolean;
}

function parseGitPorcelainStatus(porcelainOutput: string): GitFileStatus {
  const line = porcelainOutput.trimEnd();
  if (!line) {
    return 'clean';
  }

  const x = line[0] ?? ' ';
  const y = line[1] ?? ' ';

  if (x === '?' && y === '?') {
    return 'untracked';
  }

  if (x === 'R' || y === 'R') {
    return 'renamed';
  }

  if (x === 'D' || y === 'D') {
    return 'deleted';
  }

  if (x !== ' ') {
    return 'staged';
  }

  return 'modified';
}

interface Statistics {
  filesIndexed: number;
  totalFunctions: number;
  totalClasses: number;
  totalImports: number;
  totalVariables: number;
  totalSqlTables: number;
  totalSqlViews: number;
  totalSqlTriggers: number;
  totalSqlIndexes: number;
  filesByLanguage: Record<string, number>;
  indexedAt: string;
}

function applyMatch(value: string, query: string | undefined, caseInsensitive?: boolean): boolean {
  if (!query) {
    return true;
  }

  return caseInsensitive
    ? value.toLowerCase().includes(query.toLowerCase())
    : value.includes(query);
}

async function pathExists(targetPath: string): Promise<boolean> {
  try {
    await fs.access(targetPath);
    return true;
  } catch {
    return false;
  }
}

export class RepositoryIndexer {
  private readonly git: SimpleGit;
  private readonly cache = new Map<string, RepositoryIndex>();
  private readonly cacheManager = new CacheManager();

  constructor() {
    this.git = simpleGit();
  }

  async isGitRepository(repositoryPath: string): Promise<boolean> {
    try {
      await simpleGit(repositoryPath).status();
      return true;
    } catch {
      return false;
    }
  }

  async indexRepository(
    repositoryPath: string,
    includePatterns?: string[],
    excludePatterns?: string[],
  ): Promise<RepositoryIndex> {
    if (!(await this.isGitRepository(repositoryPath))) {
      throw new Error(`${repositoryPath} is geen geldige Git repository`);
    }

    const git = simpleGit(repositoryPath);
    const filePaths = await scanDirectory(repositoryPath, includePatterns, excludePatterns);
    const files: FileIndex[] = [];

    for (let index = 0; index < filePaths.length; index += BATCH_SIZE) {
      const batch = filePaths.slice(index, index + BATCH_SIZE);
      const batchResults = await Promise.all(
        batch.map(async (filePath) => {
          try {
            const cacheKey = await this.resolveFileCacheKey(git, repositoryPath, filePath);
            return await this.cacheManager.getOrParse(
              repositoryPath,
              filePath,
              cacheKey,
              async () => parseFile(filePath),
            );
          } catch (error) {
            console.error(`[AST-Indexer] Fout bij indexeren van ${filePath}:`, error);
            return null;
          }
        }),
      );
      files.push(...(batchResults.filter((r) => r !== null) as FileIndex[]));
    }

    const repositoryIndex: RepositoryIndex = {
      repositoryPath,
      files,
      indexedAt: new Date().toISOString(),
    };

    this.cache.set(repositoryPath, repositoryIndex);
    return repositoryIndex;
  }

  private async resolveFileCacheKey(
    git: SimpleGit,
    repositoryPath: string,
    filePath: string,
  ): Promise<string> {
    const relativePath = path.relative(repositoryPath, filePath);
    try {
      const status = (await git.raw(['status', '--porcelain', '--', relativePath])).trim();
      if (status.length > 0) {
        const stats = await fs.stat(filePath);
        return `mtime:${stats.mtimeMs}`;
      }

      const commitHash = (await git.raw(['log', '-1', '--format=%H', '--', relativePath])).trim();
      if (commitHash.length > 0) {
        return `git:${commitHash}`;
      }
    } catch {
      // Fall through to mtime cache key.
    }

    const stats = await fs.stat(filePath);
    return `mtime:${stats.mtimeMs}`;
  }

  getCachedIndex(repositoryPath: string): RepositoryIndex | undefined {
    return this.cache.get(repositoryPath);
  }

  getRequiredIndex(repositoryPath: string): RepositoryIndex {
    const index = this.cache.get(repositoryPath);
    if (!index) {
      throw new Error(`Repository ${repositoryPath} is niet geïndexeerd`);
    }

    return index;
  }

  searchFunctions(
    repositoryPath: string,
    functionName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<FunctionInfo & { fullPath: string }> {
    const index = this.getRequiredIndex(repositoryPath);
    return index.files.flatMap((file) =>
      applyMatch(file.path, fileName, caseInsensitive)
        ? file.functions
            .filter((item) => applyMatch(item.name, functionName, caseInsensitive))
            .map((item) => ({ ...item, fullPath: file.path }))
        : [],
    );
  }

  searchClasses(
    repositoryPath: string,
    className?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<ClassInfo & { fullPath: string }> {
    const index = this.getRequiredIndex(repositoryPath);
    return index.files.flatMap((file) =>
      applyMatch(file.path, fileName, caseInsensitive)
        ? file.classes
            .filter((item) => applyMatch(item.name, className, caseInsensitive))
            .map((item) => ({ ...item, fullPath: file.path }))
        : [],
    );
  }

  searchImports(
    repositoryPath: string,
    moduleName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<ImportInfo & { fullPath: string }> {
    const index = this.getRequiredIndex(repositoryPath);
    return index.files.flatMap((file) =>
      applyMatch(file.path, fileName, caseInsensitive)
        ? file.imports
            .filter((item) => applyMatch(item.source, moduleName, caseInsensitive))
            .map((item) => ({ ...item, fullPath: file.path }))
        : [],
    );
  }

  searchSqlTables(
    repositoryPath: string,
    tableName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<SqlTableInfo & { fullPath: string }> {
    const index = this.getRequiredIndex(repositoryPath);
    return index.files.flatMap((file) =>
      applyMatch(file.path, fileName, caseInsensitive)
        ? (file.sqlTables ?? [])
            .filter((item) => applyMatch(item.name, tableName, caseInsensitive))
            .map((item) => ({ ...item, fullPath: file.path }))
        : [],
    );
  }

  searchSqlViews(
    repositoryPath: string,
    viewName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<SqlViewInfo & { fullPath: string }> {
    const index = this.getRequiredIndex(repositoryPath);
    return index.files.flatMap((file) =>
      applyMatch(file.path, fileName, caseInsensitive)
        ? (file.sqlViews ?? [])
            .filter((item) => applyMatch(item.name, viewName, caseInsensitive))
            .map((item) => ({ ...item, fullPath: file.path }))
        : [],
    );
  }

  searchSqlTriggers(
    repositoryPath: string,
    triggerName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<SqlTriggerInfo & { fullPath: string }> {
    const index = this.getRequiredIndex(repositoryPath);
    return index.files.flatMap((file) =>
      applyMatch(file.path, fileName, caseInsensitive)
        ? (file.sqlTriggers ?? [])
            .filter((item) => applyMatch(item.name, triggerName, caseInsensitive))
            .map((item) => ({ ...item, fullPath: file.path }))
        : [],
    );
  }

  searchSqlIndexes(
    repositoryPath: string,
    indexName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<SqlIndexInfo & { fullPath: string }> {
    const index = this.getRequiredIndex(repositoryPath);
    return index.files.flatMap((file) =>
      applyMatch(file.path, fileName, caseInsensitive)
        ? (file.sqlIndexes ?? [])
            .filter((item) => applyMatch(item.name, indexName, caseInsensitive))
            .map((item) => ({ ...item, fullPath: file.path }))
        : [],
    );
  }

  getCrossFileReferences(
    repositoryPath: string,
    symbolName: string,
    caseInsensitive?: boolean,
  ): Array<{ filePath: string; kind: 'import' | 'export' | 'definition'; line: number }> {
    const index = this.getRequiredIndex(repositoryPath);
    const results: Array<{
      filePath: string;
      kind: 'import' | 'export' | 'definition';
      line: number;
    }> = [];

    for (const file of index.files) {
      for (const item of file.imports) {
        if (
          item.imported.some((importName) => applyMatch(importName, symbolName, caseInsensitive)) ||
          applyMatch(item.source, symbolName, caseInsensitive)
        ) {
          results.push({
            filePath: file.path,
            kind: 'import',
            line: item.line,
          });
        }
      }

      const exportEntries = file.exportDetails ?? file.exports.map((name) => ({ name, line: 1 }));
      for (const exportedSymbol of exportEntries) {
        if (applyMatch(exportedSymbol.name, symbolName, caseInsensitive)) {
          results.push({
            filePath: file.path,
            kind: 'export',
            line: exportedSymbol.line,
          });
        }
      }

      for (const fn of file.functions) {
        if (applyMatch(fn.name, symbolName, caseInsensitive)) {
          results.push({
            filePath: file.path,
            kind: 'definition',
            line: fn.startLine,
          });
        }
      }

      for (const cls of file.classes) {
        if (applyMatch(cls.name, symbolName, caseInsensitive)) {
          results.push({
            filePath: file.path,
            kind: 'definition',
            line: cls.startLine,
          });
        }
      }
    }

    return results;
  }

  getStatistics(repositoryPath: string): Statistics {
    const index = this.getRequiredIndex(repositoryPath);
    const filesByLanguage: Record<string, number> = {};
    let totalFunctions = 0;
    let totalClasses = 0;
    let totalImports = 0;
    let totalVariables = 0;
    let totalSqlTables = 0;
    let totalSqlViews = 0;
    let totalSqlTriggers = 0;
    let totalSqlIndexes = 0;

    for (const file of index.files) {
      totalFunctions += file.functions.length;
      totalClasses += file.classes.length;
      totalImports += file.imports.length;
      totalVariables += file.variables.length;
      totalSqlTables += file.sqlTables?.length ?? 0;
      totalSqlViews += file.sqlViews?.length ?? 0;
      totalSqlTriggers += file.sqlTriggers?.length ?? 0;
      totalSqlIndexes += file.sqlIndexes?.length ?? 0;
      const language = file.language ?? 'unknown';
      filesByLanguage[language] = (filesByLanguage[language] ?? 0) + 1;
    }

    return {
      filesIndexed: index.files.length,
      totalFunctions,
      totalClasses,
      totalImports,
      totalVariables,
      totalSqlTables,
      totalSqlViews,
      totalSqlTriggers,
      totalSqlIndexes,
      filesByLanguage,
      indexedAt: index.indexedAt,
    };
  }

  async clearCache(repositoryPath?: string): Promise<void> {
    if (repositoryPath) {
      this.cache.delete(repositoryPath);
      await this.cacheManager.clearRepo(repositoryPath);
      return;
    }

    this.cache.clear();
    await this.cacheManager.clearAll();
  }

  async hasDiskCache(repositoryPath: string): Promise<boolean> {
    return pathExists(getRepoCacheDir(repositoryPath));
  }

  async getFileStatus(repositoryPath: string, filePath: string): Promise<FileStatusResult> {
    if (!(await this.isGitRepository(repositoryPath))) {
      throw new Error(`${repositoryPath} is geen geldige Git repository`);
    }

    await this.indexRepository(repositoryPath);

    const git = simpleGit(repositoryPath);
    const relativePath = path.relative(repositoryPath, filePath);
    const porcelain = (await git.raw(['status', '--porcelain', '--', relativePath])).trimEnd();

    if (!porcelain) {
      const exists = await pathExists(filePath);
      if (!exists) {
        throw new Error(`Bestand niet gevonden: ${filePath}`);
      }

      return { repositoryPath, filePath, status: 'clean', modified: false };
    }

    const status = parseGitPorcelainStatus(porcelain);
    return { repositoryPath, filePath, status, modified: status !== 'clean' };
  }
}
