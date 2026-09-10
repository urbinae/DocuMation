/**
 * Simula exactamente el flujo de upload-excel para verificar
 * que analysis.financialData queda con los datos del Excel, no del PDF.
 */
const ExcelJS = require('exceljs');
const path = require('path');
const pdfService = require('../api/lib/pdfService');

const FILE = path.join(__dirname, 'Recibos Sueldos -para prueba.xls.xlsx');

async function test() {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.readFile(FILE);

  const excludedSheets = ['MODELO', 'SICOSS', 'RESUMEN', 'CUSS', 'HOJA6', 'HOJA 6', 'SAC_VAC', 'PARAMETROS'];

  for (const ws of wb.worksheets) {
    const nameUpper = ws.name.trim().toUpperCase();
    if (ws.state === 'hidden' || excludedSheets.includes(nameUpper)) continue;

    // Simular: análisis del PDF (puede extraer netPay parcialmente)
    const fakeAnalysis = {
      financialData: {
        netPay: 1020576,   // extraído del texto del PDF
        grossPay: 0,       // NO extraído (PDF es imagen)
        deductions: 0,     // NO extraído
        basicSalary: 0     // NO extraído
      }
    };

    console.log(`\nHoja: "${ws.name}"`);
    console.log(`  Antes (desde PDF texto):`, fakeAnalysis.financialData);

    // ── LÓGICA DEL FIX ──────────────────────────────────────────────────────
    const excelFinancial = pdfService.extractFinancialDataFromWorksheet(ws);
    if (excelFinancial.grossPay > 0 || excelFinancial.netPay > 0) {
      fakeAnalysis.financialData = excelFinancial;
    }
    // ────────────────────────────────────────────────────────────────────────

    console.log(`  Después (desde Excel):  `, fakeAnalysis.financialData);

    const fd = fakeAnalysis.financialData;
    const allOk = fd.grossPay > 0 && fd.netPay > 0 && fd.deductions > 0 && fd.basicSalary > 0;
    console.log(`  ✓ Los 4 campos tienen valor: ${allOk ? '✅ CORRECTO' : '❌ FALLO'}`);
  }
}

test().catch(err => { console.error(err.message); process.exit(1); });
