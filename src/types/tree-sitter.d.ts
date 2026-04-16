declare module 'tree-sitter' {
  export interface ParserPoint {
    row: number;
    column: number;
  }

  export interface SyntaxNode {
    type: string;
    text: string;
    startIndex: number;
    endIndex: number;
    startPosition: ParserPoint;
    endPosition: ParserPoint;
    parent: SyntaxNode | null;
    children: SyntaxNode[];
    namedChildren: SyntaxNode[];
    childCount: number;
    child(index: number): SyntaxNode | null;
    childForFieldName(fieldName: string): SyntaxNode | null;
  }

  export interface Tree {
    rootNode: SyntaxNode;
  }

  export interface Language {
    name?: string;
  }

  export default class Parser {
    setLanguage(language: Language): void;
    parse(input: string): Tree;
  }
}

declare module 'tree-sitter-javascript' {
  const languageModule: { language: unknown };
  export default languageModule;
}

declare module 'tree-sitter-typescript' {
  const languageModule: { typescript: unknown; tsx: unknown };
  export default languageModule;
}

declare module 'tree-sitter-c-sharp' {
  const languageModule: { language: unknown };
  export default languageModule;
}

declare module 'tree-sitter-sql' {
  const languageModule: { language: unknown };
  export default languageModule;
}
