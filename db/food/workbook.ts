import ExcelJS from 'exceljs';
import type { Tabs } from './parse.js';

// Reads an .xlsx export of the sheet (File › Download › Microsoft Excel) into
// one string grid per tab, each cell as the sheet displays it.
export async function readWorkbook(path: string): Promise<Tabs> {
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.readFile(path);
  return tabsOf(workbook);
}

export function tabsOf(workbook: ExcelJS.Workbook): Tabs {
  const tabs: Tabs = {};
  for (const sheet of workbook.worksheets) {
    const grid: string[][] = [];
    for (let r = 1; r <= sheet.rowCount; r++) {
      const row = sheet.getRow(r);
      const cells: string[] = [];
      for (let c = 1; c <= sheet.columnCount; c++) cells.push(cellText(row.getCell(c)));
      grid.push(cells);
    }
    tabs[sheet.name] = grid;
  }
  return tabs;
}

// A date typed into the sheet (10/26/2026) arrives as a date cell, whose text
// would be the full JavaScript date in this machine's timezone ("Sun Oct 25
// 2026 17:00:00 GMT-0700"), a day early west of UTC. The file stores the day
// at midnight UTC, so it is read back as YYYY-MM-DD in UTC.
function cellText(cell: ExcelJS.Cell): string {
  if (cell.value instanceof Date) return cell.value.toISOString().slice(0, 10);
  return cell.text ?? '';
}
