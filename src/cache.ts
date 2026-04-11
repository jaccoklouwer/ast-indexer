import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as zlib from 'node:zlib';
import type { RepositoryIndex } from './schemas.js';

const gzip = promisify(zlib.gzip);
const gunzip = promisify(zlib.gunzip);

/**
 * Geeft het pad naar de cache directory (~/.ast-indexer/cache/) terug.
 * Maakt de directory aan als die nog niet bestaat.
 */
export async function getCacheDir(): Promise<string> {
  const dir = path.join(os.homedir(), '.ast-indexer', 'cache');
  await fs.mkdir(dir, { recursive: true });
  return dir;
}

/**
 * Berekent de pad-hash (eerste 12 hex chars van sha256 van het absolute repo pad).
 */
export function getPadHash(repositoryPath: string): string {
  return crypto.createHash('sha256').update(repositoryPath).digest('hex').slice(0, 12);
}

/**
 * Geeft de cache-bestandsnaam terug voor een specifieke repo + commit combinatie.
 * Formaat: <repo-naam>_<pad-hash>_<commit-hash>[_<patterns-hash>].json.gz
 * De patterns-hash wordt alleen toegevoegd als include- of excludePatterns opgegeven zijn.
 */
export function getCacheKey(
  repositoryPath: string,
  commitHash: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): string {
  const repoNaam = path.basename(repositoryPath);
  const padHash = getPadHash(repositoryPath);
  const safeCommit = commitHash.trim().slice(0, 40);

  const hasPatterns =
    (includePatterns && includePatterns.length > 0) ||
    (excludePatterns && excludePatterns.length > 0);

  if (hasPatterns) {
    const patternsJson = JSON.stringify({
      inc: (includePatterns ?? []).slice().sort(),
      exc: (excludePatterns ?? []).slice().sort(),
    });
    const patternsHash = crypto.createHash('sha256').update(patternsJson).digest('hex').slice(0, 8);
    return `${repoNaam}_${padHash}_${safeCommit}_${patternsHash}.json.gz`;
  }

  return `${repoNaam}_${padHash}_${safeCommit}.json.gz`;
}

/**
 * Leest de schijfcache voor een repo + commit.
 * Retourneert null bij cache miss of een corrupt bestand.
 */
export async function readDiskCache(
  repositoryPath: string,
  commitHash: string,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<RepositoryIndex | null> {
  try {
    const cacheDir = await getCacheDir();
    const fileName = getCacheKey(repositoryPath, commitHash, includePatterns, excludePatterns);
    const filePath = path.join(cacheDir, fileName);
    const compressed = await fs.readFile(filePath);
    const decompressed = await gunzip(compressed);
    return JSON.parse(decompressed.toString('utf-8')) as RepositoryIndex;
  } catch {
    return null;
  }
}

/**
 * Schrijft de index naar de schijfcache als gzipped JSON.
 */
export async function writeDiskCache(
  repositoryPath: string,
  commitHash: string,
  index: RepositoryIndex,
  includePatterns?: string[],
  excludePatterns?: string[],
): Promise<void> {
  const cacheDir = await getCacheDir();
  const fileName = getCacheKey(repositoryPath, commitHash, includePatterns, excludePatterns);
  const filePath = path.join(cacheDir, fileName);
  const json = JSON.stringify(index);
  const compressed = await gzip(json);
  await fs.writeFile(filePath, compressed);
}

/**
 * Verwijdert oude cache entries voor een repo, bewaar de nieuwste 3.
 */
export async function cleanupOldEntries(repositoryPath: string): Promise<void> {
  try {
    const cacheDir = await getCacheDir();
    const padHash = getPadHash(repositoryPath);
    const entries = await fs.readdir(cacheDir);

    // Filter op entries die bij deze repo horen
    const repoEntries = entries.filter((e) => e.includes(`_${padHash}_`) && e.endsWith('.json.gz'));

    if (repoEntries.length <= 3) return;

    // Sorteer op mtime (nieuwste eerst)
    const withStats = await Promise.all(
      repoEntries.map(async (e) => {
        const stat = await fs.stat(path.join(cacheDir, e));
        return { name: e, mtime: stat.mtimeMs };
      }),
    );
    withStats.sort((a, b) => b.mtime - a.mtime);

    // Verwijder alles na de eerste 3
    const toDelete = withStats.slice(3);
    await Promise.all(toDelete.map((e) => fs.unlink(path.join(cacheDir, e.name))));
  } catch {
    // Cleanup fouten zijn niet-fataal
  }
}
