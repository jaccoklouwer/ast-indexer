declare module 'tree-sitter' {
  namespace Parser {
    interface Point {
      row: number;
      column: number;
    }

    interface Edit {
      startIndex: number;
      oldEndIndex: number;
      newEndIndex: number;
      startPosition: Point;
      oldEndPosition: Point;
      newEndPosition: Point;
    }

    interface Language {
      name?: string;
    }

    interface QueryCapture {
      name: string;
      node: SyntaxNode;
    }

    interface QueryMatch {
      pattern: number;
      captures: QueryCapture[];
    }

    interface SyntaxNode {
      readonly type: string;
      readonly text: string;
      readonly hasError: boolean;
      readonly isError: boolean;
      readonly isMissing: boolean;
      readonly isNamed: boolean;
      readonly startIndex: number;
      readonly endIndex: number;
      readonly startPosition: Point;
      readonly endPosition: Point;
      readonly parent: SyntaxNode | null;
      readonly tree: Tree;
      readonly nextSibling: SyntaxNode | null;
      readonly nextNamedSibling: SyntaxNode | null;
      readonly previousSibling: SyntaxNode | null;
      readonly previousNamedSibling: SyntaxNode | null;
      readonly firstChild: SyntaxNode | null;
      readonly lastChild: SyntaxNode | null;
      readonly firstNamedChild: SyntaxNode | null;
      readonly namedChildCount: number;
      readonly childCount: number;
      readonly children: SyntaxNode[];
      readonly namedChildren: SyntaxNode[];
      child(index: number): SyntaxNode | null;
      namedChild(index: number): SyntaxNode | null;
      childForFieldName(fieldName: string): SyntaxNode | null;
      descendantForPosition(position: Point): SyntaxNode;
      descendantForPosition(startPosition: Point, endPosition: Point): SyntaxNode;
      namedDescendantForPosition(position: Point): SyntaxNode;
      namedDescendantForPosition(startPosition: Point, endPosition: Point): SyntaxNode;
      walk(): TreeCursor;
    }

    interface TreeCursor {
      readonly currentNode: SyntaxNode;
      readonly currentDepth: number;
      gotoParent(): boolean;
      gotoFirstChild(): boolean;
      gotoNextSibling(): boolean;
    }

    interface Tree {
      readonly rootNode: SyntaxNode;
      edit(edit: Edit): Tree;
      walk(): TreeCursor;
    }

    class Query {
      constructor(language: Language, source: string | Buffer);
      captures(node: SyntaxNode): QueryCapture[];
      matches(node: SyntaxNode): QueryMatch[];
    }
  }
}

declare module 'tree-sitter-javascript' {
  import type Parser from 'tree-sitter';

  const languageModule: Parser.Language;
  export = languageModule;
}

declare module 'tree-sitter-typescript' {
  import type Parser from 'tree-sitter';

  const languageModule: { typescript: Parser.Language; tsx: Parser.Language };
  export = languageModule;
}

declare module 'tree-sitter-c-sharp' {
  import type Parser from 'tree-sitter';

  const languageModule: Parser.Language;
  export = languageModule;
}

declare module 'tree-sitter-sql' {
  import type Parser from 'tree-sitter';

  const languageModule: Parser.Language;
  export = languageModule;
}
