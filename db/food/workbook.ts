import ExcelJS from 'exceljs';
import type { Tabs } from './parse.js';

// Reads an .xlsx export of the sheet (File › Download › Microsoft Excel) into
// one string grid per tab, each cell as the sheet displays it.
export async function readWorkbook(path: string): Promise<Tabs> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  const tabs: Tabs = {};
  for (const sheet of workbook.worksheets) {
    const grid: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) cells.push(row.getCell(c).text ?? '');
      grid.push(cells);
    }
    tabs[sheet.name] = grid;
  }
  return tabs;
}
