'use strict';

const { printer: ThermalPrinter, types: Types } = require('node-thermal-printer');
const logger = require('./logger.cjs');

const CONNECT_TIMEOUT_MS = 5000;

// ---------------------------------------------------------------------------
// Connect to a network ESC/POS printer via TCP. Throws if unreachable.
// ---------------------------------------------------------------------------
const connectPrinter = async (ip_address, port = 9100, printer_type = 'THERMAL_80MM') => {
    const printer = new ThermalPrinter({
        type: Types.EPSON,
        interface: `tcp://${ip_address}:${port}`,
        characterSet: 'PC437_USA',
        removeSpecialCharacters: false,
        width: printer_type === 'THERMAL_58MM' ? 32 : 46,
        options: { timeout: CONNECT_TIMEOUT_MS },
    });
    const connected = await printer.isPrinterConnected();
    if (!connected) throw new Error(`Cannot connect to printer at ${ip_address}:${port}`);
    return printer;
};

// ---------------------------------------------------------------------------
// HTML → ESC/POS converter
//
// Designed for templates that use semantic HTML attributes for layout:
//   <center>          → alignCenter
//   <b> / <strong>    → bold on/off
//   <hr>              → drawLine()
//   <br>              → newline
//   <h1>              → double width+height, centered, bold
//   <h2>              → double height, centered, bold
//   <h3>              → bold
//   <table>           → tableCustom() rows, widths from <td width="x%">
//   align="right"     → cell right-alignment
//   align="center"    → cell center-alignment
//
// CSS font-size is mapped to ESC/POS size levels:
//   ≥ 17px (or 1.3em+) → setTextSize(1,1)  double width+height  (\x06)
//   14–16px (or 1.1em+) → setTextSize(0,1)  double height only   (\x05)
//   ≤ 13px              → normal
//
// The <style> block is stripped entirely — CSS is only for browser rendering.
// ---------------------------------------------------------------------------
const htmlToEscPos = (printer, renderedHtml) => {
    // ── 0. Parse CSS class rules → build center/bold/size class sets ─────────
    // Templates use CSS classes (e.g. class="branch-name") for all formatting.
    // We extract which class names carry text-align:center, font-weight:bold,
    // or font-size so that leaf elements can be wrapped before conversion.
    const centerClasses = new Set();
    const boldClasses   = new Set();
    const sizeClassMap  = new Map(); // className → 1 (double-height) | 2 (double w+h)

    const parseFontSizePx = (val) => {
        const n = parseFloat(val);
        if (/em$/i.test(val) || /rem$/i.test(val)) return n * 16;
        if (/pt$/i.test(val)) return n * 1.333;
        return n; // assume px
    };

    const styleSrc = (renderedHtml.match(/<style\b[^>]*>([\s\S]*?)<\/style>/gi) || []).join('\n');
    const ruleRe   = /\.([a-z0-9_-]+)\s*\{([^}]+)\}/gi;
    let rm;
    while ((rm = ruleRe.exec(styleSrc)) !== null) {
        if (/text-align\s*:\s*center/i.test(rm[2]))               centerClasses.add(rm[1]);
        if (/font-weight\s*:\s*(bold|[7-9]\d\d)/i.test(rm[2]))    boldClasses.add(rm[1]);
        const fsm = rm[2].match(/font-size\s*:\s*([^;]+)/i);
        if (fsm) {
            const px = parseFontSizePx(fsm[1].trim());
            if      (px >= 17) sizeClassMap.set(rm[1], 2);
            else if (px >= 14) sizeClassMap.set(rm[1], 1);
        }
    }

    // ── 1. Strip <script> and <style> ────────────────────────────────────────
    let html = renderedHtml
        .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '')
        .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, '');

    const decode = s => s
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(n));

    // ── 2. Extract <table> blocks, replace with placeholders ─────────────────
    const tableBlocks = [];
    html = html.replace(/<table[^>]*>([\s\S]*?)<\/table>/gi, (_, tableContent) => {
        tableBlocks.push(tableContent);
        return `\x03TABLE_${tableBlocks.length - 1}\x03`;
    });

    // Parse a table block into rows of cells
    const parseTable = (tableContent) => {
        const rows = [];
        const trRe = /<tr[^>]*>([\s\S]*?)<\/tr>/gi;
        let trM;
        while ((trM = trRe.exec(tableContent)) !== null) {
            const rowHtml = trM[1];
            const cells = [];
            const tdRe = /<(t[dh])([^>]*)>([\s\S]*?)<\/t[dh]>/gi;
            let tdM;
            let rowIsHeader = false;
            while ((tdM = tdRe.exec(rowHtml)) !== null) {
                const isHeader = tdM[1].toLowerCase() === 'th';
                if (isHeader) rowIsHeader = true;
                const attrStr = tdM[2];
                const cellHtml = tdM[3];
                // Detect bold inside cell (<b> or <strong> tags)
                const cellBold = isHeader || /<(?:b|strong)\b/i.test(cellHtml);
                const cellText = decode(cellHtml.replace(/<[^>]+>/g, '').trim());

                const wm = attrStr.match(/\bwidth="([^"]+)"/i);
                const width = wm ? parseFloat(wm[1]) / 100 : null;

                const am = attrStr.match(/\balign="([^"]+)"/i)
                    || attrStr.match(/text-align\s*:\s*(\w+)/i);
                const align = am ? am[1].toUpperCase() : 'LEFT';

                cells.push({ text: cellText, width, align, isHeader, bold: cellBold });
            }
            if (cells.length) rows.push({ cells, isHeader: rowIsHeader });
        }
        return rows;
    };

    // ── 2.5. Wrap CSS-styled leaf elements with semantic <center>/<b> tags ─────
    // Leaf element = element whose content contains no child tags (safe for a
    // single-pass regex). Complex containers (header, footer div wrappers) are
    // skipped here but their leaf children are matched on the same pass.
    html = html.replace(
        /<([a-z][a-z0-9]*)\b([^>]*)>([^<]*)<\/\1>/gi,
        (match, tag, attrStr, textContent) => {
            if (!textContent.trim()) return match;

            const clsM   = attrStr.match(/\bclass="([^"]*)"/i);
            const styleM = attrStr.match(/\bstyle="([^"]*)"/i);
            const classes = clsM ? clsM[1].split(/\s+/) : [];
            const style   = styleM ? styleM[1] : '';

            const wantCenter = classes.some(c => centerClasses.has(c))
                            || /text-align\s*:\s*center/i.test(style);
            const wantBold   = classes.some(c => boldClasses.has(c))
                            || /font-weight\s*:\s*(bold|[7-9]\d\d)/i.test(style);

            let sizeLevel = 0;
            for (const c of classes) {
                const sl = sizeClassMap.get(c);
                if (sl !== undefined) sizeLevel = Math.max(sizeLevel, sl);
            }
            const fsmInline = style.match(/font-size\s*:\s*([^;]+)/i);
            if (fsmInline) {
                const px = parseFontSizePx(fsmInline[1].trim());
                if      (px >= 17) sizeLevel = Math.max(sizeLevel, 2);
                else if (px >= 14) sizeLevel = Math.max(sizeLevel, 1);
            }

            if (!wantCenter && !wantBold && sizeLevel === 0) return match;

            let inner = textContent;
            if (wantBold)        inner = `<b>${inner}</b>`;
            if (wantCenter)      inner = `<center>${inner}</center>`;
            if (sizeLevel === 2) inner = `\x06${inner}\x06`;
            else if (sizeLevel === 1) inner = `\x05${inner}\x05`;
            return `<${tag}>${inner}</${tag}>`;
        }
    );

    // ── 3. Convert remaining HTML to a token stream ───────────────────────────
    // Heading tags are converted to size+align+bold control sequences first,
    // then structural tags become newlines, remaining tags are stripped.
    //   \x01 = center toggle   \x02 = bold toggle
    //   \x04 = drawLine        \x05 = size-1 toggle (double height)
    //   \x06 = size-2 toggle   (double width+height)
    html = html
        .replace(/<h1\b[^>]*>/gi,  '\n\x06\x01\x02')  // h1 open: size-2, center, bold
        .replace(/<\/h1>/gi,        '\x02\x01\x06\n')  // h1 close: undo bold, center, size
        .replace(/<h2\b[^>]*>/gi,  '\n\x05\x01\x02')  // h2 open: size-1, center, bold
        .replace(/<\/h2>/gi,        '\x02\x01\x05\n')  // h2 close: undo bold, center, size
        .replace(/<h3\b[^>]*>/gi,  '\n\x02')           // h3 open: bold
        .replace(/<\/h3>/gi,        '\x02\n')           // h3 close: undo bold
        .replace(/<hr[^>]*>/gi, '\n\x04\n')
        .replace(/<br\s*\/?>/gi, '\n')
        .replace(/<center[^>]*>/gi, '\x01')
        .replace(/<\/center>/gi, '\x01\n')
        .replace(/<(?:b|strong)[^>]*>/gi, '\x02')
        .replace(/<\/(?:b|strong)>/gi, '\x02')
        .replace(/<\/?(div|p|h[4-6]|header|footer|section|li)[^>]*>/gi, '\n')
        .replace(/<[^>]+>/g, '');                      // strip remaining tags

    html = decode(html);

    // Split into lines, trim, drop empties
    const rawLines = html.split('\n').map(l => l.trim()).filter(l => l.length > 0);

    // ── 4. Emit ESC/POS commands ─────────────────────────────────────────────
    // Body text uses normal size (1×1). Enlarging body text either wraps lines
    // (double-width) or lengthens the receipt (double-height) — both undesirable.
    // size-2 headings (h1 / CSS ≥17px) use double width+height (1,1).
    let bold      = false;
    let centered  = false;
    let sizeLevel = 0;            // 0=base (double-height), 2=double w+h
    let firstHeadingDone = false; // fallback: first centered+bold → double w+h

    for (const raw of rawLines) {
        // Table placeholder — always printed at normal size so column maths hold.
        if (/^\x03TABLE_(\d+)\x03$/.test(raw)) {
            const idx = parseInt(raw.match(/\x03TABLE_(\d+)\x03/)[1]);
            const rows = parseTable(tableBlocks[idx] || '');

            for (const row of rows) {
                const { cells, isHeader } = row;
                // Distribute widths evenly if not specified
                const hasWidths = cells.every(c => c.width !== null);
                if (!hasWidths) {
                    const w = 1 / cells.length;
                    cells.forEach(c => { if (c.width === null) c.width = w; });
                }
                // Normalise so widths sum to 1.0
                const total = cells.reduce((s, c) => s + (c.width || 0), 0);
                if (total > 0 && Math.abs(total - 1) > 0.01) {
                    cells.forEach(c => { c.width = (c.width || 0) / total; });
                }
                const rowBold = isHeader || cells.some(c => c.bold);
                printer.setTextNormal();
                printer.alignLeft();
                printer.bold(rowBold);
                printer.tableCustom(cells.map(c => ({
                    text: c.text,
                    align: c.align,
                    width: c.width,
                })));
                if (isHeader) {
                    printer.bold(false);
                    printer.drawLine();
                }
            }
            printer.bold(false);
            continue;
        }

        // Divider
        if (raw === '\x04') {
            printer.bold(false);
            printer.drawLine();
            bold = false;
            centered = false;
            continue;
        }

        // Scan left-to-right: toggle state on each control char.
        // Capture the state at the first real text character — that is the
        // formatting to apply to this line.  Update global carry-over state
        // to whatever the final toggle position is after the whole line.
        let isCentered  = centered;
        let isBold      = bold;
        let isSizeLevel = sizeLevel;
        let textSeen    = false;
        let scanCenter  = centered;
        let scanBold    = bold;
        let scanSize    = sizeLevel;
        for (let ci = 0; ci < raw.length; ci++) {
            const ch = raw[ci];
            if      (ch === '\x01') { scanCenter = !scanCenter; }
            else if (ch === '\x02') { scanBold   = !scanBold;   }
            else if (ch === '\x05') { scanSize   = scanSize === 1 ? 0 : 1; }
            else if (ch === '\x06') { scanSize   = scanSize === 2 ? 0 : 2; }
            else if (ch !== '\x03' && ch !== '\x04') {
                if (!textSeen) { isCentered = scanCenter; isBold = scanBold; isSizeLevel = scanSize; textSeen = true; }
            }
        }
        centered  = scanCenter;
        bold      = scanBold;
        sizeLevel = scanSize;

        // Extract clean text
        const text = raw.replace(/[\x01\x02\x03\x04\x05\x06]/g, '').trim();
        if (!text) continue;

        // size-2 (h1 / ≥17px) → double w+h; everything else → double height.
        // Legacy fallback: first centered+bold line (branch name) gets double w+h
        // even on old templates that don't use heading tags or font-size classes.
        let applySize = isSizeLevel;
        if (applySize < 2 && isBold && isCentered && !firstHeadingDone) {
            applySize = 2;
        }

        if (isCentered) printer.alignCenter(); else printer.alignLeft();
        if (applySize === 2) printer.setTextSize(1, 1);  // double w+h for h1
        else                 printer.setTextNormal();    // normal size for body text
        if (isBold) printer.bold(true); else printer.bold(false);
        printer.println(text);
        if (applySize === 2) {
            if (!firstHeadingDone) firstHeadingDone = true;
            printer.setTextNormal();                     // reset after h1
        }
    }

    printer.bold(false);
    printer.setTextNormal();
    printer.alignLeft();
};

// ---------------------------------------------------------------------------
// Shared helpers for the hardcoded fallback format
// ---------------------------------------------------------------------------
const printHeader = (printer, branchName, title) => {
    printer.alignCenter();
    printer.bold(true);
    printer.setTextSize(1, 1);
    printer.println(branchName || 'CafeFlow');
    printer.bold(false);
    printer.setTextNormal();
    printer.println(title);
    printer.drawLine();
};

const printItems = (printer, items = []) => {
    printer.alignLeft();
    printer.tableCustom([
        { text: 'Item',  align: 'LEFT',   width: 0.55 },
        { text: 'Qty',   align: 'CENTER', width: 0.15 },
        { text: 'Amt',   align: 'RIGHT',  width: 0.30 },
    ]);
    printer.drawLine();
    for (const item of items) {
        printer.tableCustom([
            { text: String(item.name     || ''), align: 'LEFT',   width: 0.55 },
            { text: String(item.quantity || ''), align: 'CENTER', width: 0.15 },
            { text: String(item.itemTotal|| ''), align: 'RIGHT',  width: 0.30 },
        ]);
        if (item.remarks) printer.println(`  > ${item.remarks}`);
    }
    printer.drawLine();
};

const printTotal = (printer, totalAmount, paymentMethod) => {
    printer.bold(true);
    printer.tableCustom([
        { text: 'TOTAL',              align: 'LEFT',  width: 0.55 },
        { text: '',                   align: 'CENTER',width: 0.15 },
        { text: `Rs. ${totalAmount}`, align: 'RIGHT', width: 0.30 },
    ]);
    printer.bold(false);
    if (paymentMethod) printer.println(`Payment : ${paymentMethod}`);
};

const printFooter = (printer, printTime) => {
    printer.drawLine();
    printer.alignCenter();
    printer.println('*** ORDER CONFIRMED ***');
    printer.println(`Printed: ${printTime}`);
    printer.cut({ verticalTabAmount: 1 });
};

// ---------------------------------------------------------------------------
// Print a receipt/KOT directly to a network ESC/POS printer via TCP.
//
// printerConfig : { ip_address, port, printer_type }
// data          : structured transaction data (prepareTransactionData result)
// serviceType   : KOT | RECEIPT | BILL | CUSTOM_ORDER | ...
// templateHtml  : (optional) pre-rendered HTML from document_templates.
//                 When provided, the HTML→ESC/POS converter drives output.
//                 When null, falls back to hardcoded format per serviceType.
// ---------------------------------------------------------------------------
const printViaNetwork = async (printerConfig, data, serviceType, templateHtml = null) => {
    const { ip_address, port = 9100, printer_type = 'THERMAL_80MM' } = printerConfig;
    if (!ip_address) throw new Error('Printer IP address not configured');

    const printer = await connectPrinter(ip_address, port, printer_type);

    if (templateHtml) {
        // ── Template-driven output ────────────────────────────────────────────
        logger.info(`printViaNetwork [${serviceType}] templateHtml preview: ${templateHtml.substring(0, 300).replace(/\n/g, '↵')}`);
        htmlToEscPos(printer, templateHtml);
        printer.cut({ verticalTabAmount: 1 });
    } else {
        // ── Hardcoded fallback (when no document template is configured) ──────
        const titles = {
            KOT: 'KOT',
            RECEIPT: 'RECEIPT', BILL: 'BILL',
            CUSTOM_ORDER: 'CUSTOM ORDER', INVOICE: 'INVOICE', PAYOUT: 'PAYOUT',
        };
        const title = titles[serviceType] || serviceType;

        if (serviceType === 'CUSTOM_ORDER') {
            printHeader(printer, data.branchName, title);
            printer.alignLeft();
            if (data.eventName && data.eventName !== '—') printer.println(`Event    : ${data.eventName}`);
            if (data.eventBy   && data.eventBy   !== '—') printer.println(`By       : ${data.eventBy}`);
            if (data.cashierName) printer.println(`Staff    : ${data.cashierName}`);
            if (data.customerName && data.customerName !== 'Guest') printer.println(`Customer : ${data.customerName}`);
            printer.println(`Date     : ${data.timestamp}`);
            printer.drawLine();
            printItems(printer, data.items);
            printTotal(printer, data.totalAmount, null);
            printFooter(printer, data.printTime);
        } else if (serviceType === 'BILL') {
            printHeader(printer, data.branchName, title);
            printer.alignLeft();
            if (data.orderId)      printer.println(`Ref      : ${data.orderId}`);
            if (data.customerName && data.customerName !== 'Guest') printer.println(`Customer : ${data.customerName}`);
            printer.println(`Date     : ${data.timestamp}`);
            if (data.cashierName)  printer.println(`By       : ${data.cashierName}`);
            printer.drawLine();
            printItems(printer, data.items);
            printTotal(printer, data.totalAmount, data.paymentMethod);
            printFooter(printer, data.printTime);
        } else {
            // KOT, RECEIPT, and everything else
            printHeader(printer, data.branchName, title);
            printer.alignLeft();
            if (data.orderId)     printer.println(`Order    : ${data.orderId}`);
            if (data.customerName && data.customerName !== 'Guest') printer.println(`Customer : ${data.customerName}`);
            if (data.orderNumber) printer.println(`#        : ${data.orderNumber}`);
            printer.println(`Date     : ${data.timestamp}`);
            if (data.cashierName) printer.println(`By       : ${data.cashierName}`);
            printer.drawLine();
            printItems(printer, data.items);
            printTotal(printer, data.totalAmount, data.paymentMethod);
            printFooter(printer, data.printTime);
        }
    }

    await printer.execute();
    printer.clear();
    logger.info(`networkPrinter: printed ${serviceType} order=${data.orderId} → ${ip_address}:${port} (template=${!!templateHtml})`);
};

module.exports = { printViaNetwork };
