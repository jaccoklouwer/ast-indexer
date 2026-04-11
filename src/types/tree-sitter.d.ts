declare module 'tree-sitter' {
  namespace Parser {
    interface Point {
      row: number;
      column: number;
    }

    interface SyntaxNode {
      type: string;
      text: string;
      startIndex: number;
      endIndex: number;
      startPosition: Point;
      endPosition: Point;
      parent: SyntaxNode | null;
      children: SyntaxNode[];
      namedChildren: SyntaxNode[];
      childCount: number;
      namedChildCount: number;
      child(index: number): SyntaxNode | null;
      namedChild(index: number): SyntaxNode | null;
      childForFieldName(fieldName: string): SyntaxNode | null;
      hasError(): boolean;
      isMissing(): boolean;
      toString(): string;
    }

    interface Tree {
      rootNode: SyntaxNode;
    }

    interface Language {
      readonly name: string;
    }
  }

  class Parser {
    setLanguage(language: Parser.Language): void;
    parse(input: string): Parser.Tree;
  }

  export = Parser;
}

declare module 'tree-sitter-c-sharp' {
  import type Parser from 'tree-sitter';
  const language: Parser.Language;
  export = language;
}
