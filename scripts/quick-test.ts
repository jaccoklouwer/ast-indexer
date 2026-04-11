import { RepositoryIndexer } from '../src/indexer.js';

async function main() {
  const repoPath = process.argv[2];
  if (!repoPath) {
    console.error('Gebruik: pnpm tsx scripts/quick-test.ts <pad-naar-repo>');
    process.exit(1);
  }

  const indexer = new RepositoryIndexer();

  // Check repo validity
  const isRepo = await indexer.isGitRepository(repoPath);
  if (!isRepo) {
    console.error(`${repoPath} is geen geldige Git repository (git init ontbreekt).`);
    process.exit(2);
  }

  console.log(`Indexeren van: ${repoPath}`);

  // Index the repository
  const _index = await indexer.indexRepository(repoPath, undefined, [
    'node_modules/**',
    'dist/**',
    'build/**',
  ]);

  // Print statistics
  const stats = indexer.getStatistics(repoPath);
  console.log('\nStatistieken:');
  console.log(JSON.stringify(stats, null, 2));

  // Sample searches
  const functions = indexer.searchFunctions(repoPath, undefined, undefined, true);
  console.log(`\nVoorbeeld: aantal functies (case-insensitive): ${functions.length}`);

  const classes = indexer.searchClasses(repoPath, undefined, undefined, true);
  console.log(`Voorbeeld: aantal classes (case-insensitive): ${classes.length}`);

  const imports = indexer.searchImports(repoPath, undefined, undefined, true);
  console.log(`Voorbeeld: aantal imports (case-insensitive): ${imports.length}`);

  const tables = indexer.searchSqlTables(repoPath, undefined, undefined, true);
  console.log(`Voorbeeld: aantal SQL tables (case-insensitive): ${tables.length}`);

  const views = indexer.searchSqlViews(repoPath, undefined, undefined, true);
  console.log(`Voorbeeld: aantal SQL views (case-insensitive): ${views.length}`);
}

main().catch((err) => {
  console.error('Fout tijdens quick-test:', err);
  process.exit(1);
});
