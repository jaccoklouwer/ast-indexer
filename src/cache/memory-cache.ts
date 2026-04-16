import type { FileIndex } from '../schemas.js';

export interface CachedFileEntry {
  cacheKey: string;
  index: FileIndex;
}

export class MemoryCache {
  private readonly entries = new Map<string, CachedFileEntry>();

  get(filePath: string): CachedFileEntry | undefined {
    return this.entries.get(filePath);
  }

  set(filePath: string, entry: CachedFileEntry): void {
    this.entries.set(filePath, entry);
  }

  delete(filePath: string): void {
    this.entries.delete(filePath);
  }

  clearRepo(repositoryPath: string): void {
    const prefix = repositoryPath.endsWith('/') ? repositoryPath : `${repositoryPath}/`;
    const normalizedPrefix = prefix.replace(/\\/g, '/');
    for (const key of this.entries.keys()) {
      const normalizedKey = key.replace(/\\/g, '/');
      if (normalizedKey.startsWith(normalizedPrefix)) {
        this.entries.delete(key);
      }
    }
  }

  clear(): void {
    this.entries.clear();
  }
}
