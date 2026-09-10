/**
 * Script de inspección COMPLETA del Excel de prueba.
 * Solo imprime las primeras 50 filas de cada hoja.
 */
const ExcelJS = require('exceljs');
const path = require('path');

const FILE = path.join(__dirname, 'Recibos Sueldos -para prueba.xls.xlsx');

async function inspect() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  console.log(`\nHojas: ${wb.worksheets.map(ws => ws.name).join(' | ')}\n`);

  for (const ws of wb.worksheets) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`HOJA: "${ws.name}"  state=${ws.state}`);
    console.log('='.repeat(80));
    console.log(`${'FILA'.padEnd(6)} ${'COL'.padEnd(6)} ${'LETRA'.padEnd(6)} VALOR`);
    console.log('-'.repeat(80));

    let printed = 0;
    ws.eachRow({ includeEmpty: false }, (row, rowNum) => {
      if (rowNum > 160) return; // limitar salida
      row.eachCell({ includeEmpty: false }, (cell, colNum) => {
        let val = '';
        if (cell.value == null) return;
        if (cell.text != null && cell.text !== '') {
          val = cell.text;
        } else if (typeof cell.value === 'number') {
          val = String(cell.value);
        } else if (typeof cell.value === 'object') {
          if (cell.value.result != null) val = String(cell.value.result);
          else if (Array.isArray(cell.value.richText)) val = cell.value.richText.map(rt => rt.text || '').join('');
          else if (cell.value.text != null) val = String(cell.value.text);
          else val = JSON.stringify(cell.value);
        } else {
          val = String(cell.value);
        }
        if (!val.trim()) return;
        const colLetter = ws.getColumn(colNum).letter || '';
        console.log(`${String(rowNum).padEnd(6)} ${String(colNum).padEnd(6)} ${colLetter.padEnd(6)} ${val.substring(0, 100)}`);
      });
    });
    console.log();
  }
}

inspect().catch(err => { console.error('Error:', err.message); process.exit(1); });
