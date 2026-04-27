import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { simpleGit } from 'simple-git';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { RepositoryIndexer } from '../src/indexer.js';
import { TreeSitterEngine } from '../src/tree-sitter-engine.js';
import { createCommonToolDefinitions } from '../src/tool-registry.js';

function getTools() {
  return Object.fromEntries(
    createCommonToolDefinitions({
      indexer: new RepositoryIndexer(),
      treeSitterEngine: new TreeSitterEngine(),
    }).map((tool) => [tool.name, tool]),
  );
}

describe('MCP server tool handlers', () => {
  let tempDir: string;
  let repoPath: string;
  let sourceFilePath: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-tool-handlers-'));
    repoPath = path.join(tempDir, 'repo');
    sourceFilePath = path.join(repoPath, 'src', 'index.js');

    await fs.mkdir(path.join(repoPath, 'src'), { recursive: true });
    await fs.writeFile(
      sourceFilePath,
      [
        "import { add } from './math.js';",
        'export function add(a, b) {',
        '  return a + b;',
        '}',
      ].join('\n'),
    );

    const git = simpleGit(repoPath);
    await git.init();
    await git.addConfig('user.name', 'Test User');
    await git.addConfig('user.email', 'test@example.com');
    await git.add('.');
    await git.commit('Initial commit');
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('voert index-, zoek-, reference- en cache-tools succesvol uit', async () => {
    const tools = getTools();

    const indexResult = await tools.index_repository.handler({ repositoryPath: repoPath });
    const functionResult = await tools.search_functions.handler({
      repositoryPath: repoPath,
      functionName: 'add',
    });
    const statisticsResult = await tools.get_statistics.handler({ repositoryPath: repoPath });
    const crossFileReferenceResult = await tools.get_cross_file_references.handler({
      repositoryPath: repoPath,
      symbolName: 'add',
    });
    const clearCacheResult = await tools.clear_cache.handler({ repositoryPath: repoPath });
    const fileStatusResult = await tools.get_file_status.handler({
      repositoryPath: repoPath,
      filePath: sourceFilePath,
    });

    expect(indexResult.structuredContent?.success).toBe(true);
    expect(functionResult.structuredContent?.count).toBe(1);
    expect(statisticsResult.structuredContent?.success).toBe(true);
    expect(crossFileReferenceResult.structuredContent?.count).toBeGreaterThan(0);
    expect(clearCacheResult.structuredContent?.success).toBe(true);
    expect(fileStatusResult.structuredContent?.success).toBe(true);
    expect(fileStatusResult.structuredContent?.status).toBe('clean');
    expect(fileStatusResult.structuredContent?.modified).toBe(false);
  });

  it('geeft nette fouten terug voor ongeindexeerde of mislukte tool-aanroepen', async () => {
    const tools = getTools();
    const unknownRepoPath = path.join(tempDir, 'unknown-repo');

    const statisticsResult = await tools.get_statistics.handler({
      repositoryPath: unknownRepoPath,
    });
    const structuralSearchResult = await tools.structural_search.handler({
      repositoryPath: unknownRepoPath,
      query: '(function_declaration) @fn',
    });
    const astResult = await tools.get_ast.handler({
      filePath: path.join(repoPath, 'src', 'missing.js'),
    });
    const fileStatusMissingResult = await tools.get_file_status.handler({
      repositoryPath: repoPath,
      filePath: path.join(repoPath, 'src', 'does-not-exist.ts'),
    });

    expect(statisticsResult.isError).toBe(true);
    expect(structuralSearchResult.isError).toBe(true);
    expect(astResult.isError).toBe(true);
    expect(astResult.content?.[0]?.text).toContain('Fout:');
    expect(fileStatusMissingResult.isError).toBe(true);
    expect(fileStatusMissingResult.content?.[0]?.text).toContain('Fout:');
  });
});
