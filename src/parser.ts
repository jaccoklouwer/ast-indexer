import * as fs from 'fs/promises';
import * as path from 'path';
import * as ts from 'typescript';
import { parseCSharpFile } from './csharp-parser.js';
import { ClassInfo, FileIndex, FunctionInfo, ImportInfo, VariableInfo } from './schemas.js';
import { parseSqlFile } from './sql-parser.js';

/**
 * Parse een bestand en extraheer AST informatie
 */
export async function parseFile(filePath: string): Promise<FileIndex> {
  // Route naar juiste parser op basis van extensie
  const ext = path.extname(filePath).toLowerCase();

  if (ext === '.cs') {
    return parseCSharpFile(filePath);
  }

  if (ext === '.sql') {
    return parseSqlFile(filePath);
  }

  // JavaScript/TypeScript parsing (bestaande logica)
  return parseJavaScriptFile(filePath);
}

/**
 * Parse JavaScript/TypeScript bestand met TypeScript Compiler API
 */
async function parseJavaScriptFile(filePath: string): Promise<FileIndex> {
  const content = await fs.readFile(filePath, 'utf-8');
  const relativePath = path.basename(filePath);

  // Bepaal ScriptKind op basis van bestandsextensie
  let scriptKind = ts.ScriptKind.JS;
  if (filePath.endsWith('.ts')) scriptKind = ts.ScriptKind.TS;
  else if (filePath.endsWith('.tsx')) scriptKind = ts.ScriptKind.TSX;
  else if (filePath.endsWith('.jsx')) scriptKind = ts.ScriptKind.JSX;

  // Parse met TypeScript Compiler API
  const sourceFile = ts.createSourceFile(
    relativePath,
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

  // Helper functie om line number te krijgen
  const getLineNumber = (pos: number): number => {
    return sourceFile.getLineAndCharacterOfPosition(pos).line + 1;
  };

  // Helper functie om parameter namen te extracten
  const getParameterNames = (parameters: ts.NodeArray<ts.ParameterDeclaration>): string[] => {
    return parameters.map((param) => {
      if (ts.isIdentifier(param.name)) {
        return param.name.text;
      }
      return 'complex';
    });
  };

  // Helper functie om return type te krijgen
  const getReturnType = (
    node: ts.FunctionDeclaration | ts.MethodDeclaration | ts.ArrowFunction | ts.FunctionExpression,
  ): string | undefined => {
    if (node.type) {
      return node.type.getText(sourceFile);
    }
    return undefined;
  };

  // Recursief door de AST traverseren
  function visit(node: ts.Node, isExported = false) {
    // Extract function declarations
    if (ts.isFunctionDeclaration(node) && node.name) {
      const startLine = getLineNumber(node.pos);
      const endLine = getLineNumber(node.end);

      functions.push({
        name: node.name.text,
        type: node.modifiers?.some((m) => m.kind === ts.SyntaxKind.AsyncKeyword)
          ? 'async'
          : 'function',
        params: getParameterNames(node.parameters),
        startLine,
        endLine,
        file: filePath,
        returnType: getReturnType(node),
      });

      const isExportedDecl =
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || isExported;
      if (isExportedDecl) {
        exports.push(node.name.text);
      }
    }

    // Extract arrow functions en function expressions assigned to variables
    if (ts.isVariableStatement(node)) {
      const isExportedVar = node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword);

      node.declarationList.declarations.forEach((decl) => {
        if (ts.isIdentifier(decl.name)) {
          const varName = decl.name.text;
          const varType =
            node.declarationList.flags & ts.NodeFlags.Const
              ? 'const'
              : node.declarationList.flags & ts.NodeFlags.Let
                ? 'let'
                : 'var';

          variables.push({
            name: varName,
            type: varType,
            isExported: !!isExportedVar,
            file: filePath,
            line: getLineNumber(decl.pos),
          });

          if (isExportedVar) {
            exports.push(varName);
          }

          // Check if it's a function
          if (
            decl.initializer &&
            (ts.isArrowFunction(decl.initializer) || ts.isFunctionExpression(decl.initializer))
          ) {
            const startLine = getLineNumber(decl.pos);
            const endLine = getLineNumber(decl.end);

            functions.push({
              name: varName,
              type: 'arrow',
              params: getParameterNames(decl.initializer.parameters),
              startLine,
              endLine,
              file: filePath,
              returnType: getReturnType(decl.initializer),
            });
          }
        }
      });
    }

    // Extract class declarations
    if (ts.isClassDeclaration(node) && node.name) {
      const methods: string[] = [];
      const properties: string[] = [];
      let extendsClass: string | undefined;

      // Check voor extends
      if (node.heritageClauses) {
        for (const clause of node.heritageClauses) {
          if (clause.token === ts.SyntaxKind.ExtendsKeyword && clause.types.length > 0) {
            extendsClass = clause.types[0].expression.getText(sourceFile);
          }
        }
      }

      // Extract methods en properties
      node.members.forEach((member) => {
        if (ts.isMethodDeclaration(member) && ts.isIdentifier(member.name)) {
          methods.push(member.name.text);
        } else if (ts.isPropertyDeclaration(member) && ts.isIdentifier(member.name)) {
          properties.push(member.name.text);
        }
      });

      classes.push({
        name: node.name.text,
        methods,
        properties,
        startLine: getLineNumber(node.pos),
        endLine: getLineNumber(node.end),
        file: filePath,
        extends: extendsClass,
      });

      const isExportedDecl =
        node.modifiers?.some((m) => m.kind === ts.SyntaxKind.ExportKeyword) || isExported;
      if (isExportedDecl) {
        exports.push(node.name.text);
      }
    }

    // Extract import declarations
    if (
      ts.isImportDeclaration(node) &&
      node.moduleSpecifier &&
      ts.isStringLiteral(node.moduleSpecifier)
    ) {
      const imported: string[] = [];
      let isDefault = false;

      if (node.importClause) {
        // Default import
        if (node.importClause.name) {
          imported.push(node.importClause.name.text);
          isDefault = true;
        }

        // Named imports
        if (node.importClause.namedBindings) {
          if (ts.isNamedImports(node.importClause.namedBindings)) {
            node.importClause.namedBindings.elements.forEach((element) => {
              imported.push(element.name.text);
            });
          } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
            imported.push(node.importClause.namedBindings.name.text);
          }
        }
      }

      imports.push({
        source: node.moduleSpecifier.text,
        imported,
        isDefault,
        file: filePath,
        line: getLineNumber(node.pos),
      });
    }

    // Extract exports
    if (ts.isExportDeclaration(node)) {
      if (node.exportClause && ts.isNamedExports(node.exportClause)) {
        node.exportClause.elements.forEach((element) => {
          exports.push(element.name.text);
        });
      }
    }

    // Default export assignment: export default identifier
    if (ts.isExportAssignment(node)) {
      const expr = node.expression;
      if (ts.isIdentifier(expr)) {
        exports.push(expr.text);
      } else {
        exports.push('default');
      }
    }

    // Note: export handling is done at declaration-level to avoid generic Node typing issues

    // Continue traversal
    ts.forEachChild(node, (child) => visit(child, isExported));
  }

  // Start traversal
  visit(sourceFile);

  // Bepaal language op basis van extensie
  let language: 'javascript' | 'typescript' = 'javascript';
  if (filePath.endsWith('.ts') || filePath.endsWith('.tsx')) {
    language = 'typescript';
  }

  return {
    path: filePath,
    functions,
    classes,
    imports,
    variables,
    exports,
    language,
  };
}

/**
 * Bepaal of een bestand geparseerd moet worden
 */
export function shouldParseFile(filePath: string): boolean {
  const ext = path.extname(filePath).toLowerCase();
  const supportedExtensions = ['.js', '.jsx', '.ts', '.tsx', '.mjs', '.cjs', '.cs', '.sql'];
  return supportedExtensions.includes(ext);
}

function normalizeGlobPath(filePath: string): string {
  return filePath.replace(/\\/g, '/');
}

function matchesGlobPattern(filePath: string, pattern: string): boolean {
  const normalizedPath = normalizeGlobPath(filePath);
  const normalizedPattern = normalizeGlobPath(pattern);

  if (path.posix.matchesGlob(normalizedPath, normalizedPattern)) {
    return true;
  }

  if (normalizedPattern.endsWith('/**')) {
    return normalizedPath === normalizedPattern.slice(0, -3);
  }

  return false;
}

function matchesAnyGlobPattern(filePath: string, patterns: string[]): boolean {
  return patterns.some((pattern) => matchesGlobPattern(filePath, pattern));
}

const DEFAULT_INCLUDE_PATTERNS = ['**/*'];
const DEFAULT_EXCLUDE_PATTERNS = [
  '.git/**',
  'node_modules/**',
  'dist/**',
  'build/**',
  '**/*.test.*',
  '**/*.spec.*',
  '**/*.Designer.cs',
  'bin/**',
  'obj/**',
  '.vs/**',
  '.idea/**',
  '.fleet/**',
  '**/*.Generated.cs',
  '**/Service References/**',
];

/**
 * Recursief scan directory voor parseerbare bestanden
 */
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

      // Check exclude patterns
      const relativePath = normalizeGlobPath(path.relative(dirPath, fullPath));
      const shouldExclude = matchesAnyGlobPattern(relativePath, excludePatterns);

      // Hard exclude: Windows Forms Designer files
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
