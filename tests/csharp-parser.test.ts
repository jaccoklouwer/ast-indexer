import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCSharpFile } from '../src/csharp-parser.js';

function encodeUtf16Be(value: string): Buffer {
  const utf16Le = Buffer.from(value, 'utf16le');
  const utf16Be = Buffer.alloc(utf16Le.length + 2);

  utf16Be[0] = 0xfe;
  utf16Be[1] = 0xff;

  for (let index = 0; index < utf16Le.length; index += 2) {
    utf16Be[index + 2] = utf16Le[index + 1] ?? 0;
    utf16Be[index + 3] = utf16Le[index] ?? 0;
  }

  return utf16Be;
}

describe('parseCSharpFile', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-csharp-parser-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('parseert classes, interfaces, properties en imports uit UTF-8 C#', async () => {
    const filePath = path.join(tempDir, 'service.cs');
    await fs.writeFile(
      filePath,
      [
        'using System.Text;',
        'namespace Demo.Core;',
        'public interface ILogger {',
        '  void Log(string message);',
        '}',
        'public abstract class Service : BaseService, IDisposable {',
        '  public string Name { get; set; }',
        '  public async Task<int> RunAsync(string input) {',
        '    return input.Length;',
        '  }',
        '}',
      ].join('\n'),
    );

    const result = await parseCSharpFile(filePath);
    const logger = result.classes.find((item) => item.name === 'ILogger');
    const service = result.classes.find((item) => item.name === 'Service');

    expect(result.language).toBe('csharp');
    expect(result.imports[0]?.source).toBe('System.Text');
    expect(logger?.isInterface).toBe(true);
    expect(service?.namespace).toBe('Demo.Core');
    expect(service?.isAbstract).toBe(true);
    expect(service?.extends).toBe('BaseService');
    expect(service?.implements).toContain('IDisposable');
    expect(service?.properties).toContain('Name');
    expect(service?.methods).toContain('RunAsync');
    expect(result.exports).toContain('ILogger');
    expect(result.exportDetails).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ name: 'ILogger', line: 3 }),
        expect.objectContaining({ name: 'Service', line: 6 }),
      ]),
    );
  });

  it('decodeert UTF-16LE zonder BOM en UTF-16BE met BOM', async () => {
    const utf16LeFilePath = path.join(tempDir, 'utf16le.cs');
    const utf16BeFilePath = path.join(tempDir, 'utf16be.cs');
    const content = [
      'using Demo.Text;',
      'namespace Demo.Encoding;',
      'public class GreetingService {',
      '  public string Message { get; set; }',
      '}',
    ].join('\n');

    await fs.writeFile(utf16LeFilePath, Buffer.from(content, 'utf16le'));
    await fs.writeFile(utf16BeFilePath, encodeUtf16Be(content));

    const utf16LeResult = await parseCSharpFile(utf16LeFilePath);
    const utf16BeResult = await parseCSharpFile(utf16BeFilePath);

    expect(utf16LeResult.classes[0]?.name).toBe('GreetingService');
    expect(utf16LeResult.imports[0]?.source).toBe('Demo.Text');
    expect(utf16BeResult.classes[0]?.properties).toContain('Message');
    expect(utf16BeResult.classes[0]?.namespace).toBe('Demo.Encoding');
  });
});
