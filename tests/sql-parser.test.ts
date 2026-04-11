import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { parseSqlFile } from '../src/sql-parser';

describe('SQL Parser', () => {
  let tempDir: string;

  beforeAll(async () => {
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'sql-parser-test-'));
  });

  afterAll(async () => {
    await fs.rm(tempDir, { recursive: true, force: true });
  });

  describe('parseSqlFile', () => {
    it('should parse CREATE TABLE statements', async () => {
      const testFile = path.join(tempDir, 'tables.sql');
      const content = `
        CREATE TABLE Users (
          Id INT PRIMARY KEY,
          Name NVARCHAR(100),
          Email NVARCHAR(255),
          CreatedAt DATETIME
        );

        CREATE TABLE Orders (
          OrderId INT PRIMARY KEY,
          UserId INT,
          Total DECIMAL(10,2)
        );
      `;
      await fs.writeFile(testFile, content);

      const result = await parseSqlFile(testFile);

      expect(result.language).toBe('sql');
      expect(result.sqlTables).toBeDefined();
      expect(result.sqlTables!.length).toBeGreaterThanOrEqual(2);

      const usersTable = result.sqlTables!.find((t) => t.name === 'Users');
      expect(usersTable).toBeDefined();
      expect(usersTable?.columns.length).toBeGreaterThan(0);
    });

    it('should parse CREATE VIEW statements', async () => {
      const testFile = path.join(tempDir, 'views.sql');
      const content = `
        CREATE VIEW ActiveUsers AS
        SELECT * FROM Users WHERE IsActive = 1;

        CREATE OR REPLACE VIEW UserOrders AS
        SELECT u.Name, o.Total
        FROM Users u
        JOIN Orders o ON u.Id = o.UserId;
      `;
      await fs.writeFile(testFile, content);

      const result = await parseSqlFile(testFile);

      expect(result.sqlViews).toBeDefined();
      expect(result.sqlViews!.length).toBeGreaterThanOrEqual(1);

      const activeUsersView = result.sqlViews!.find((v) => v.name === 'ActiveUsers');
      expect(activeUsersView).toBeDefined();
    });

    it('should parse CREATE PROCEDURE statements', async () => {
      const testFile = path.join(tempDir, 'procedures.sql');
      const content = `
        CREATE PROCEDURE GetUserById
          @UserId INT
        AS
        BEGIN
          SELECT * FROM Users WHERE Id = @UserId;
        END;

        CREATE PROC InsertUser
          @Name NVARCHAR(100),
          @Email NVARCHAR(255)
        AS
        BEGIN
          INSERT INTO Users (Name, Email) VALUES (@Name, @Email);
        END;
      `;
      await fs.writeFile(testFile, content);

      const result = await parseSqlFile(testFile);

      expect(result.functions).toBeDefined();
      expect(result.functions.length).toBeGreaterThanOrEqual(2);

      const getUserProc = result.functions.find((f) => f.name === 'GetUserById');
      expect(getUserProc).toBeDefined();
      expect(getUserProc?.type).toBe('stored_procedure');
      expect(getUserProc?.params).toContain('UserId');
    });

    it('should parse CREATE FUNCTION statements', async () => {
      const testFile = path.join(tempDir, 'functions.sql');
      const content = `
        CREATE FUNCTION CalculateTotal(@Price DECIMAL, @Quantity INT)
        RETURNS DECIMAL(10,2)
        AS
        BEGIN
          RETURN @Price * @Quantity;
        END;
      `;
      await fs.writeFile(testFile, content);

      const result = await parseSqlFile(testFile);

      expect(result.functions.length).toBeGreaterThanOrEqual(1);

      const calcFunc = result.functions.find((f) => f.name === 'CalculateTotal');
      expect(calcFunc).toBeDefined();
      expect(calcFunc?.type).toBe('sql_function');
      expect(calcFunc?.returnType).toBeDefined();
      expect(calcFunc?.params.length).toBeGreaterThanOrEqual(2);
    });

    it('should handle mixed SQL statements', async () => {
      const testFile = path.join(tempDir, 'mixed.sql');
      const content = `
        CREATE TABLE Products (
          ProductId INT PRIMARY KEY,
          Name NVARCHAR(200),
          Price DECIMAL(10,2)
        );

        CREATE VIEW ExpensiveProducts AS
        SELECT * FROM Products WHERE Price > 100;

        CREATE PROCEDURE GetExpensiveProducts
        AS
        BEGIN
          SELECT * FROM ExpensiveProducts;
        END;
      `;
      await fs.writeFile(testFile, content);

      const result = await parseSqlFile(testFile);

      expect(result.sqlTables!.length).toBeGreaterThanOrEqual(1);
      expect(result.sqlViews!.length).toBeGreaterThanOrEqual(1);
      expect(result.functions.length).toBeGreaterThanOrEqual(1);
    });
  });
});
