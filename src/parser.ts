import * as fs from 'node:fs/promises';
import * as path from 'node:path';
import * as ts from 'typescript';
import { parseCSharpFile } from './csharp-parser.js';
import type { ClassInfo, FileIndex, FunctionInfo, ImportInfo, VariableInfo } from './schemas.js';
import { parseSqlFile } from './sql-parser.js';

const TYPESCRIPT_EXTENSIONS = ['.ts', '.tsx', '.mts', '.cts'] as const;
const TYPESCRIPT_NON_JSX_EXTENSIONS = ['.ts', '.mts', '.cts'] as const;
const SUPPORTED_EXTENSIONS = [
  '.js',
  '.jsx',
  '.ts',
  '.tsx',
  '.mts',
  '.cts',
  '.mjs',
  '.cjs',
  '.cs',
  '.sql',
] as const;
const DEFAULT_INCLUDE_PATTERNS = ['**/*'];
const DEFAULT_EXCLUDE_PATTERNS = [
  '**/.git',
  '**/.git/**',
  '**/node_modules',
  '**/node_modules/**',
  '**/dist',
  '**/dist/**',
  '**/build',
  '**/build/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.Designer.cs',
  '**/bin',
  '**/bin/**',
  '**/obj',
  '**/obj/**',
  '**/.vs',
  '**/.vs/**',
  '**/.idea',
  '**/.idea/**',
  '**/.fleet',
  '**/.fleet/**',
  '**/coverage',
  '**/coverage/**',
  '**/.next',
  '**/.next/**',
  '**/.nuxt',
  '**/.nuxt/**',
  '**/*.Generated.cs',
  '**/Service References',
  '**/Service References/**',
];

function isTypeScriptExtension(extension: string): boolean {
  return TYPESCRIPT_EXTENSIONS.includes(extension as (typeof TYPESCRIPT_EXTENSIONS)[number]);
}

export async function parseFile(filePath: string): Promise<FileIndex> {
  const extension = path.extname(filePath).toLowerCase();

  if (extension === '.cs') {
    return parseCSharpFile(filePath);
  }

  if (extension === '.sql') {
    return parseSqlFile(filePath);
  }

  return parseJavaScriptFile(filePath);
}

async function parseJavaScriptFile(filePath: string): Promise<FileIndex> {
  const content = await fs.readFile(filePath, 'utf-8');
  const extension = path.extname(filePath).toLowerCase();
  let scriptKind = ts.ScriptKind.JS;

  if (
    TYPESCRIPT_NON_JSX_EXTENSIONS.includes(
      extension as (typeof TYPESCRIPT_NON_JSX_EXTENSIONS)[number],
    )
  ) {
    scriptKind = ts.ScriptKind.TS;
  } else if (extension === '.tsx') {
    scriptKind = ts.ScriptKind.TSX;
  } else if (extension === '.jsx') {
    scriptKind = ts.ScriptKind.JSX;
  }

  const sourceFile = ts.createSourceFile(
    path.basename(filePath),
    content,
    ts.ScriptTarget.Latest,
    true,
    scriptKind,
  );
  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const variables: VariableInfo[] = [];
  const exports: string[] = [];

  const getLineNumber = (position: number): number =>
    sourceFile.getLineAndCharacterOfPosition(position).line + 1;
  const getParameterNames = (parameters: ts.NodeArray<ts.ParameterDeclaration>): string[] =>
    parameters.map((parameter) =>
      ts.isIdentifier(parameter.name) ? parameter.name.text : 'complex',
    );
  const getReturnType = (node: ts.FunctionLikeDeclaration): string | undefined =>
    node.type?.getText(sourceFile);

  function visit(node: ts.Node, inheritedExport = false): void {
    if (ts.isFunctionDeclaration(node) && node.name) {
      const exported =
        inheritedExport ||
        Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
      functions.push({
        name: node.name.text,
        type: node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword)
          ? 'async'
          : 'function',
        params: getParameterNames(node.parameters),
        startLine: getLineNumber(node.getStart(sourceFile)),
        endLine: getLineNumber(node.end),
        file: filePath,
        returnType: getReturnType(node),
      });
      if (exported) {
        exports.push(node.name.text);
      }
    }

    if (ts.isVariableStatement(node)) {
      const exported =
        inheritedExport ||
        Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
      for (const declaration of node.declarationList.declarations) {
        if (!ts.isIdentifier(declaration.name)) {
          continue;
        }

        const variableName = declaration.name.text;
        const variableType =
          node.declarationList.flags & ts.NodeFlags.Const
            ? 'const'
            : node.declarationList.flags & ts.NodeFlags.Let
              ? 'let'
              : 'var';
        variables.push({
          name: variableName,
          type: variableType,
          isExported: exported,
          file: filePath,
          line: getLineNumber(declaration.getStart(sourceFile)),
        });

        if (exported) {
          exports.push(variableName);
        }

        if (
          declaration.initializer &&
          (ts.isArrowFunction(declaration.initializer) ||
            ts.isFunctionExpression(declaration.initializer))
        ) {
          functions.push({
            name: variableName,
            type: declaration.initializer.modifiers?.some(
              (modifier) => modifier.kind === ts.SyntaxKind.AsyncKeyword,
            )
              ? 'async'
              : 'arrow',
            params: getParameterNames(declaration.initializer.parameters),
            startLine: getLineNumber(declaration.getStart(sourceFile)),
            endLine: getLineNumber(declaration.end),
            file: filePath,
            returnType: getReturnType(declaration.initializer),
          });
        }
      }
    }

    if (ts.isClassDeclaration(node) && node.name) {
      let extendsClass: string | undefined;
      const methods: string[] = [];
      const properties: string[] = [];

      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types.length > 0) {
            extendsClass = clause.types[0]?.expression.getText(sourceFile);
          }
        }
      }

      for (const member of node.members) {
        if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
          methods.push(member.name.text);
        } else if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
          properties.push(member.name.text);
        }
      }

      classes.push({
        name: node.name.text,
        methods,
        properties,
        startLine: getLineNumber(node.getStart(sourceFile)),
        endLine: getLineNumber(node.end),
        file: filePath,
        extends: extendsClass,
      });

      const exported =
        inheritedExport ||
        Boolean(node.modifiers?.some((modifier) => modifier.kind === ts.SyntaxKind.ExportKeyword));
      if (exported) {
        exports.push(node.name.text);
      }
    }

    if (ts.isImportDeclaration(node) && ts.isStringLiteral(node.moduleSpecifier)) {
      const imported: string[] = [];
      let isDefault = false;

      if (node.importClause?.name) {
        imported.push(node.importClause.name.text);
        isDefault = true;
      }

      if (node.importClause?.namedBindings) {
        if (ts.isNamedImports(node.importClause.namedBindings)) {
          for (const element of node.importClause.namedBindings.elements) {
            imported.push(element.name.text);
          }
        } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
          imported.push(node.importClause.namedBindings.name.text);
        }
      }

      imports.push({
        source: node.moduleSpecifier.text,
        imported,
        isDefault,
        file: filePath,
        line: getLineNumber(node.getStart(sourceFile)),
      });
    }

    if (ts.isExportDeclaration(node) && node.exportClause && ts.isNamedExports(node.exportClause)) {
      for (const element of node.exportClause.elements) {
        exports.push(element.name.text);
      }
    }

    if (ts.isExportAssignment(node)) {
      exports.push(ts.isIdentifier(node.expression) ? node.expression.text : 'default');
    }

    ts.forEachChild(node, (child) => visit(child, inheritedExport));
  }

  visit(sourceFile);

  return {
    path: filePath,
    functions,
    classes,
    imports,
    variables,
    exports,
    language: isTypeScriptExtension(extension) ? 'typescript' : 'javascript',
  };
}

export function shouldParseFile(filePath: string): boolean {
  const extension = path.extname(filePath).toLowerCase();
  return SUPPORTED_EXTENSIONS.includes(extension as (typeof SUPPORTED_EXTENSIONS)[number]);
}

function normalizeGlobPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function expandGlobPatternAliases(pattern: string): string[] {
  const normalizedPattern = normalizeGlobPath(pattern);
  if (!normalizedPattern.toLowerCase().endsWith('.ts')) {
    return [normalizedPattern];
  }

  const prefix = normalizedPattern.slice(0, -3);
  return [normalizedPattern, `${prefix}.mts`, `${prefix}.cts`];
}

function matchesGlobPattern(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizeGlobPath(filePath);

  for (const normalizedPattern of expandGlobPatternAliases(pattern)) {
    if (path.posix.matchesGlob(normalizedPath, normalizedPattern)) {
      return true;
    }

    if (normalizedPattern.endsWith('/**') && normalizedPath === normalizedPattern.slice(0, -3)) {
      return true;
    }
  }

  return false;
}

function matchesAnyGlobPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlobPattern(filePath, pattern));
}

export async function scanDirectory(
  dirPath: string,
  includePatterns: string[] = DEFAULT_INCLUDE_PATTERNS,
  excludePatterns: string[] = DEFAULT_EXCLUDE_PATTERNS,
): Promise<string[]> {
  const files: string[] = [];

  async function scan(currentPath: string): Promise<void> {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const fullPath = path.join(currentPath, entry.name);
      const relativePath = normalizeGlobPath(path.relative(dirPath, fullPath));
      const shouldExclude = matchesAnyGlobPattern(relativePath, excludePatterns);
      const isDesignerCs = /\.Designer\.cs$/i.test(fullPath);

      if (shouldExclude || isDesignerCs) {
        continue;
      }

      if (entry.isDirectory()) {
        await scan(fullPath);
      } else if (
        entry.isFile() &&
        shouldParseFile(fullPath) &&
        matchesAnyGlobPattern(relativePath, includePatterns)
      ) {
        files.push(fullPath);
      }
    }
  }

  await scan(dirPath);
  return files;
}
