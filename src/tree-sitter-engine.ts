import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import type Parser from 'tree-sitter';
import type { AstNode, TreeEdit } from './schemas.js';

export type SupportedTreeSitterLanguage = 'javascript' | 'typescript' | 'tsx' | 'csharp' | 'sql';

interface CachedTreeEntry {
  language: SupportedTreeSitterLanguage;
  content: string;
  tree: Parser.Tree;
}

interface ParserConstructor {
  new (): Parser;
  Query: new (language: Parser.Language, source: string | Buffer) => Parser.Query;
}

function toLanguage(filePath: string): SupportedTreeSitterLanguage {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.tsx') {
    return 'tsx';
  }

  if (['.ts', '.mts', '.cts'].includes(extension)) {
    return 'typescript';
  }

  if (['.js', '.jsx', '.mjs', '.cjs'].includes(extension)) {
    return 'javascript';
  }

  if (extension === '.cs') {
    return 'csharp';
  }

  if (extension === '.sql') {
    return 'sql';
  }

  throw new Error(`Tree-sitter wordt niet ondersteund voor bestandstype: ${extension || filePath}`);
}

function toOneBasedPosition(point: Parser.Point): { line: number; column: number } {
  return {
    line: point.row + 1,
    column: point.column + 1,
  };
}

function toZeroBasedPoint(line: number, column: number): Parser.Point {
  return {
    row: Math.max(0, line - 1),
    column: Math.max(0, column - 1),
  };
}

export class TreeSitterEngine {
  private static parserConstructor: ParserConstructor | undefined;
  private static readonly parserCache = new Map<SupportedTreeSitterLanguage, Parser>();
  private static readonly languageCache = new Map<SupportedTreeSitterLanguage, Parser.Language>();
  private readonly treeCacheByPath = new Map<string, CachedTreeEntry>();

  private static async getParserConstructor(): Promise<ParserConstructor> {
    if (this.parserConstructor) {
      return this.parserConstructor;
    }

    // VS Code terminal stelt ELECTRON_RUN_AS_NODE=1 in, waardoor node-gyp-build
    // zoekt naar een Electron-binary in plaats van een Node.js-binary.
    // We verwijderen de variabele vóór het laden van tree-sitter.
    delete process.env['ELECTRON_RUN_AS_NODE'];

    try {
      const module = (await import('tree-sitter')) as { default?: ParserConstructor };
      const parserConstructor = module.default ?? (module as unknown as ParserConstructor);
      this.parserConstructor = parserConstructor;
      return parserConstructor;
    } catch (error) {
      throw new Error(
        `Tree-sitter runtime kon niet worden geladen: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }
  }

  static async getLanguage(language: SupportedTreeSitterLanguage): Promise<Parser.Language> {
    const cachedLanguage = this.languageCache.get(language);
    if (cachedLanguage) {
      return cachedLanguage;
    }

    let resolvedLanguage: Parser.Language;
    try {
      switch (language) {
        case 'javascript': {
          const module = (await import('tree-sitter-javascript')) as { default?: Parser.Language };
          resolvedLanguage = module.default ?? (module as unknown as Parser.Language);
          break;
        }
        case 'typescript':
        case 'tsx': {
          const module = (await import('tree-sitter-typescript')) as {
            default?: { typescript: Parser.Language; tsx: Parser.Language };
            typescript?: Parser.Language;
            tsx?: Parser.Language;
          };
          const loaded = module.default ?? module;
          const candidateLanguage = language === 'tsx' ? loaded.tsx : loaded.typescript;
          if (!candidateLanguage) {
            throw new Error(`Tree-sitter taalmodule ontbreekt voor ${language}`);
          }
          resolvedLanguage = candidateLanguage;
          break;
        }
        case 'csharp': {
          const module = (await import('tree-sitter-c-sharp')) as { default?: Parser.Language };
          resolvedLanguage = module.default ?? (module as unknown as Parser.Language);
          break;
        }
        case 'sql': {
          const module = (await import('tree-sitter-sql')) as { default?: Parser.Language };
          resolvedLanguage = module.default ?? (module as unknown as Parser.Language);
          break;
        }
      }
    } catch (error) {
      throw new Error(
        `Tree-sitter taalmodule kon niet worden geladen voor ${language}: ${
          error instanceof Error ? error.message : String(error)
        }`,
        { cause: error },
      );
    }

    if (!resolvedLanguage) {
      throw new Error(`Tree-sitter taalmodule ontbreekt voor ${language}`);
    }

    this.languageCache.set(language, resolvedLanguage);
    return resolvedLanguage;
  }

  static async getParser(language: SupportedTreeSitterLanguage): Promise<Parser> {
    const cachedParser = this.parserCache.get(language);
    if (cachedParser) {
      return cachedParser;
    }

    const ParserRuntime = await this.getParserConstructor();
    const parser = new ParserRuntime();
    parser.setLanguage(await this.getLanguage(language));
    this.parserCache.set(language, parser);
    return parser;
  }

  async createQuery(filePath: string, source: string): Promise<Parser.Query> {
    const ParserRuntime = await TreeSitterEngine.getParserConstructor();
    return new ParserRuntime.Query(await this.getLanguageForFile(filePath), source);
  }

  async parseFile(filePath: string): Promise<Parser.Tree> {
    const content = await fs.readFile(filePath, 'utf8');
    return this.parseContent(filePath, content);
  }

  async parseContent(filePath: string, content: string): Promise<Parser.Tree> {
    const language = toLanguage(filePath);
    const parser = await TreeSitterEngine.getParser(language);
    const existingEntry = this.treeCacheByPath.get(filePath);
    const previousTree = existingEntry?.language === language ? existingEntry.tree : null;
    const tree = parser.parse(content, previousTree);

    this.treeCacheByPath.set(filePath, {
      language,
      content,
      tree,
    });

    return tree;
  }

  async getTree(filePath: string): Promise<Parser.Tree | undefined> {
    return this.treeCacheByPath.get(filePath)?.tree;
  }

  async getContent(filePath: string): Promise<string> {
    const existingEntry = this.treeCacheByPath.get(filePath);
    if (existingEntry) {
      return existingEntry.content;
    }

    await this.parseFile(filePath);
    return this.treeCacheByPath.get(filePath)?.content ?? '';
  }

  async getTreeAndContent(filePath: string): Promise<CachedTreeEntry> {
    const cachedEntry = this.treeCacheByPath.get(filePath);
    if (cachedEntry) {
      return cachedEntry;
    }

    await this.parseFile(filePath);
    const loadedEntry = this.treeCacheByPath.get(filePath);
    if (!loadedEntry) {
      throw new Error(`Bestand kon niet met Tree-sitter worden geladen: ${filePath}`);
    }

    return loadedEntry;
  }

  async getLanguageForFile(filePath: string): Promise<Parser.Language> {
    return TreeSitterEngine.getLanguage(toLanguage(filePath));
  }

  getFileLanguage(filePath: string): SupportedTreeSitterLanguage {
    return toLanguage(filePath);
  }

  async getNodeAtPosition(
    filePath: string,
    line: number,
    column: number,
    namedOnly = true,
  ): Promise<Parser.SyntaxNode> {
    const entry = await this.getTreeAndContent(filePath);
    const point = toZeroBasedPoint(line, column);
    return namedOnly
      ? entry.tree.rootNode.namedDescendantForPosition(point)
      : entry.tree.rootNode.descendantForPosition(point);
  }

  invalidateFile(filePath: string): void {
    this.treeCacheByPath.delete(filePath);
  }

  clearCache(targetPath?: string): void {
    if (!targetPath) {
      this.treeCacheByPath.clear();
      return;
    }

    const normalizedTargetPath = targetPath.replace(/\\/g, '/');
    for (const filePath of this.treeCacheByPath.keys()) {
      const normalizedFilePath = filePath.replace(/\\/g, '/');
      if (
        normalizedFilePath === normalizedTargetPath ||
        normalizedFilePath.startsWith(`${normalizedTargetPath}/`)
      ) {
        this.treeCacheByPath.delete(filePath);
      }
    }
  }

  async updateFile(filePath: string, edit: TreeEdit, newContent: string): Promise<Parser.Tree> {
    const existingEntry = await this.getTreeAndContent(filePath);
    const parser = await TreeSitterEngine.getParser(existingEntry.language);
    existingEntry.tree.edit(edit);
    const updatedTree = parser.parse(newContent, existingEntry.tree);

    this.treeCacheByPath.set(filePath, {
      ...existingEntry,
      content: newContent,
      tree: updatedTree,
    });

    return updatedTree;
  }

  serializeNode(
    node: Parser.SyntaxNode,
    maxDepth: number,
    namedOnly: boolean,
    currentDepth = 0,
  ): AstNode {
    const start = toOneBasedPosition(node.startPosition);
    const end = toOneBasedPosition(node.endPosition);
    const childrenSource = namedOnly ? node.namedChildren : node.children;
    const children =
      currentDepth >= maxDepth
        ? []
        : childrenSource.map((child) =>
            this.serializeNode(child, maxDepth, namedOnly, currentDepth + 1),
          );

    return {
      type: node.type,
      text: node.text,
      startLine: start.line,
      startColumn: start.column,
      endLine: end.line,
      endColumn: end.column,
      isNamed: node.isNamed,
      hasError: node.hasError,
      isMissing: node.isMissing,
      children,
    };
  }
}
