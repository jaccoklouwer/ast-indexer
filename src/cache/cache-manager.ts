import { DiskCache } from './disk-cache.js';
import { MemoryCache } from './memory-cache.js';
import type { FileIndex } from '../schemas.js';

export class CacheManager {
  constructor(
    private readonly memoryCache = new MemoryCache(),
    private readonly diskCache = new DiskCache(),
  ) {}

  async getOrParse(
    repositoryPath: string,
    filePath: string,
    cacheKey: string,
    parseFile: () => Promise<FileIndex>,
  ): Promise<FileIndex> {
    const memoryEntry = this.memoryCache.get(filePath);
    if (memoryEntry?.cacheKey === cacheKey) {
      return memoryEntry.index;
    }

    const diskEntry = await this.diskCache.read(repositoryPath, filePath, cacheKey);
    if (diskEntry) {
      this.memoryCache.set(filePath, { cacheKey, index: diskEntry });
      return diskEntry;
    }

    const parsedIndex = await parseFile();
    this.memoryCache.set(filePath, { cacheKey, index: parsedIndex });
    await this.diskCache.write(repositoryPath, filePath, cacheKey, parsedIndex);
    return parsedIndex;
  }

  async clearRepo(repositoryPath: string): Promise<void> {
    this.memoryCache.clearRepo(repositoryPath);
    await this.diskCache.clearRepo(repositoryPath);
  }

  async clearAll(): Promise<void> {
    this.memoryCache.clear();
    await this.diskCache.clearAll();
  }
}
