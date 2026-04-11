import * as fs from 'fs/promises';
// import * as path from 'path';
import iconv from 'iconv-lite';
import Parser from 'tree-sitter';
import CSharp from 'tree-sitter-c-sharp';
import { ClassInfo, FileIndex, FunctionInfo, ImportInfo, VariableInfo } from './schemas.js';

/**
 * Parse een C# bestand met Tree-sitter
 */
export async function parseCSharpFile(filePath: string): Promise<FileIndex> {
  // Lees als Buffer en detecteer encoding (UTF-8/UTF-16-LE/UTF-16-BE)
  const raw = await fs.readFile(filePath);
  let content: string;
  if (raw.length >= 2 && raw[0] === 0xff && raw[1] === 0xfe) {
    // UTF-16 LE met BOM
    content = iconv.decode(Buffer.from(raw.slice(2)), 'utf16le');
  } else if (raw.length >= 2 && raw[0] === 0xfe && raw[1] === 0xff) {
    // UTF-16 BE met BOM → swap naar LE
    const be = raw.slice(2);
    const le = Buffer.alloc(be.length);
    for (let i = 0; i + 1 < be.length; i += 2) {
      le[i] = be[i + 1];
      le[i + 1] = be[i];
    }
    content = iconv.decode(le, 'utf16le');
  } else {
    // Heuristiek: veel NUL-bytes → waarschijnlijk UTF-16-LE
    let nulCount = 0;
    for (let i = 0; i < raw.length; i++) if (raw[i] === 0x00) nulCount++;
    const nulRatio = raw.length > 0 ? nulCount / raw.length : 0;
    content = nulRatio > 0.2 ? iconv.decode(raw, 'utf16le') : iconv.decode(raw, 'utf8');
  }
  // const relativePath = path.basename(filePath);

  const parser = new Parser();
  parser.setLanguage(CSharp);
  let tree: Parser.Tree;
  try {
    tree = parser.parse(content);
  } catch {
    // Fallback: probeer alternatieve encodings indien parse faalt
    try {
      const alt = iconv.decode(raw, 'latin1');
      tree = parser.parse(alt);
    } catch {
      // Als Tree-sitter faalt: simpele regex-gebaseerde fallback extractie
      return fallbackParseCSharpContent(content, filePath);
    }
  }

  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const variables: VariableInfo[] = [];
  const exports: string[] = [];

  // Helper functie om node text te krijgen
  const getNodeText = (node: Parser.SyntaxNode): string => {
    return content.substring(node.startIndex, node.endIndex);
  };

  // Recursief door de AST lopen
  const traverse = (node: Parser.SyntaxNode, namespace?: string) => {
    // Extract using directives (imports)
    if (node.type === 'using_directive') {
      // Try several possible field names / structures to extract the name
      let nameNode = node.childForFieldName('name');
      if (!nameNode) {
        nameNode = node.namedChildren.find(
          (c: Parser.SyntaxNode) =>
            c.type === 'qualified_name' ||
            c.type === 'identifier' ||
            c.type === 'namespace_or_type_name',
        ) as Parser.SyntaxNode | null;
      }
      if (nameNode) {
        imports.push({
          source: getNodeText(nameNode),
          imported: [],
          isDefault: false,
          file: filePath,
          line: node.startPosition.row + 1,
          isNamespace: true,
        });
      }
    }

    // Extract namespace
    if (node.type === 'namespace_declaration') {
      const nameNode = node.childForFieldName('name');
      const currentNamespace = nameNode ? getNodeText(nameNode) : undefined;

      // Process children within this namespace
      for (let i = 0; i < node.childCount; i++) {
        traverse(node.child(i)!, currentNamespace);
      }
      return; // Don't continue with default traversal
    }

    // Extract class declarations
    if (node.type === 'class_declaration' || node.type === 'interface_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const className = getNodeText(nameNode);
        const methods: string[] = [];
        const properties: string[] = [];
        const implementsList: string[] = [];

        // Check modifiers
        let isPublic = false;
        let isAbstract = false;
        const modifiers = node.children.filter((c: Parser.SyntaxNode) => c.type === 'modifier');
        for (const mod of modifiers) {
          const modText = getNodeText(mod);
          if (modText === 'public') isPublic = true;
          if (modText === 'abstract') isAbstract = true;
        }

        // Find base list (extends/implements)
        // Zoek naar base list node (verschillende varianten in grammar)
        const basesNode =
          node.namedChildren.find(
            (c: Parser.SyntaxNode) =>
              c.type === 'base_list' || c.type === 'class_base' || c.type === 'interface_base',
          ) || node.children.find((c: Parser.SyntaxNode) => c.type === 'base_list');
        let extendsClass: string | undefined;
        if (basesNode) {
          const baseTypes: string[] = [];
          for (let k = 0; k < basesNode.childCount; k++) {
            const child = basesNode.child(k);
            if (!child) continue;
            const txt = getNodeText(child).trim();
            if (txt === ':' || txt === ',') continue;
            // Skip keywords/punctuation, collect type names
            baseTypes.push(txt);
          }

          if (node.type === 'class_declaration') {
            if (baseTypes.length > 0) {
              extendsClass = baseTypes[0];
            }
            if (baseTypes.length > 1) {
              implementsList.push(...baseTypes.slice(1));
            }
          } else if (node.type === 'interface_declaration') {
            if (baseTypes.length > 0) {
              implementsList.push(...baseTypes);
            }
          }
        }

        // Extract methods and properties from body
        const body = node.childForFieldName('body');
        if (body) {
          for (let i = 0; i < body.childCount; i++) {
            const member = body.child(i);
            if (!member) continue;

            if (member.type === 'method_declaration') {
              const methodName = member.childForFieldName('name');
              if (methodName) {
                methods.push(getNodeText(methodName));
              }
            } else if (
              member.type === 'property_declaration' ||
              member.type === 'field_declaration'
            ) {
              const propName = member.childForFieldName('name');
              if (propName) {
                properties.push(getNodeText(propName));
              }
            }
          }
        }

        classes.push({
          name: className,
          methods,
          properties,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          file: filePath,
          extends: extendsClass,
          implements: implementsList.length > 0 ? implementsList : undefined,
          namespace,
          isPublic,
          isAbstract,
          isInterface: node.type === 'interface_declaration',
        });

        // Add to exports if public
        if (isPublic) {
          exports.push(className);
        }
      }
    }

    // Extract method declarations (outside of classes)
    if (node.type === 'method_declaration' && node.parent?.type !== 'class_declaration') {
      const nameNode = node.childForFieldName('name');
      if (nameNode) {
        const methodName = getNodeText(nameNode);
        const params: string[] = [];
        let returnType: string | undefined;
        let isPublic = false;
        let isStatic = false;
        let isAsync = false;

        // Check modifiers
        const modifiers = node.children.filter((c: Parser.SyntaxNode) => c.type === 'modifier');
        for (const mod of modifiers) {
          const modText = getNodeText(mod);
          if (modText === 'public') isPublic = true;
          if (modText === 'static') isStatic = true;
          if (modText === 'async') isAsync = true;
        }

        // Get return type
        const typeNode = node.childForFieldName('type');
        if (typeNode) {
          returnType = getNodeText(typeNode);
        }

        // Get parameters
        const paramList = node.childForFieldName('parameters');
        if (paramList) {
          for (let i = 0; i < paramList.childCount; i++) {
            const param = paramList.child(i);
            if (param && param.type === 'parameter') {
              const paramName = param.childForFieldName('name');
              if (paramName) {
                params.push(getNodeText(paramName));
              }
            }
          }
        }

        functions.push({
          name: methodName,
          type: isAsync ? 'async' : 'method',
          params,
          startLine: node.startPosition.row + 1,
          endLine: node.endPosition.row + 1,
          file: filePath,
          returnType,
          isPublic,
          isStatic,
          isAsync,
        });

        if (isPublic) {
          exports.push(methodName);
        }
      }
    }

    // Extract field/property declarations (global variables)
    if (node.type === 'field_declaration' && node.parent?.type !== 'class_declaration') {
      const declarator = node.child(0);
      if (declarator) {
        const nameNode = declarator.childForFieldName('name');
        if (nameNode) {
          const isPublic = node.children.some(
            (c: Parser.SyntaxNode) => c.type === 'modifier' && getNodeText(c) === 'public',
          );

          variables.push({
            name: getNodeText(nameNode),
            type: 'const', // C# doesn't have let/var distinction at this level
            isExported: isPublic,
            file: filePath,
            line: node.startPosition.row + 1,
          });
        }
      }
    }

    // Traverse children
    for (let i = 0; i < node.childCount; i++) {
      const child = node.child(i);
      if (child) {
        traverse(child, namespace);
      }
    }
  };

  traverse(tree.rootNode);

  return {
    path: filePath,
    functions,
    classes,
    imports,
    variables,
    exports,
    language: 'csharp',
  };
}

/**
 * Eenvoudige regex fallback voor C# bestanden wanneer Tree-sitter parsing faalt.
 * Extraheert using-directives, classes en methoden op een best-effort basis.
 */
function fallbackParseCSharpContent(content: string, filePath: string): FileIndex {
  const functions: FunctionInfo[] = [];
  const classes: ClassInfo[] = [];
  const imports: ImportInfo[] = [];
  const variables: VariableInfo[] = [];
  const exports: string[] = [];

  // Using directives
  const usingRegex = /^\s*using\s+([A-Za-z0-9_.]+)\s*;\s*$/gm;
  for (const match of content.matchAll(usingRegex)) {
    const name = match[1];
    const startIdx = match.index ?? 0;
    const line = content.slice(0, startIdx).split('\n').length;
    imports.push({
      source: name,
      imported: [],
      isDefault: false,
      file: filePath,
      line,
      isNamespace: true,
    });
  }

  // Classes / interfaces
  const classRegex =
    /(public|internal|protected|private)?\s*(abstract\s+)?\s*(class|interface)\s+([A-Za-z_][A-Za-z0-9_.]*)/gm;
  for (const match of content.matchAll(classRegex)) {
    const isPublic = match[1] === 'public';
    const isAbstract = Boolean(match[2]);
    const isInterface = match[3] === 'interface';
    const className = match[4];
    const startIdx = match.index ?? 0;
    const startLine = content.slice(0, startIdx).split('\n').length;

    classes.push({
      name: className,
      methods: [],
      properties: [],
      startLine,
      endLine: startLine,
      file: filePath,
      extends: undefined,
      implements: undefined,
      namespace: undefined,
      isPublic,
      isAbstract,
      isInterface,
    });
    if (isPublic) exports.push(className);
  }

  // Methoden (best-effort): access modifier + return type + name + params
  const methodRegex =
    /(public|internal|protected|private)\s+(?:static\s+)?(?:async\s+)?([A-Za-z_][A-Za-z0-9_<>,.]*)(?:\[\])*\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(([^)]*)\)/gm;
  for (const match of content.matchAll(methodRegex)) {
    const isPublic = match[1] === 'public';
    const returnType = match[2].trim();
    const methodName = match[3];
    const paramsRaw = match[4];
    const params = paramsRaw
      .split(',')
      .map((p) => p.trim())
      .filter(Boolean)
      .map((p) => {
        const m = p.match(/([A-Za-z_][A-Za-z0-9_]*)\s*(?:=|$)/);
        return m ? m[1] : p;
      });
    const startIdx = match.index ?? 0;
    const startLine = content.slice(0, startIdx).split('\n').length;

    functions.push({
      name: methodName,
      type: 'method',
      params,
      startLine,
      endLine: startLine,
      file: filePath,
      returnType,
      isPublic,
      isStatic: /\bstatic\b/.test(match[0]),
      isAsync: /\basync\b/.test(match[0]),
    });
    if (isPublic) exports.push(methodName);
  }

  return {
    path: filePath,
    functions,
    classes,
    imports,
    variables,
    exports,
    language: 'csharp',
  };
}
