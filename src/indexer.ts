import * as fs from 'fs/promises';
import * as os from 'node:os';
import * as path from 'path';
import { simpleGit, SimpleGit } from 'simple-git';
import { cleanupOldEntries, readDiskCache, writeDiskCache } from './cache.js';
import { parseFile, scanDirectory } from './parser.js';
import {
  ClassInfo,
  FileIndex,
  FunctionInfo,
  ImportInfo,
  RepositoryIndex,
  SqlTableInfo,
  SqlViewInfo,
} from './schemas.js';

const DEFAULT_MAX_FILES = 10_000;
const DEFAULT_MAX_CONCURRENCY = 8;
const LARGE_REPOSITORY_FILE_COUNT = 2_000;
const VERY_LARGE_REPOSITORY_FILE_COUNT = 5_000;
const DEFAULT_MAX_PARSE_FAILURES = 25;
const DEFAULT_MAX_PARSE_FAILURE_RATE = 0.1;
const MAX_RECORDED_PARSE_ERRORS = 5;

interface IndexingGuardrails {
  concurrency: number;
  maxFiles: number;
  maxParseFailures: number;
  maxParseFailureRate: number;
}

function parsePositiveIntegerEnv(varName: string): number | undefined {
  const rawValue = process.env[varName];
  if (!rawValue) {
    return undefined;
  }

  const parsedValue = Number.parseInt(rawValue, 10);
  if (!Number.isFinite(parsedValue) || parsedValue <= 0) {
    console.error(`Ongeldige waarde voor ${varName}: ${rawValue}`);
    return undefined;
  }

  return parsedValue;
}

function resolveIndexingGuardrails(fileCount: number): IndexingGuardrails {
  const cpuCount = os.cpus()?.length ?? 4;
  const configuredConcurrency = parsePositiveIntegerEnv('AST_INDEXER_CONCURRENCY');
  const baseConcurrency = Math.min(DEFAULT_MAX_CONCURRENCY, Math.max(1, cpuCount));
  let concurrency = configuredConcurrency ?? baseConcurrency;

  if (configuredConcurrency === undefined) {
    if (fileCount >= VERY_LARGE_REPOSITORY_FILE_COUNT) {
      concurrency = Math.min(concurrency, 2);
    } else if (fileCount >= LARGE_REPOSITORY_FILE_COUNT) {
      concurrency = Math.min(concurrency, 4);
    }
  }

  return {
    concurrency: Math.max(1, concurrency),
    maxFiles: parsePositiveIntegerEnv('AST_INDEXER_MAX_FILES') ?? DEFAULT_MAX_FILES,
    maxParseFailures:
      parsePositiveIntegerEnv('AST_INDEXER_MAX_PARSE_FAILURES') ?? DEFAULT_MAX_PARSE_FAILURES,
    maxParseFailureRate: DEFAULT_MAX_PARSE_FAILURE_RATE,
  };
}

function shouldAbortForParseFailures(
  completedFiles: number,
  parseFailures: number,
  guardrails: IndexingGuardrails,
): boolean {
  if (completedFiles === 0 || parseFailures === 0) {
    return false;
  }

  const parseFailureRate = parseFailures / completedFiles;
  return (
    parseFailures >= guardrails.maxParseFailures &&
    parseFailureRate >= guardrails.maxParseFailureRate
  );
}

function formatParseFailureError(
  repositoryPath: string,
  parseFailureCount: number,
  parseErrors: string[],
  completedFiles: number,
  guardrails: IndexingGuardrails,
): Error {
  const details = parseErrors.join(' | ');
  return new Error(
    [
      `Indexeren van ${repositoryPath} afgebroken na ${completedFiles} bestanden.`,
      `Te veel parse-fouten (${parseFailureCount}; limiet ${guardrails.maxParseFailures} en ${Math.round(guardrails.maxParseFailureRate * 100)}% failure-rate).`,
      details ? `Voorbeelden: ${details}` : undefined,
    ]
      .filter(Boolean)
      .join(' '),
  );
}

/**
 * Repository Indexer voor Git repositories
 */
export class RepositoryIndexer {
  private git: SimpleGit;
  private cache: Map<string, RepositoryIndex> = new Map();

  constructor() {
    this.git = simpleGit();
  }

  /**
   * Indexeer een Git repository
   */
  async indexRepository(
    repositoryPath: string,
    includePatterns?: string[],
    excludePatterns?: string[],
  ): Promise<RepositoryIndex> {
    const startedAt = Date.now();

    // Valideer dat het een Git repository is
    const isRepo = await this.isGitRepository(repositoryPath);
    if (!isRepo) {
      throw new Error(`${repositoryPath} is geen geldige Git repository`);
    }

    // Haal de huidige HEAD commit hash op voor cache-invalidatie
    const git = simpleGit(repositoryPath);
    let commitHash: string | null = null;
    try {
      commitHash = (await git.revparse(['HEAD'])).trim();
    } catch {
      // Geen commits nog (bijv. lege repo) — cache overslaan
    }

    // Probeer schijfcache te lezen bij bekende commit hash
    if (commitHash) {
      const cached = await readDiskCache(
        repositoryPath,
        commitHash,
        includePatterns,
        excludePatterns,
      );
      if (cached) {
        this.cache.set(repositoryPath, cached);
        return cached;
      }
    }

    // Scan directory voor bestanden
    const filePaths = await scanDirectory(repositoryPath, includePatterns, excludePatterns);
    const guardrails = resolveIndexingGuardrails(filePaths.length);

    if (filePaths.length > guardrails.maxFiles) {
      throw new Error(
        `Repository bevat ${filePaths.length} parseerbare bestanden. Limiet is ${guardrails.maxFiles}. Verfijn include/exclude patterns of verhoog AST_INDEXER_MAX_FILES.`,
      );
    }

    console.error(
      `[index_repository] Start ${repositoryPath} (${filePaths.length} bestanden, concurrency ${guardrails.concurrency})`,
    );

    // Parse bestanden met concurrency (env override: AST_INDEXER_CONCURRENCY)
    const files: FileIndex[] = [];
    let i = 0;
    let completedFiles = 0;
    let parseFailureCount = 0;
    let abortedError: Error | undefined;
    const parseErrors: string[] = [];

    async function worker() {
      while (i < filePaths.length && !abortedError) {
        const idx = i++;
        const filePath = filePaths[idx];

        if (!filePath) {
          return;
        }

        try {
          const fileIndex = await parseFile(filePath);
          if (!abortedError) {
            files.push(fileIndex);
          }
        } catch (error) {
          parseFailureCount += 1;
          const message = error instanceof Error ? error.message : String(error);
          if (parseErrors.length < MAX_RECORDED_PARSE_ERRORS) {
            parseErrors.push(`${path.basename(filePath)}: ${message}`);
          }
          console.error(`Fout bij parsen van ${filePath}:`, error);
        } finally {
          completedFiles += 1;
        }

        if (
          !abortedError &&
          shouldAbortForParseFailures(completedFiles, parseFailureCount, guardrails)
        ) {
          abortedError = formatParseFailureError(
            repositoryPath,
            parseFailureCount,
            parseErrors,
            completedFiles,
            guardrails,
          );
        }
      }
    }

    const workers = Array.from({ length: guardrails.concurrency }, () => worker());
    await Promise.all(workers);

    if (abortedError) {
      throw abortedError;
    }

    const index: RepositoryIndex = {
      repositoryPath,
      files,
      indexedAt: new Date().toISOString(),
    };

    // Cache de index in memory
    this.cache.set(repositoryPath, index);

    // Schrijf naar schijfcache en ruim oude entries op
    if (commitHash) {
      try {
        await writeDiskCache(repositoryPath, commitHash, index, includePatterns, excludePatterns);
      } catch (error) {
        console.error(`[index_repository] Cache schrijven mislukt voor ${repositoryPath}:`, error);
      }

      await cleanupOldEntries(repositoryPath);
    }

    console.error(
      `[index_repository] Klaar ${repositoryPath} (${files.length} bestanden in ${Date.now() - startedAt} ms)`,
    );

    return index;
  }

  /**
   * Check of een pad een Git repository is
   */
  async isGitRepository(repositoryPath: string): Promise<boolean> {
    try {
      const git = simpleGit(repositoryPath);
      await git.status();
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Haal gecachede repository index op
   */
  getCachedIndex(repositoryPath: string): RepositoryIndex | undefined {
    return this.cache.get(repositoryPath);
  }

  /**
   * Zoek functies in een geïndexeerde repository
   */
  searchFunctions(
    repositoryPath: string,
    functionName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<FunctionInfo & { fullPath: string }> {
    const index = this.cache.get(repositoryPath);
    if (!index) {
      throw new Error(`Repository ${repositoryPath} is niet geïndexeerd`);
    }

    const results: Array<FunctionInfo & { fullPath: string }> = [];

    for (const file of index.files) {
      // Filter op bestandsnaam indien opgegeven
      if (fileName) {
        const hay = caseInsensitive ? file.path.toLowerCase() : file.path;
        const needle = caseInsensitive ? fileName.toLowerCase() : fileName;
        if (!hay.includes(needle)) {
          continue;
        }
      }

      for (const func of file.functions) {
        // Filter op functienaam indien opgegeven
        if (functionName) {
          const hay = caseInsensitive ? func.name.toLowerCase() : func.name;
          const needle = caseInsensitive ? functionName.toLowerCase() : functionName;
          if (!hay.includes(needle)) {
            continue;
          }
        }

        results.push({
          ...func,
          fullPath: file.path,
        });
      }
    }

    return results;
  }

  /**
   * Zoek classes in een geïndexeerde repository
   */
  searchClasses(
    repositoryPath: string,
    className?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<ClassInfo & { fullPath: string }> {
    const index = this.cache.get(repositoryPath);
    if (!index) {
      throw new Error(`Repository ${repositoryPath} is niet geïndexeerd`);
    }

    const results: Array<ClassInfo & { fullPath: string }> = [];

    for (const file of index.files) {
      if (fileName) {
        const hay = caseInsensitive ? file.path.toLowerCase() : file.path;
        const needle = caseInsensitive ? fileName.toLowerCase() : fileName;
        if (!hay.includes(needle)) {
          continue;
        }
      }

      for (const cls of file.classes) {
        if (className) {
          const hay = caseInsensitive ? cls.name.toLowerCase() : cls.name;
          const needle = caseInsensitive ? className.toLowerCase() : className;
          if (!hay.includes(needle)) {
            continue;
          }
        }

        results.push({
          ...cls,
          fullPath: file.path,
        });
      }
    }

    return results;
  }

  /**
   * Zoek imports in een geïndexeerde repository
   */
  searchImports(
    repositoryPath: string,
    moduleName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<ImportInfo & { fullPath: string }> {
    const index = this.cache.get(repositoryPath);
    if (!index) {
      throw new Error(`Repository ${repositoryPath} is niet geïndexeerd`);
    }

    const results: Array<ImportInfo & { fullPath: string }> = [];

    for (const file of index.files) {
      if (fileName) {
        const hay = caseInsensitive ? file.path.toLowerCase() : file.path;
        const needle = caseInsensitive ? fileName.toLowerCase() : fileName;
        if (!hay.includes(needle)) {
          continue;
        }
      }

      for (const imp of file.imports) {
        if (moduleName) {
          const hay = caseInsensitive ? imp.source.toLowerCase() : imp.source;
          const needle = caseInsensitive ? moduleName.toLowerCase() : moduleName;
          if (!hay.includes(needle)) {
            continue;
          }
        }

        results.push({
          ...imp,
          fullPath: file.path,
        });
      }
    }

    return results;
  }

  /**
   * Get statistieken van een geïndexeerde repository
   */
  getStatistics(repositoryPath: string): {
    filesIndexed: number;
    totalFunctions: number;
    totalClasses: number;
    totalImports: number;
    totalVariables: number;
    totalSqlTables: number;
    totalSqlViews: number;
    filesByLanguage: Record<string, number>;
    indexedAt: string;
  } {
    const index = this.cache.get(repositoryPath);
    if (!index) {
      throw new Error(`Repository ${repositoryPath} is niet geïndexeerd`);
    }

    let totalFunctions = 0;
    let totalClasses = 0;
    let totalImports = 0;
    let totalVariables = 0;
    let totalSqlTables = 0;
    let totalSqlViews = 0;
    const filesByLanguage: Record<string, number> = {};

    for (const file of index.files) {
      totalFunctions += file.functions.length;
      totalClasses += file.classes.length;
      totalImports += file.imports.length;
      totalVariables += file.variables.length;
      totalSqlTables += file.sqlTables?.length || 0;
      totalSqlViews += file.sqlViews?.length || 0;

      // Count files by language
      const lang = file.language || 'unknown';
      filesByLanguage[lang] = (filesByLanguage[lang] || 0) + 1;
    }

    return {
      filesIndexed: index.files.length,
      totalFunctions,
      totalClasses,
      totalImports,
      totalVariables,
      totalSqlTables,
      totalSqlViews,
      filesByLanguage,
      indexedAt: index.indexedAt,
    };
  }

  /**
   * Zoek SQL tables in een geïndexeerde repository
   */
  searchSqlTables(
    repositoryPath: string,
    tableName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<SqlTableInfo & { fullPath: string }> {
    const index = this.cache.get(repositoryPath);
    if (!index) {
      throw new Error(`Repository ${repositoryPath} is niet geïndexeerd`);
    }

    const results: Array<SqlTableInfo & { fullPath: string }> = [];

    for (const file of index.files) {
      if (fileName) {
        const hay = caseInsensitive ? file.path.toLowerCase() : file.path;
        const needle = caseInsensitive ? fileName.toLowerCase() : fileName;
        if (!hay.includes(needle)) {
          continue;
        }
      }

      if (file.sqlTables) {
        for (const table of file.sqlTables) {
          if (tableName) {
            const hay = caseInsensitive ? table.name.toLowerCase() : table.name;
            const needle = caseInsensitive ? tableName.toLowerCase() : tableName;
            if (!hay.includes(needle)) {
              continue;
            }
          }

          results.push({
            ...table,
            fullPath: file.path,
          });
        }
      }
    }

    return results;
  }

  /**
   * Zoek SQL views in een geïndexeerde repository
   */
  searchSqlViews(
    repositoryPath: string,
    viewName?: string,
    fileName?: string,
    caseInsensitive?: boolean,
  ): Array<SqlViewInfo & { fullPath: string }> {
    const index = this.cache.get(repositoryPath);
    if (!index) {
      throw new Error(`Repository ${repositoryPath} is niet geïndexeerd`);
    }

    const results: Array<SqlViewInfo & { fullPath: string }> = [];

    for (const file of index.files) {
      if (fileName) {
        const hay = caseInsensitive ? file.path.toLowerCase() : file.path;
        const needle = caseInsensitive ? fileName.toLowerCase() : fileName;
        if (!hay.includes(needle)) {
          continue;
        }
      }

      if (file.sqlViews) {
        for (const view of file.sqlViews) {
          if (viewName) {
            const hay = caseInsensitive ? view.name.toLowerCase() : view.name;
            const needle = caseInsensitive ? viewName.toLowerCase() : viewName;
            if (!hay.includes(needle)) {
              continue;
            }
          }

          results.push({
            ...view,
            fullPath: file.path,
          });
        }
      }
    }

    return results;
  }

  /**
   * Indexeer alle Git repositories direct onder een rootpad
   */
  async indexRepositoriesUnder(
    rootPath: string,
    nameFilter?: (name: string) => boolean,
    onIndexed?: (repoPath: string, stats: ReturnType<RepositoryIndexer['getStatistics']>) => void,
  ): Promise<Array<{ path: string; stats: ReturnType<RepositoryIndexer['getStatistics']> }>> {
    const entries = await fs.readdir(rootPath, { withFileTypes: true });
    const results: Array<{ path: string; stats: ReturnType<RepositoryIndexer['getStatistics']> }> =
      [];

    const excludes = [
      'node_modules/**',
      'dist/**',
      'build/**',
      '.git/**',
      'bin/**',
      'obj/**',
      'out/**',
      'coverage/**',
    ];

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const repoPath = path.join(rootPath, entry.name);
      if (nameFilter && !nameFilter(entry.name)) continue;

      const isRepo = await this.isGitRepository(repoPath);
      if (!isRepo) continue;

      await this.indexRepository(repoPath, undefined, excludes);
      const stats = this.getStatistics(repoPath);
      results.push({ path: repoPath, stats });
      onIndexed?.(repoPath, stats);
    }

    return results;
  }

  /**
   * Geaggregeerde statistieken over meerdere repositories (uit cache)
   */
  getAggregatedStatistics(repositoryPaths: string[]): {
    repositoriesIndexed: number;
    filesIndexed: number;
    totalFunctions: number;
    totalClasses: number;
    totalImports: number;
    totalVariables: number;
    totalSqlTables: number;
    totalSqlViews: number;
    filesByLanguage: Record<string, number>;
  } {
    let repositoriesIndexed = 0;
    let filesIndexed = 0;
    let totalFunctions = 0;
    let totalClasses = 0;
    let totalImports = 0;
    let totalVariables = 0;
    let totalSqlTables = 0;
    let totalSqlViews = 0;
    const filesByLanguage: Record<string, number> = {};

    for (const repoPath of repositoryPaths) {
      const index = this.cache.get(repoPath);
      if (!index) continue;
      repositoriesIndexed++;
      filesIndexed += index.files.length;

      for (const file of index.files) {
        totalFunctions += file.functions.length;
        totalClasses += file.classes.length;
        totalImports += file.imports.length;
        totalVariables += file.variables.length;
        totalSqlTables += file.sqlTables?.length || 0;
        totalSqlViews += file.sqlViews?.length || 0;

        const lang = file.language || 'unknown';
        filesByLanguage[lang] = (filesByLanguage[lang] || 0) + 1;
      }
    }

    return {
      repositoriesIndexed,
      filesIndexed,
      totalFunctions,
      totalClasses,
      totalImports,
      totalVariables,
      totalSqlTables,
      totalSqlViews,
      filesByLanguage,
    };
  }
}
