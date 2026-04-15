import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseCSharpFile } from '../src/csharp-parser.js';

describe('C# Parser', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'csharp-parser-test-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('parseCSharpFile', () => {
    it('should parse a C# file with class declaration', async () => {
      const testFile = path.join(tempDir, 'TestClass.cs');
      const content = `
        using System;
        using System.Collections.Generic;

        namespace MyApp.Models
        {
            public class User
            {
                public int Id { get; set; }
                public string Name { get; set; }

                public void Save()
                {
                    Console.WriteLine("Saving user");
                }

                public async Task<bool> ValidateAsync()
                {
                    return true;
                }
            }
        }
      `;
      await fs.writeFile(testFile, content);

      const result = await parseCSharpFile(testFile);

      expect(result.language).toBe('csharp');
      expect(result.imports.length).toBeGreaterThanOrEqual(1);
      expect(result.classes.length).toBeGreaterThanOrEqual(1);

      const userClass = result.classes.find((c) => c.name === 'User');
      expect(userClass).toBeDefined();
      expect(userClass?.namespace).toBe('MyApp.Models');
      expect(userClass?.isPublic).toBe(true);
    });

    it('should parse C# using directives', async () => {
      const testFile = path.join(tempDir, 'Imports.cs');
      const content = `
        using System;
        using System.Linq;
        using MyApp.Core;
      `;
      await fs.writeFile(testFile, content);

      const result = await parseCSharpFile(testFile);

      expect(result.imports.length).toBeGreaterThanOrEqual(2);
      expect(result.imports.some((i) => i.source.includes('System'))).toBe(true);
    });

    it('should parse C# interface', async () => {
      const testFile = path.join(tempDir, 'Interface.cs');
      const content = `
        namespace MyApp
        {
            public interface IRepository
            {
                void Add(object item);
                object Get(int id);
            }
        }
      `;
      await fs.writeFile(testFile, content);

      const result = await parseCSharpFile(testFile);

      expect(result.classes.length).toBeGreaterThanOrEqual(1);
      const iface = result.classes.find((c) => c.name === 'IRepository');
      expect(iface?.isInterface).toBe(true);
    });

    it('should parse C# class inheritance', async () => {
      const testFile = path.join(tempDir, 'Inheritance.cs');
      const content = `
        namespace MyApp
        {
            public class Animal
            {
                public virtual void Speak() { }
            }

            public class Dog : Animal
            {
                public override void Speak() 
                { 
                    Console.WriteLine("Woof!");
                }
            }
        }
      `;
      await fs.writeFile(testFile, content);

      const result = await parseCSharpFile(testFile);

      expect(result.classes.length).toBeGreaterThanOrEqual(2);
      const dog = result.classes.find((c) => c.name === 'Dog');
      expect(dog?.extends).toBeDefined();
    });

    it('should handle public and static methods', async () => {
      const testFile = path.join(tempDir, 'StaticMethod.cs');
      const content = `
        public class Helper
        {
            public static int Add(int a, int b)
            {
                return a + b;
            }

            private void Internal()
            {
            }
        }
      `;
      await fs.writeFile(testFile, content);

      const result = await parseCSharpFile(testFile);

      expect(result.classes.length).toBeGreaterThan(0);
      const helperClass = result.classes[0];
      expect(helperClass.methods.length).toBeGreaterThan(0);
    });

    it('should parse using static and alias directives', async () => {
      const testFile = path.join(tempDir, 'Usings.cs');
      const content = `
        using static System.Math;
        using IO = System.IO;

        class Dummy { }
      `;
      await fs.writeFile(testFile, content);

      const result = await parseCSharpFile(testFile);

      expect(result.imports.length).toBeGreaterThanOrEqual(2);
      const hasMath = result.imports.some((i) => i.source.includes('System.Math'));
      const hasIO = result.imports.some((i) => i.source.includes('System.IO'));
      expect(hasMath || hasIO).toBe(true);
    });
  });
});
