import ExcelJS from 'exceljs';

const ctx: any = self;

ctx.onmessage = async (e: any) => {
    const { data, statementEntity, type, startDate, endDate, generatedOn } = e.data;

    try {
        const workbook = new ExcelJS.Workbook();
        const worksheet = workbook.addWorksheet("Statement");

        // Header info
        worksheet.mergeCells('A1:E1');
        const titleCell = worksheet.getCell('A1');
        titleCell.value = "ACCOUNT STATEMENT";
        titleCell.font = { bold: true, size: 14 };
        titleCell.alignment = { horizontal: 'center' };

        worksheet.addRow(["Name:", statementEntity.name]);
        worksheet.addRow(["Email:", statementEntity.email]);
        worksheet.addRow([type === 'STAFF' ? "Department:" : "Category:", statementEntity.department || statementEntity.category || '-']);
        worksheet.addRow(["Period:", `${startDate || 'All Time'} to ${endDate || 'Present'}`]);
        worksheet.addRow(["Generated On:", generatedOn]);
        worksheet.addRow([]); // Empty row

        // Table headers
        const tableHeaders = ["Date", "Description", "Branch", "Debit (Rs)", "Credit (Rs)"];
        const headerRow = worksheet.addRow(tableHeaders);
        headerRow.font = { bold: true };

        // Add data
        data.forEach((d: any) => {
            worksheet.addRow([d.Date, d.Description, d.Branch, d['Debit (Rs)'], d['Credit (Rs)']]);
        });

        // Write buffer
        const buffer = await workbook.xlsx.writeBuffer();
        if (buffer instanceof ArrayBuffer) {
            ctx.postMessage({ buffer }, [buffer]);
        } else {
            // If it's a Node Buffer or Uint8Array, we might need to get the buffer
            const arrayBuffer = (buffer as any).buffer || buffer;
            ctx.postMessage({ buffer: arrayBuffer }, [arrayBuffer]);
        }
    } catch (err: any) {
        ctx.postMessage({ error: err.message });
    }
};
