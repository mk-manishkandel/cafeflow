const ExcelJS = require('exceljs');
const path = require('path');
const fs = require('fs');
const { getSafeTimezone } = require('./timezone.cjs');
const logger = require('./logger.cjs');

// Built-in Excel templates, one per report schema key (see utils/reportSchemas.cjs).
const DEFAULTS_BASE = path.resolve(__dirname, '..', 'templates', 'defaults');

/**
 * Helper to get text from cell value (handles rich text objects)
 */
function getCellText(value) {
    if (value === null || value === undefined) return '';
    if (typeof value === 'object') {
        if (value.richText) return value.richText.map(rt => rt.text || '').join('');
        if (value.text) return value.text;
        if (value.result !== undefined) return getCellText(value.result);
    }
    return String(value);
}

/**
 * Generates a report buffer (Excel) from the built-in default template.
 * @param {string} schemaKey - Key from REPORT_SCHEMAS (matches templates/defaults/<key>.xlsx)
 * @param {Array<Object>} data - The data to populate the report with
 * @param {Object} context - { username, moduleName }
 * @returns {Promise<Buffer>} - Excel file buffer
 */
async function generateReportBuffer(schemaKey, data, context = {}) {
    const systemTz = getSafeTimezone();
    const now = new Date();

    const templatePath = path.resolve(DEFAULTS_BASE, `${schemaKey}.xlsx`);
    // Guard the path: schemaKey comes from the caller, so verify it stays inside the defaults dir.
    if (!templatePath.startsWith(DEFAULTS_BASE + path.sep)) {
        logger.error(`Path traversal attempt blocked for template schemaKey ${schemaKey}: ${templatePath}`);
        throw new Error('Invalid template path');
    }
    if (!fs.existsSync(templatePath)) {
        throw new Error(`Excel template for ${context.moduleName || schemaKey} is missing (templates/defaults/${schemaKey}.xlsx).`);
    }
    const workbook = new ExcelJS.Workbook();

    const globalVars = {
        'Generated_Date': now.toLocaleDateString('en-US', { timeZone: systemTz }),
        'Generated_Time': now.toLocaleTimeString('en-US', { timeZone: systemTz }),
        'Generated_By': context.username || 'System',
        'Module_Name': context.moduleName || 'System Report',
        'Full_Name': context.fullName || context.name || context.username || '',
        'Target_Period': context.targetPeriod || ''
    };

    await workbook.xlsx.readFile(templatePath);
    const worksheet = workbook.worksheets[0];

    // 1. Process Global Placeholders (Rows 1-8)
    for (let i = 1; i <= 8; i++) {
        const row = worksheet.getRow(i);
        if (!row) continue;
        row.eachCell({ includeEmpty: false }, (cell) => {
            const text = getCellText(cell.value);
            if (!text || typeof text !== 'string') return;
            let newValue = text;
            let changed = false;
            for (const [key, val] of Object.entries(globalVars)) {
                const re = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
                if (re.test(newValue)) {
                    newValue = newValue.replace(re, String(val));
                    changed = true;
                }
            }
            if (changed) cell.value = newValue;
        });
    }

    // 2. Map Columns (Row 9)
    const columnMapping = {};
    const mapRow = worksheet.getRow(9);
    if (mapRow) {
        mapRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
            const text = getCellText(cell.value);
            const match = text.match(/\{\{\s*(.*?)\s*\}\}/);
            if (match && match[1]) columnMapping[colNumber] = match[1];
        });
        // Clear tag row
        mapRow.eachCell({ includeEmpty: false }, (cell) => { cell.value = null; });
        mapRow.commit();
    }

    // 3. Fill Data
    let rowIndex = 9;
    data.forEach(d => {
        const row = worksheet.getRow(rowIndex);
        if (Object.keys(columnMapping).length > 0) {
            for (const [colNum, key] of Object.entries(columnMapping)) {
                if (d[key] !== undefined) row.getCell(parseInt(colNum)).value = d[key];
            }
        } else {
            // Logic fallback: fill sequentially if no tags
            Object.values(d).forEach((val, idx) => {
                row.getCell(idx + 1).value = val;
            });
        }
        row.commit();
        rowIndex++;
    });

    return await workbook.xlsx.writeBuffer();
}

module.exports = { generateReportBuffer };

