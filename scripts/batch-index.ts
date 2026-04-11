import { RepositoryIndexer } from '../src/indexer.js';

function printHelp(): void {
  console.log(
    `Gebruik: pnpm tsx scripts/batch-index.ts [rootPad] [naamFilter]\n\nOpties:\n  -h, --help           Toon deze hulptekst\n  --concurrency <n>    Overschrijf aantal workers (zelfde als env AST_INDEXER_CONCURRENCY)\n\nArgumenten:\n  rootPad              Root folder met submappen (Git repos). Standaard: C:/Users/JKLOUWE94/source/repos\n  naamFilter           Regex om repo-namen te filteren (case-insensitive)`,
  );
}

async function main() {
  const args = process.argv.slice(2);

  // Help detectie
  if (args.includes('-h') || args.includes('--help')) {
    printHelp();
    return;
  }

  // Concurrency flag: --concurrency <n> of --concurrency=n
  let root = 'C:/Users/JKLOUWE94/source/repos';
  let nameFilterArg: string | undefined;
  let i = 0;

  while (i < args.length) {
    const a = args[i];
    if (a === '--concurrency') {
      const v = args[i + 1];
      if (!v) {
        console.error('Fout: --concurrency vereist een numerieke waarde');
        printHelp();
        process.exit(1);
      }
      process.env.AST_INDEXER_CONCURRENCY = v;
      i += 2;
      continue;
    }
    if (a.startsWith('--concurrency=')) {
      process.env.AST_INDEXER_CONCURRENCY = a.split('=')[1];
      i += 1;
      continue;
    }
    // Eerste non-flag is root, tweede is naamFilter
    if (!a.startsWith('-') && root === 'C:/Users/JKLOUWE94/source/repos') {
      root = a;
      i += 1;
      continue;
    }
    if (!a.startsWith('-') && !nameFilterArg) {
      nameFilterArg = a;
      i += 1;
      continue;
    }
    // Onbekende flag
    console.error(`Onbekende optie: ${a}`);
    printHelp();
    process.exit(1);
  }

  // Bug fix: compileer de regex eenmalig na de while-loop, niet bij elke aanroep.
  // De closure over de `let nameFilterArg` variabele was onveilig — de waarde
  // kon in deorie nog wijzigen. Nu snapshot we de waarde in een `const`.
  const nameFilterRegex = nameFilterArg ? new RegExp(nameFilterArg, 'i') : undefined;
  const filter = nameFilterRegex ? (name: string) => nameFilterRegex.test(name) : undefined;

  const indexer = new RepositoryIndexer();
  console.log(`Batch indexeren van repos onder: ${root}\n`);

  const results = await indexer.indexRepositoriesUnder(root, filter, (repoPath, stats) => {
    console.log(`✓ ${repoPath}`);
    console.log(
      `  bestanden: ${stats.filesIndexed}  functies: ${stats.totalFunctions}  classes: ${stats.totalClasses}  imports: ${stats.totalImports}`,
    );
  });

  for (const r of results) {
    console.log(`\nRepo: ${r.path}`);
    console.log(JSON.stringify(r.stats, null, 2));
  }

  const agg = indexer.getAggregatedStatistics(results.map((r) => r.path));
  console.log(`\nGeaggregeerde statistieken:`);
  console.log(JSON.stringify(agg, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
