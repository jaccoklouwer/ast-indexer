import * as crypto from 'node:crypto';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import type { FileIndex } from '../schemas.js';

interface DiskCachePayload {
  filePath: string;
  cacheKey: string;
  index: FileIndex;
}

function hashValue(value: string): string {
  return crypto.createHash('sha1').update(value).digest('hex');
}

export function getCacheRootDir(): string {
  return path.join(os.homedir(), '.ast-indexer', 'cache');
}

export function getRepoCacheDir(repositoryPath: string): string {
  return path.join(getCacheRootDir(), hashValue(path.resolve(repositoryPath)));
}

function getEntryPath(repositoryPath: string, filePath: string): string {
  return path.join(getRepoCacheDir(repositoryPath), `${hashValue(path.resolve(filePath))}.json`);
}

export class DiskCache {
  async read(
    repositoryPath: string,
    filePath: string,
    cacheKey: string,
  ): Promise<FileIndex | undefined> {
    const entryPath = getEntryPath(repositoryPath, filePath);

    try {
      const raw = await fs.readFile(entryPath, 'utf-8');
      const payload = JSON.parse(raw) as DiskCachePayload;
      if (payload.filePath !== filePath || payload.cacheKey !== cacheKey) {
        return undefined;
      }

      return payload.index;
    } catch {
      return undefined;
    }
  }

  async write(
    repositoryPath: string,
    filePath: string,
    cacheKey: string,
    index: FileIndex,
  ): Promise<void> {
    const repoDir = getRepoCacheDir(repositoryPath);
    const entryPath = getEntryPath(repositoryPath, filePath);
    const payload: DiskCachePayload = {
      filePath,
      cacheKey,
      index,
    };

    await fs.mkdir(repoDir, { recursive: true });
    await fs.writeFile(entryPath, `${JSON.stringify(payload)}\n`, 'utf-8');
  }

  async clearRepo(repositoryPath: string): Promise<void> {
    await fs.rm(getRepoCacheDir(repositoryPath), { recursive: true, force: true });
  }

  async clearAll(): Promise<void> {
    await fs.rm(getCacheRootDir(), { recursive: true, force: true });
  }
}
