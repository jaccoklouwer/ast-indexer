import { describe, expect, it } from 'vitest';
import {
  ClassSchema,
  FileIndexSchema,
  FunctionSchema,
  ImportSchema,
  IndexRepositoryArgsSchema,
  RepositoryIndexSchema,
  SearchFunctionsArgsSchema,
  VariableSchema,
} from '../src/schemas';

describe('Schema Validation', () => {
  describe('FunctionSchema', () => {
    it('should validate a correct function object', () => {
      const validFunction = {
        name: 'testFunction',
        type: 'function' as const,
        params: ['arg1', 'arg2'],
        startLine: 10,
        endLine: 20,
        file: 'test.ts',
      };

      const result = FunctionSchema.safeParse(validFunction);
      expect(result.success).toBe(true);
    });

    it('should reject invalid function type', () => {
      const invalidFunction = {
        name: 'testFunction',
        type: 'invalid',
        params: ['arg1'],
        startLine: 10,
        endLine: 20,
        file: 'test.ts',
      };

      const result = FunctionSchema.safeParse(invalidFunction);
      expect(result.success).toBe(false);
    });

    it('should reject missing required fields', () => {
      const invalidFunction = {
        name: 'testFunction',
        type: 'function' as const,
        // missing params, startLine, endLine, file
      };

      const result = FunctionSchema.safeParse(invalidFunction);
      expect(result.success).toBe(false);
    });
  });

  describe('ClassSchema', () => {
    it('should validate a correct class object', () => {
      const validClass = {
        name: 'TestClass',
        methods: ['method1', 'method2'],
        properties: ['prop1'],
        startLine: 5,
        endLine: 50,
        file: 'test.ts',
        extends: 'BaseClass',
      };

      const result = ClassSchema.safeParse(validClass);
      expect(result.success).toBe(true);
    });

    it('should allow class without extends', () => {
      const validClass = {
        name: 'TestClass',
        methods: [],
        properties: [],
        startLine: 5,
        endLine: 50,
        file: 'test.ts',
      };

      const result = ClassSchema.safeParse(validClass);
      expect(result.success).toBe(true);
    });
  });

  describe('ImportSchema', () => {
    it('should validate a correct import object', () => {
      const validImport = {
        source: 'react',
        imported: ['useState', 'useEffect'],
        isDefault: false,
        file: 'component.tsx',
        line: 1,
      };

      const result = ImportSchema.safeParse(validImport);
      expect(result.success).toBe(true);
    });

    it('should validate default import', () => {
      const validImport = {
        source: 'express',
        imported: ['express'],
        isDefault: true,
        file: 'server.ts',
        line: 1,
      };

      const result = ImportSchema.safeParse(validImport);
      expect(result.success).toBe(true);
    });
  });

  describe('VariableSchema', () => {
    it('should validate a const variable', () => {
      const validVariable = {
        name: 'myConst',
        type: 'const' as const,
        isExported: true,
        file: 'module.ts',
        line: 10,
      };

      const result = VariableSchema.safeParse(validVariable);
      expect(result.success).toBe(true);
    });

    it('should reject invalid variable type', () => {
      const invalidVariable = {
        name: 'myVar',
        type: 'invalid',
        isExported: false,
        file: 'module.ts',
        line: 10,
      };

      const result = VariableSchema.safeParse(invalidVariable);
      expect(result.success).toBe(false);
    });
  });

  describe('FileIndexSchema', () => {
    it('should validate a complete file index', () => {
      const validFileIndex = {
        path: '/path/to/file.ts',
        functions: [
          {
            name: 'testFn',
            type: 'function' as const,
            params: [],
            startLine: 1,
            endLine: 5,
            file: 'file.ts',
          },
        ],
        classes: [],
        imports: [],
        variables: [],
        exports: ['testFn'],
      };

      const result = FileIndexSchema.safeParse(validFileIndex);
      expect(result.success).toBe(true);
    });
  });

  describe('RepositoryIndexSchema', () => {
    it('should validate a repository index', () => {
      const validRepoIndex = {
        repositoryPath: '/path/to/repo',
        files: [
          {
            path: '/path/to/file.ts',
            functions: [],
            classes: [],
            imports: [],
            variables: [],
            exports: [],
          },
        ],
        indexedAt: new Date().toISOString(),
      };

      const result = RepositoryIndexSchema.safeParse(validRepoIndex);
      expect(result.success).toBe(true);
    });
  });

  describe('IndexRepositoryArgsSchema', () => {
    it('should validate minimal args', () => {
      const validArgs = {
        repositoryPath: '/path/to/repo',
      };

      const result = IndexRepositoryArgsSchema.safeParse(validArgs);
      expect(result.success).toBe(true);
    });

    it('should validate args with patterns', () => {
      const validArgs = {
        repositoryPath: '/path/to/repo',
        includePatterns: ['**/*.ts'],
        excludePatterns: ['node_modules/**'],
      };

      const result = IndexRepositoryArgsSchema.safeParse(validArgs);
      expect(result.success).toBe(true);
    });

    it('should reject missing repositoryPath', () => {
      const invalidArgs = {
        includePatterns: ['**/*.ts'],
      };

      const result = IndexRepositoryArgsSchema.safeParse(invalidArgs);
      expect(result.success).toBe(false);
    });
  });

  describe('SearchFunctionsArgsSchema', () => {
    it('should validate search with all params', () => {
      const validArgs = {
        repositoryPath: '/path/to/repo',
        functionName: 'myFunction',
        fileName: 'module.ts',
      };

      const result = SearchFunctionsArgsSchema.safeParse(validArgs);
      expect(result.success).toBe(true);
    });

    it('should validate search with only repositoryPath', () => {
      const validArgs = {
        repositoryPath: '/path/to/repo',
      };

      const result = SearchFunctionsArgsSchema.safeParse(validArgs);
      expect(result.success).toBe(true);
    });
  });
});
