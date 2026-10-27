import ExcelJS from 'exceljs';
import { describe, expect, it } from 'vitest';
import { tabsOf } from '../db/food/workbook.js';

// Reading a sheet's .xlsx export: every cell as text, and a date typed into
// the sheet as YYYY-MM-DD (what the importers' reviewed_on checks expect).

describe('reading a workbook', () => {
  it('reads a date cell as its day, whatever the machine’s timezone', () => {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet('Principles');
    sheet.addRow(['principle_id', 'reviewed_on', 'count', 'note']);
    // As the export stores 10/26/2026: midnight UTC.
    sheet.addRow(['PR1', new Date(Date.UTC(2026, 9, 26)), 3, 'Like increases like.']);
    sheet.addRow(['PR2', '2026-10-27', '', '']);
    expect(tabsOf(workbook).Principles).toEqual([
      ['principle_id', 'reviewed_on', 'count', 'note'],
      ['PR1', '2026-10-26', '3', 'Like increases like.'],
      ['PR2', '2026-10-27', '', ''],
    ]);
  });
});
