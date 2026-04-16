import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSqlFile } from '../src/sql-parser.js';

describe('SQL parser', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'ast-indexer-sql-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  it('parseert tables, views, procedures en functions', async () => {
    const filePath = path.join(tempDir, 'schema.sql');
    await fs.writeFile(
      filePath,
      [
        'CREATE TABLE Users (',
        '  Id INT PRIMARY KEY,',
        '  Name NVARCHAR(100),',
        '  Email NVARCHAR(255)',
        ');',
        'CREATE VIEW ActiveUsers AS SELECT * FROM Users;',
        'CREATE PROCEDURE GetUserById @UserId INT AS BEGIN SELECT * FROM Users WHERE Id = @UserId; END;',
        'CREATE FUNCTION CalculateTotal(@Price DECIMAL, @Quantity INT) RETURNS DECIMAL(10,2) AS BEGIN RETURN @Price * @Quantity; END;',
      ].join('\n'),
    );

    const result = await parseSqlFile(filePath);

    expect(result.sqlTables?.[0]?.name).toBe('Users');
    expect(result.sqlTables?.[0]?.columns).toEqual(expect.arrayContaining(['Id', 'Name', 'Email']));
    expect(result.sqlViews?.[0]?.name).toBe('ActiveUsers');
    expect(result.functions.find((item) => item.name === 'GetUserById')?.type).toBe(
      'stored_procedure',
    );
    expect(result.functions.find((item) => item.name === 'CalculateTotal')?.type).toBe(
      'sql_function',
    );
  });

  it('parseert triggers en indexes', async () => {
    const filePath = path.join(tempDir, 'advanced.sql');
    await fs.writeFile(
      filePath,
      [
        'CREATE TRIGGER UsersAuditTrigger AFTER INSERT OR UPDATE ON Users',
        'BEGIN',
        '  SELECT 1;',
        'END;',
        'CREATE UNIQUE INDEX IX_Users_Email ON Users (Email, Name);',
      ].join('\n'),
    );

    const result = await parseSqlFile(filePath);

    expect(result.sqlTriggers).toBeDefined();
    expect(result.sqlTriggers?.map((item) => item.event)).toEqual(
      expect.arrayContaining(['INSERT', 'UPDATE']),
    );
    expect(result.sqlIndexes?.[0]).toMatchObject({
      name: 'IX_Users_Email',
      table: 'Users',
      isUnique: true,
    });
    expect(result.sqlIndexes?.[0]?.columns).toEqual(['Email', 'Name']);
  });
});
