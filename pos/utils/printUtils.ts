import { Transaction, DocumentTemplate } from '../types';
import { API_BASE, authenticatedFetch } from '../services/storageService';
import { getAppTimezone } from './dateUtils';
import { getDocumentTemplates } from '../services/setupService';
import logger from './logger';

import { formatCurrency } from './currency';
function escapeHtml(str: string): string {
    return String(str)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}

// Helper to queue print job with idempotency + service_type tracking
const queuePrintJob = async (
    content: any,
    branchId?: string,
    printerId?: string,
    serviceType?: string,
    idempotencyKey?: string
) => {
    try {
        const res = await authenticatedFetch(`${API_BASE}/print/queue`, {
            method: 'POST',
            body: JSON.stringify({
                content,
                branchId,
                printer_id: printerId,
                service_type: serviceType || null,
                idempotency_key: idempotencyKey || null,
            })
        });
        if (!res.ok) {
            const errText = await res.text();
            logger.error('Print Queue Error:', res.status, errText);
            throw new Error('Server returned ' + res.status + ': ' + errText);
        }
        return true;
    } catch (err) {
        logger.error('Failed to queue print job:', err);
        return false;
    }
};

/**
 * Fetch document template by type.
 * Fetches ALL templates of this type (no branch filter) and prioritizes:
 *   1. Branch-specific default template
 *   2. Any default template
 *   3. First available template
 */
const getDocumentTemplate = async (type: string, branchId?: string): Promise<DocumentTemplate | null> => {
    try {
        // Filter by branchId so the server returns only this branch's + global templates.
        // Without this, an admin (null JWT branch) gets all branches' templates, and
        // "any default" could accidentally pick a different branch's default.
        const templates = await getDocumentTemplates(type, branchId);

        if (!templates || templates.length === 0) return null;

        // Priority 1: Branch-specific default
        if (branchId) {
            const branchDefault = templates.find((t: DocumentTemplate) => t.is_default && t.branch_id === branchId);
            if (branchDefault) return branchDefault;
        }

        // Priority 2: Global default (branch_id = null)
        const globalDefault = templates.find((t: DocumentTemplate) => t.is_default && !t.branch_id);
        if (globalDefault) return globalDefault;

        // Priority 3: First available template
        return templates[0];
    } catch (_error) {
        logger.warn('[printUtils] getDocumentTemplate failed:', _error);
    }

    return null;
};

/**
 * Render template with data
 */
const renderTemplate = (templateHtml: string, templateCss: string, data: Record<string, any>): string => {
    // Simple placeholder replacement ({{key}})
    let html = templateHtml;

    // Handle loops {{#items}}...{{/items}}
    const loopPattern = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;
    html = html.replace(loopPattern, (match, arrayName, content) => {
        const arrayData = data[arrayName];
        if (!Array.isArray(arrayData)) return '';

        return arrayData.map(item => {
            let itemContent = content;
            Object.keys(item).forEach(key => {
                const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
                itemContent = itemContent.replace(regex, String(item[key] || ''));
            });
            return itemContent;
        }).join('');
    });

    // Replace simple placeholders
    Object.keys(data).forEach(key => {
        if (!Array.isArray(data[key])) {
            const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
            html = html.replace(regex, String(data[key] || ''));
        }
    });

    // Wrap in complete document
    return `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Print Document</title>
                <style>${templateCss || ''}</style>
            </head>
            <body>
                ${html}
                <script>
                    window.onload = function() {
                        window.focus();
                        window.print();
                    };
                    window.onafterprint = function() {
                        window.close();
                    };
                </script>
            </body>
        </html>
    `;
};

const generateKOTHtml = (transaction: Transaction, branchName: string, displayMop: string, isPOSN: boolean, cashierName: string = 'Admin') => {
    const itemsHtml = transaction.items.map(item => `
        <tr>
            <td class="col-item">${escapeHtml(item.name)}</td>
            <td class="col-qty">${item.quantity}</td>
            <td class="col-amt">${(item.price * item.quantity).toFixed(2)}</td>
        </tr>
    `).join('');

    return `
        <html>
            <head>
                <title>KOT - ${transaction.id.substring(0, 8)}</title>
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <style>
                    * { 
                        box-sizing: border-box; 
                    }
                    body { 
                        font-family: 'Courier New', Courier, monospace; 
                        font-size: 13px;
                        font-weight: 600; /* Bolder text */
                        margin: 0; 
                        padding: 0; 
                        background: white;
                    }
                    .container {
                        /* EXPLICIT WIDTH: 72mm is the safe printable area for 80mm paper */
                        width: 72mm; 
                        max-width: 72mm;
                        margin: 0;
                        padding: 0;
                    }
                    .header { 
                        text-align: center; 
                        margin-bottom: 6px; 
                        border-bottom: 2px dashed #000; 
                        padding-bottom: 6px; 
                    }
                    .kot-title { font-size: 20px; font-weight: bold; margin: 4px 0; }
                    .branch-name { font-size: 16px; font-weight: bold; margin-bottom: 4px; }
                    
                    table { width: 100%; border-collapse: collapse; margin: 8px 0; table-layout: fixed; }
                    th { border-bottom: 1px solid #000; padding-bottom: 4px; font-size: 14px; text-align: left; font-weight: 800; }
                    td { font-size: 14px; padding: 4px 0; vertical-align: top; border-bottom: 0.5px solid #eee; word-wrap: break-word; font-weight: 700; }
                    
                    .col-item { text-align: left; width: 55%; }
                    .col-qty { text-align: center; width: 15%; }
                    .col-amt { text-align: right; width: 30%; }
                    
                    .total-row { border-top: 2px dashed #000; padding-top: 6px; margin-top: 6px; }
                    .footer { 
                        border-top: 1px solid #000;
                        padding-top: 8px;
                        margin-top: 12px;
                        text-align: center;
                        font-size: 12px;
                        padding-bottom: 30px; /* Extra space for cutter */
                    }
                    .flex-between { display: flex; justify-content: space-between; align-items: baseline; }
                    
                    @media print { 
                        @page { size: auto; margin: 0; } 
                        body { margin: 0; padding: 0; } 
                    }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <div class="branch-name">${escapeHtml(branchName)}</div>
                        <div class="kot-title">KOT</div>
                        <div style="font-size: 14px; margin-top: 5px;">Order: <strong>${escapeHtml(transaction.id.substring(0, 8))}</strong></div>
                        <div style="font-size: 12px; margin-top: 2px;">${new Date(transaction.timestamp).toLocaleString('en-US', { timeZone: getAppTimezone() })}</div>
                    </div>
                    <table>
                        <thead>
                            <tr>
                                <th class="col-item">Item</th>
                                <th class="col-qty">Qty</th>
                                <th class="col-amt">Amt</th>
                            </tr>
                        </thead>
                        <tbody>${itemsHtml}</tbody>
                    </table>
                    <div class="total-row">
                        <div class="flex-between" style="font-weight: bold; font-size: 18px;">
                            <span>Total:</span>
                            <span>${formatCurrency(transaction.totalAmount)}</span>
                        </div>
                        <div class="flex-between" style="margin-top: 6px; margin-bottom: 6px; font-size: 14px;">
                            <span>Payment Method:</span>
                            <span style="font-weight: bold;">${escapeHtml(displayMop)}</span>
                        </div>
                    </div>
                    <div class="footer">
                        <div>Type: ${isPOSN ? 'POS-N' : 'Standard'}</div>
                        <div style="margin-top: 4px;">Processed by: <strong>${escapeHtml(cashierName)}</strong></div>
                        <div style="margin-top: 6px; font-size: 14px; font-weight: bold; border: 1px solid #000; padding: 4px; display: inline-block;">*** ORDER CONFIRMED ***</div>
                        <div style="font-size: 12px; margin-top: 14px; margin-bottom: 14px; font-weight: 600;">Printed at ${new Date().toLocaleTimeString()}</div>
                    </div>
                </div>
                <script>
                    window.onload = function() { 
                        window.focus();
                        window.print(); 
                    };
                    window.onafterprint = function() {
                        window.close();
                    };
                </script>
            </body>
        </html>
    `;
};

export const printKOT = async (
    transaction: Transaction,
    mop: string,
    branchName: string,
    mode: 'LOCAL' | 'NETWORK' | 'OFF' = 'NETWORK',
    cashierName: string = 'Admin',
    templateType: 'KOT' | 'BILL' | 'CUSTOM_ORDER' = 'KOT',
    preOpenedWin?: Window | null
): Promise<boolean> => {
    if (mode === 'OFF') return true;

    // Map MOP to user friendly labels
    const mopLabelMap: { [key: string]: string } = {
        'CASH': 'Cash',
        'CREDIT': 'Credit',
        'STAFF': 'Credit',
        'FONEPAY': 'Fonepay',
        'VISA': 'Credit Card',
        'CREDITCARD': 'Credit Card'
    };
    const displayMop = mopLabelMap[mop.toUpperCase()] || mop;
    const isPOSN = transaction.type === 'POS-N' || transaction.staffId === 'POS-N';

    // NETWORK mode: send raw data — server uses hardcoded ESC/POS format (no HTML/CSS)
    if (mode === 'NETWORK') {
        const printContent = {
            type: 'DATA',
            transaction,
            mop,
            branchName
        };
        try {
            return await queuePrintJob(printContent, transaction.branchId, undefined, templateType, null);
        } catch (e) {
            logger.error('Print queue error:', e);
            return false;
        }
    }

    // LOCAL mode: fetch document template and render as HTML for the browser print dialog
    let kotHtml: string;
    const template = await getDocumentTemplate(templateType, transaction.branchId || undefined);
    logger.debug(`[printUtils] templateType=${templateType} branchId=${transaction.branchId} → template=${template ? template.name + ' (id=' + template.id + ')' : 'NULL → hardcoded fallback'}`);

    if (template) {
        const templateData = {
            branchName: branchName,
            orderId: transaction.id.substring(0, 8),
            orderNumber: transaction.orderNumber || '',
            timestamp: new Date(transaction.timestamp).toLocaleString('en-US', { timeZone: getAppTimezone() }),
            staffName: transaction.staffName || '',
            staffId: transaction.staffId || '',
            customerName: transaction.staffName || '',
            consumerId: transaction.consumerId || '',
            items: transaction.items.map(item => ({
                name: item.name,
                quantity: item.quantity,
                price: item.price.toFixed(2),
                itemTotal: (item.price * item.quantity).toFixed(2),
                remarks: item.remarks || ''
            })),
            totalAmount: transaction.totalAmount.toFixed(2),
            subtotal: transaction.totalAmount.toFixed(2),
            tax: '0.00',
            paymentMethod: displayMop,
            orderType: isPOSN ? 'POS-N' : 'Custom Order',
            transactionType: transaction.type || 'CUSTOM',
            cashierName: cashierName,
            printTime: new Date().toLocaleTimeString(),
            date: new Date(transaction.timestamp).toLocaleDateString('en-US', { timeZone: getAppTimezone() }),
            time: new Date(transaction.timestamp).toLocaleTimeString('en-US', { timeZone: getAppTimezone() }),
            eventName: transaction.eventName || '—',
            eventBy: transaction.eventBy || '—',
            itemCount: String(transaction.items.length),
        };
        kotHtml = renderTemplate(template.template_html, template.template_css, templateData);
    } else {
        kotHtml = generateKOTHtml(transaction, branchName, displayMop, isPOSN, cashierName);
    }

    if (preOpenedWin) {
        printInWindow(preOpenedWin, kotHtml);
        return true;
    }
    const win = openPrintWindow();
    if (!win) return false;
    printInWindow(win, kotHtml);
    return true;
};

/**
 * Open a blank print popup immediately — call this SYNCHRONOUSLY from the
 * user-gesture handler BEFORE any awaits so the browser allows window.open().
 * Then call printInWindow(win, html) once you have the HTML.
 */
export const openPrintWindow = (): Window | null => {
    try {
        const win = window.open('', '_blank', 'width=420,height=620');
        if (win) {
            // Show a placeholder so the user sees something while the API loads
            win.document.write('<html><body style="font-family:monospace;display:flex;align-items:center;justify-content:center;height:100vh;margin:0;background:#f8fafc;color:#94a3b8;font-size:14px;">Preparing print…</body></html>');
            win.document.close();
        }
        return win;
    } catch {
        return null;
    }
};

/**
 * Write KOT HTML into a pre-opened popup and trigger the print dialog.
 * - Strips the template's inline <script> block entirely (it calls window.print /
 *   window.close which we handle from the parent at the right moment).
 * - Sets win.onafterprint BEFORE win.print() so the event is never missed.
 */
export const printInWindow = (win: Window, html: string): void => {
    // Remove any <script>…</script> blocks in the HTML so the template's own
    // window.onload / window.onafterprint handlers don't race with ours.
    const safeHtml = html.replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, '');

    win.document.open();
    win.document.write(safeHtml);
    win.document.close();

    // MUST be set BEFORE win.print() — afterprint fires while print() is blocking.
    win.onafterprint = () => win.close();

    win.focus();
    win.print();
};

/**
 * Unified print submission — sends transaction data to the server which:
 *   1. Resolves the configured printer for the service type
 *   2. Fetches + renders the matching document template
 *   3. Queues the job (SERVER mode) or returns HTML (LOCAL mode)
 *
 * Pass a pre-opened window (from openPrintWindow() before any awaits) so the
 * popup is created synchronously during the user-gesture, then filled here.
 * For SERVER mode the window is closed automatically.
 */
export const printDocument = async (
    serviceType: string,
    transaction: Transaction,
    cashierName: string = 'Staff',
    preOpenedWin?: Window | null
): Promise<boolean> => {
    try {
        const res = await authenticatedFetch(`${API_BASE}/print/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ serviceType, transaction, cashierName }),
        });

        if (!res.ok) {
            const err = await res.json().catch(() => ({ error: res.statusText }));
            logger.warn(`printDocument [${serviceType}]:`, err.error || res.statusText);
            preOpenedWin?.close();
            return false;
        }

        const data = await res.json();

        if (data.mode === 'LOCAL' && data.html) {
            if (preOpenedWin) {
                printInWindow(preOpenedWin, data.html);
                return true;
            }
            const win = openPrintWindow();
            if (!win) return false;
            printInWindow(win, data.html);
            return true;
        }
        // NETWORK mode handled server-side, or OFF/no printer configured —
        // close placeholder window; nothing failed on the client.
        preOpenedWin?.close();
        return true;
    } catch (err) {
        logger.error(`printDocument [${serviceType}] error:`, err);
        preOpenedWin?.close();
        return false;
    }
};
