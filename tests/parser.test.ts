import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseFile, scanDirectory, shouldParseFile } from '../src/parser.js';

describe('Parser', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-parser-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('herkent parsebare bestandstypen', () => {
    expect(shouldParseFile('file.js')).toBe(true);
    expect(shouldParseFile('file.ts')).toBe(true);
    expect(shouldParseFile('file.cs')).toBe(true);
    expect(shouldParseFile('file.sql')).toBe(true);
    expect(shouldParseFile('file.md')).toBe(false);
  });

  it('parseert functies, classes, imports en exports uit JavaScript', async () => {
    const filePath = path.join(tempDir, 'sample.js');
    await fs.writeFile(
      filePath,
      [
        "import React from 'react';",
        "import { useState } from 'react';",
        'export function add(a, b) { return a + b; }',
        'export class Counter {',
        '  value = 0;',
        '  increment() { return this.value + 1; }',
        '}',
        'export const multiply = (x, y) => x * y;',
      ].join('\n'),
    );

    const result = await parseFile(filePath);

    expect(result.language).toBe('javascript');
    expect(result.functions.map((item) => item.name)).toEqual(
      expect.arrayContaining(['add', 'multiply']),
    );
    expect(result.classes[0]?.name).toBe('Counter');
    expect(result.classes[0]?.methods).toContain('increment');
    expect(result.imports).toHaveLength(2);
    expect(result.exports).toEqual(expect.arrayContaining(['add', 'Counter', 'multiply']));
    expect(result.exportDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'add', line: 3 }),
        expect.objectContaining({ name: 'Counter', line: 4 }),
        expect.objectContaining({ name: 'multiply', line: 8 }),
      ]),
    );
  });

  it('parseert TypeScript bestanden', async () => {
    const filePath = path.join(tempDir, 'sample.ts');
    await fs.writeFile(
      filePath,
      [
        'interface User { name: string; }',
        'export function greet(user: User): string {',
        '  return user.name;',
        '}',
      ].join('\n'),
    );

    const result = await parseFile(filePath);

    expect(result.language).toBe('typescript');
    expect(result.functions[0]?.name).toBe('greet');
    expect(result.functions[0]?.returnType).toBe('string');
  });

  it('scant directories met include en exclude patterns', async () => {
    const projectDir = path.join(tempDir, 'project');
    const srcDir = path.join(projectDir, 'src');
    const nodeModulesDir = path.join(projectDir, 'node_modules');
    await fs.mkdir(srcDir, { recursive: true });
    await fs.mkdir(nodeModulesDir, { recursive: true });
    await fs.writeFile(path.join(srcDir, 'index.js'), 'export const value = 1;');
    await fs.writeFile(path.join(srcDir, 'helper.ts'), 'export function helper() { return true; }');
    await fs.writeFile(path.join(nodeModulesDir, 'skip.js'), 'module.exports = {};');

    const files = await scanDirectory(
      projectDir,
      ['src/**/*.ts', 'src/**/*.js'],
      ['node_modules/**'],
    );

    expect(files.some((item) => item.endsWith('index.js'))).toBe(true);
    expect(files.some((item) => item.endsWith('helper.ts'))).toBe(true);
    expect(files.some((item) => item.includes('node_modules'))).toBe(false);
  });
});
