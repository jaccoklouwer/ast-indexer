import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFile, scanDirectory, shouldParseFile } from '../src/parser.js';

describe('Parser', () => {
  let tempDir: string;

  beforeAll(async () => {
    // Create temporary directory for test files
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-test-'));
  });

  afterAll(async () => {
    // Cleanup
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('shouldParseFile', () => {
    it('should return true for JavaScript files', () => {
      expect(shouldParseFile('test.js')).toBe(true);
      expect(shouldParseFile('test.jsx')).toBe(true);
      expect(shouldParseFile('test.mjs')).toBe(true);
      expect(shouldParseFile('test.cjs')).toBe(true);
    });

    it('should return true for TypeScript files', () => {
      expect(shouldParseFile('test.ts')).toBe(true);
      expect(shouldParseFile('test.tsx')).toBe(true);
      expect(shouldParseFile('test.mts')).toBe(true);
      expect(shouldParseFile('test.cts')).toBe(true);
    });

    it('should return false for other file types', () => {
      expect(shouldParseFile('test.txt')).toBe(false);
      expect(shouldParseFile('test.json')).toBe(false);
      expect(shouldParseFile('test.md')).toBe(false);
      expect(shouldParseFile('test.py')).toBe(false);
    });
  });

  describe('parseFile', () => {
    it('should parse a file with function declarations', async () => {
      const testFile = path.join(tempDir, 'functions.js');
      const content = `
        function add(a, b) {
          return a + b;
        }

        async function fetchData(url) {
          return fetch(url);
        }

        const multiply = (x, y) => x * y;
      `;
      await fs.writeFile(testFile, content);

      const result = await parseFile(testFile);

      expect(result.functions).toHaveLength(3);
      expect(result.functions[0].name).toBe('add');
      expect(result.functions[0].type).toBe('function');
      expect(result.functions[0].params).toEqual(['a', 'b']);

      expect(result.functions[1].name).toBe('fetchData');
      expect(result.functions[1].type).toBe('async');

      expect(result.functions[2].name).toBe('multiply');
      expect(result.functions[2].type).toBe('arrow');
    });

    it('should parse a file with class declarations', async () => {
      const testFile = path.join(tempDir, 'classes.js');
      const content = `
        class Animal {
          constructor(name) {
            this.name = name;
          }

          speak() {
            console.log(this.name);
          }
        }

        class Dog extends Animal {
          bark() {
            console.log('Woof!');
          }
        }
      `;
      await fs.writeFile(testFile, content);

      const result = await parseFile(testFile);

      expect(result.classes).toHaveLength(2);
      expect(result.classes[0].name).toBe('Animal');
      expect(result.classes[0].methods).toContain('speak');

      expect(result.classes[1].name).toBe('Dog');
      expect(result.classes[1].extends).toBe('Animal');
      expect(result.classes[1].methods).toContain('bark');
    });

    it('should parse import statements', async () => {
      const testFile = path.join(tempDir, 'imports.js');
      const content = `
        import React from 'react';
        import { useState, useEffect } from 'react';
        import * as util from './util';
      `;
      await fs.writeFile(testFile, content);

      const result = await parseFile(testFile);

      expect(result.imports).toHaveLength(3);
      expect(result.imports[0].source).toBe('react');
      expect(result.imports[0].isDefault).toBe(true);

      expect(result.imports[1].source).toBe('react');
      expect(result.imports[1].imported).toContain('useState');
      expect(result.imports[1].imported).toContain('useEffect');

      expect(result.imports[2].source).toBe('./util');
    });

    it('should parse variable declarations', async () => {
      const testFile = path.join(tempDir, 'variables.js');
      const content = `
        const PI = 3.14;
        let counter = 0;
        var oldStyle = true;
        
        export const EXPORTED_CONST = 'value';
      `;
      await fs.writeFile(testFile, content);

      const result = await parseFile(testFile);

      expect(result.variables.length).toBeGreaterThanOrEqual(3);

      const piVar = result.variables.find((v) => v.name === 'PI');
      expect(piVar?.type).toBe('const');
      expect(piVar?.isExported).toBe(false);

      const exportedVar = result.variables.find((v) => v.name === 'EXPORTED_CONST');
      expect(exportedVar?.type).toBe('const');
      expect(exportedVar?.isExported).toBe(true);
    });

    it('should parse export statements', async () => {
      const testFile = path.join(tempDir, 'exports.js');
      const content = `
        export function helper() {}
        export class MyClass {}
        export const VALUE = 42;
        
        function internal() {}
        export default internal;
      `;
      await fs.writeFile(testFile, content);

      const result = await parseFile(testFile);

      expect(result.exports).toContain('helper');
      expect(result.exports).toContain('MyClass');
      expect(result.exports).toContain('VALUE');
      expect(result.exports).toContain('internal');
    });

    it('should handle TypeScript files', async () => {
      const testFile = path.join(tempDir, 'typescript.ts');
      const content = `
        interface User {
          name: string;
          age: number;
        }

        function greet(user: User): string {
          return \`Hello, \${user.name}\`;
        }
      `;
      await fs.writeFile(testFile, content);

      const result = await parseFile(testFile);

      expect(result.functions).toHaveLength(1);
      expect(result.functions[0].name).toBe('greet');
    });

    it('should handle .mts and .cts files as TypeScript', async () => {
      const esmFile = path.join(tempDir, 'module.mts');
      const commonJsFile = path.join(tempDir, 'module.cts');

      await fs.writeFile(
        esmFile,
        `
          export function fromEsm(input: string): string {
            return input.toUpperCase();
          }
        `,
      );
      await fs.writeFile(
        commonJsFile,
        `
          export const fromCommonJs = (value: number): number => {
            return value + 1;
          };
        `,
      );

      const esmResult = await parseFile(esmFile);
      const commonJsResult = await parseFile(commonJsFile);

      expect(esmResult.language).toBe('typescript');
      expect(esmResult.functions[0]?.name).toBe('fromEsm');
      expect(commonJsResult.language).toBe('typescript');
      expect(commonJsResult.functions[0]?.name).toBe('fromCommonJs');
    });
  });

  describe('scanDirectory', () => {
    it('should find all parseable files in a directory', async () => {
      // Create test directory structure
      const srcDir = path.join(tempDir, 'project', 'src');
      await fs.mkdir(srcDir, { recursive: true });

      await fs.writeFile(path.join(srcDir, 'index.js'), 'console.log("test")');
      await fs.writeFile(path.join(srcDir, 'util.ts'), 'export {}');
      await fs.writeFile(path.join(srcDir, 'README.md'), '# Test');

      const testDir = path.join(tempDir, 'project', 'tests');
      await fs.mkdir(testDir, { recursive: true });
      await fs.writeFile(path.join(testDir, 'test.spec.js'), 'test()');

      const files = await scanDirectory(path.join(tempDir, 'project'));

      expect(files.length).toBeGreaterThanOrEqual(2);
      expect(files.some((f) => f.endsWith('index.js'))).toBe(true);
      expect(files.some((f) => f.endsWith('util.ts'))).toBe(true);
      expect(files.some((f) => f.endsWith('README.md'))).toBe(false);
    });

    it('should respect exclude patterns', async () => {
      const nodeModulesDir = path.join(tempDir, 'exclude-test', 'node_modules');
      const srcDir = path.join(tempDir, 'exclude-test', 'src');

      await fs.mkdir(nodeModulesDir, { recursive: true });
      await fs.mkdir(srcDir, { recursive: true });

      await fs.writeFile(path.join(nodeModulesDir, 'lib.js'), 'module.exports = {}');
      await fs.writeFile(path.join(srcDir, 'index.js'), 'console.log("test")');

      const files = await scanDirectory(
        path.join(tempDir, 'exclude-test'),
        ['**/*'],
        ['node_modules/**'],
      );

      expect(files.some((f) => f.includes('node_modules'))).toBe(false);
      expect(files.some((f) => f.endsWith('index.js'))).toBe(true);
    });

    it('should respect include patterns', async () => {
      const srcDir = path.join(tempDir, 'include-test', 'src');
      const scriptsDir = path.join(tempDir, 'include-test', 'scripts');

      await fs.mkdir(srcDir, { recursive: true });
      await fs.mkdir(scriptsDir, { recursive: true });

      await fs.writeFile(path.join(srcDir, 'index.ts'), 'export const source = true');
      await fs.writeFile(path.join(scriptsDir, 'build.ts'), 'export const script = true');

      const files = await scanDirectory(path.join(tempDir, 'include-test'), ['src/**/*.ts']);

      expect(files).toHaveLength(1);
      expect(files[0]?.endsWith(path.join('src', 'index.ts'))).toBe(true);
    });

    it('should match .mts and .cts when a .ts include pattern is used', async () => {
      const srcDir = path.join(tempDir, 'include-ts-alias-test', 'src');

      await fs.mkdir(srcDir, { recursive: true });

      await fs.writeFile(path.join(srcDir, 'index.ts'), 'export const source = true');
      await fs.writeFile(path.join(srcDir, 'server.mts'), 'export const esm = true');
      await fs.writeFile(path.join(srcDir, 'client.cts'), 'export const cjs = true');

      const files = await scanDirectory(path.join(tempDir, 'include-ts-alias-test'), [
        'src/**/*.ts',
      ]);

      expect(files).toHaveLength(3);
      expect(files.some((f) => f.endsWith(path.join('src', 'index.ts')))).toBe(true);
      expect(files.some((f) => f.endsWith(path.join('src', 'server.mts')))).toBe(true);
      expect(files.some((f) => f.endsWith(path.join('src', 'client.cts')))).toBe(true);
    });

    it('should exclude git metadata directories by default', async () => {
      const repoDir = path.join(tempDir, 'git-metadata-test');
      const gitHooksDir = path.join(repoDir, '.git', 'hooks');
      const srcDir = path.join(repoDir, 'src');

      await fs.mkdir(gitHooksDir, { recursive: true });
      await fs.mkdir(srcDir, { recursive: true });

      await fs.writeFile(path.join(gitHooksDir, 'pre-commit.js'), 'console.log("hook")');
      await fs.writeFile(path.join(srcDir, 'index.js'), 'console.log("app")');

      const files = await scanDirectory(repoDir);

      expect(files.some((f) => f.includes(`${path.sep}.git${path.sep}`))).toBe(false);
      expect(files.some((f) => f.endsWith(path.join('src', 'index.js')))).toBe(true);
    });
  });
});
