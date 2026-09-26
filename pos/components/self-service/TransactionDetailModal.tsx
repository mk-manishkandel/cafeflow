import React from 'react';
import { XCircle, ReceiptText, CreditCard, Printer } from 'lucide-react';
import { Z_INDEX } from '../../constants/zIndex';

import { formatCurrency } from '../../utils/currency';
import { AccessibleModal } from '../ui/AccessibleModal';
interface TransactionDetailModalProps {
    tx: any;
    onClose: () => void;
}

const TransactionDetailModal: React.FC<TransactionDetailModalProps> = ({ tx, onClose }) => {
    if (!tx) return null;

    const items = typeof tx.items === 'string' ? JSON.parse(tx.items) : tx.items;
    
    // Support both snake_case (legacy/self-service) and camelCase (reports)
    const recipientName = tx.recipient_name || tx.consumerName || tx.staffName || 'Unknown';
    const txDate = tx.date || tx.timestamp;
    const paymentMethod = tx.payment_method || tx.paymentMethod || 'N/A';
    const totalAmount = tx.total_amount ?? tx.totalAmount ?? 0;

    const allRemarks = items?.map((item: any) => {
        const match = item.name.match(/^(.*?)\s*\((.*?)\)$/);
        if (match && match[2].trim()) {
            return { itemName: match[1].trim(), text: match[2].trim() };
        }
        return null;
    }).filter(Boolean) || [];

    const handlePrint = () => {
        const printItems = items?.map((item: any) => {
            const match = item.name.match(/^(.*?)\s*\((.*?)\)$/);
            const name = match ? match[1].trim() : item.name;
            return { name, price: item.price || 0, quantity: item.quantity || 1 };
        }) || [];

        const remarksHtml = allRemarks.length > 0
            ? `<div class="remarks"><p class="label">Remarks</p><ul>${allRemarks.map((r: any) => `<li>${r.text}</li>`).join('')}</ul></div>`
            : '';

        const rowsHtml = printItems.map((item: any) => `
            <tr>
                <td>${item.name}</td>
                <td style="text-align:center">x${item.quantity}</td>
                <td style="text-align:right">${formatCurrency((item.price * item.quantity))}</td>
            </tr>
        `).join('');

        const html = `<!DOCTYPE html>
<html>
<head>
<title>Order Details - ${tx.id}</title>
<style>
  body { font-family: Arial, sans-serif; font-size: 13px; color: #111; margin: 24px; }
  h1 { font-size: 18px; margin-bottom: 2px; }
  .ref { font-size: 10px; color: #666; margin-bottom: 16px; }
  .meta { display: grid; grid-template-columns: 1fr 1fr; gap: 10px; margin-bottom: 16px; }
  .meta-item .label { font-size: 9px; text-transform: uppercase; color: #888; letter-spacing: 0.05em; }
  .meta-item .value { font-weight: bold; }
  .remarks { background: #fffbeb; border-left: 3px solid #f59e0b; padding: 10px 12px; margin-bottom: 16px; }
  .remarks .label { font-size: 9px; text-transform: uppercase; color: #b45309; font-weight: bold; margin-bottom: 6px; }
  .remarks ul { margin: 0; padding-left: 16px; }
  .remarks li { margin-bottom: 3px; }
  table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  th { font-size: 10px; text-transform: uppercase; color: #888; border-bottom: 1px solid #ddd; padding: 6px 8px; text-align: left; }
  td { padding: 7px 8px; border-bottom: 1px solid #f0f0f0; }
  .total-row { border-top: 2px solid #111; font-weight: bold; font-size: 15px; display: flex; justify-content: space-between; padding-top: 10px; }
  @media print { body { margin: 10px; } }
</style>
</head>
<body>
<h1>Order Details</h1>
<p class="ref">Ref: ${tx.id}</p>
<div class="meta">
  <div class="meta-item"><div class="label">Customer</div><div class="value">${recipientName}</div></div>
  <div class="meta-item"><div class="label">Date &amp; Time</div><div class="value">${txDate ? new Date(txDate).toLocaleString() : 'Unknown'}</div></div>
  <div class="meta-item"><div class="label">Payment Method</div><div class="value">${paymentMethod}</div></div>
  <div class="meta-item"><div class="label">Status</div><div class="value">${tx.status || 'N/A'}</div></div>
</div>
${remarksHtml}
<table>
<thead><tr><th>Item</th><th style="text-align:center">Qty</th><th style="text-align:right">Total</th></tr></thead>
<tbody>${rowsHtml}</tbody>
</table>
<div class="total-row"><span>Total Amount</span><span>${formatCurrency(totalAmount)}</span></div>
</body></html>`;

        const win = window.open('', '_blank', 'width=600,height=800');
        if (win) {
            win.document.write(html);
            win.document.close();
            win.focus();
            win.print();
        }
    };

    return (
        <AccessibleModal
            isOpen
            onClose={onClose}
            hideHeader
            ariaLabelledBy="tx-modal-title"
            closeOnOverlayClick={false}
            overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-in fade-in duration-100"
            overlayStyle={{ zIndex: Z_INDEX.MODAL_BACKDROP }}
            panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-lg overflow-hidden animate-in zoom-in-95 duration-100 flex flex-col max-h-[80vh]"
            panelStyle={{ zIndex: Z_INDEX.MODAL_CONTENT }}
            bodyClassName="contents"
        >
                    <div className="p-5 sm:p-6 border-b border-white/10 flex items-center justify-between bg-slate-900 text-white shrink-0">
                        <div className="flex items-center gap-4">
                            <div className="w-10 h-10 bg-indigo-500/20 text-indigo-400 rounded-xl flex items-center justify-center shrink-0">
                                <ReceiptText size={20} aria-hidden="true" />
                            </div>
                            <div className="min-w-0">
                                <h3 id="tx-modal-title" className="text-lg font-black leading-none truncate">Order Details</h3>
                                <p className="text-[10px] text-indigo-300 font-bold uppercase tracking-widest mt-1 truncate">Ref: {tx.id}</p>
                            </div>
                        </div>
                        <button
                            onClick={onClose}
                            className="p-2 hover:bg-white/10 rounded-lg transition-colors text-white/60 hover:text-white shrink-0"
                            aria-label="Close modal"
                        >
                            <XCircle size={24} aria-hidden="true" />
                        </button>
                    </div>

                    <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-8 custom-scrollbar bg-slate-50/30">
                        <div className="grid grid-cols-2 gap-3 sm:gap-4">
                            <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Customer</p>
                                <p className="font-bold text-slate-900 truncate" title={recipientName}>{recipientName}</p>
                            </div>
                            <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Date & Time</p>
                                <p className="font-bold text-slate-900">
                                    {txDate ? new Date(txDate).toLocaleString() : 'Unknown'}
                                </p>
                            </div>
                            <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Payment Method</p>
                                <div className="flex items-center gap-2 font-bold text-slate-900">
                                    <div className="w-6 h-6 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                        <CreditCard size={12} />
                                    </div>
                                    <span className="truncate">{paymentMethod}</span>
                                </div>
                            </div>
                            <div className="p-4 bg-white rounded-xl border border-slate-100 shadow-sm">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1.5">Status</p>
                                <span className={`inline-flex px-2.5 py-1 rounded-full text-[10px] font-black uppercase tracking-wider ${tx.status === 'COMPLETED' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700'}`}>
                                    {tx.status}
                                </span>
                            </div>
                        </div>

                        {allRemarks.length > 0 && (
                            <div className="p-4 bg-amber-50 rounded-xl border border-amber-100 shadow-sm relative overflow-hidden">
                                <div className="absolute top-0 left-0 w-1 h-full bg-amber-400"></div>
                                <p className="text-[10px] font-black text-amber-600 uppercase tracking-widest mb-2">Remarks</p>
                                <ul className="space-y-1.5">
                                    {allRemarks.map((remark: any, idx: number) => (
                                        <li key={remark.id ?? remark.text ?? idx} className="text-sm text-amber-900 flex items-start gap-2">
                                            <span className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-1.5 shrink-0"></span>
                                            <span>{remark.text}</span>
                                        </li>
                                    ))}
                                </ul>
                            </div>
                        )}

                        <div className="space-y-4">
                            <div className="flex items-center justify-between px-1">
                                <h4 className="text-xs font-black text-slate-400 uppercase tracking-widest">Order Items</h4>
                                <span className="text-[10px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                                    {items?.length || 0} Items
                                </span>
                            </div>
                            <div className="border border-slate-100 rounded-2xl overflow-hidden shadow-sm bg-white">
                                <table className="w-full text-left text-sm border-collapse">
                                    <thead className="bg-slate-50 border-b border-slate-200">
                                        <tr>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Item</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-center">Qty</th>
                                            <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Total</th>
                                        </tr>
                                    </thead>
                                    <tbody className="divide-y divide-slate-50">
                                        {items?.map((item: any, idx: number) => {
                                            let displayName = item.name;
                                            const match = item.name.match(/^(.*?)\s*\((.*?)\)$/);
                                            if (match) {
                                                displayName = match[1].trim();
                                            }

                                            return (
                                                <tr key={item.id ?? item.name ?? idx} className="hover:bg-slate-50/50 transition-colors group">
                                                    <td className="px-5 py-4">
                                                        <p className="font-bold text-slate-700 group-hover:text-indigo-600 transition-colors">{displayName}</p>
                                                        <p className="text-[10px] text-slate-400 font-medium mt-0.5">{formatCurrency((item.price || 0))} / unit</p>
                                                    </td>
                                                    <td className="px-5 py-4 text-center">
                                                        <span className="inline-block px-2 py-1 bg-slate-50 text-slate-600 rounded-lg font-black text-xs">
                                                            x{item.quantity || 1}
                                                        </span>
                                                    </td>
                                                    <td className="px-5 py-4 text-right font-black text-indigo-600">
                                                        {formatCurrency(((item.price || 0) * (item.quantity || 1)))}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        </div>
                    </div>

                    <div className="p-6 bg-slate-900 border-t border-white/10 flex items-center justify-between shrink-0">
                        <div>
                            <p className="text-[10px] font-black text-indigo-400 uppercase tracking-[0.2em] mb-1">Total Amount</p>
                            <p className="text-2xl font-black text-white tracking-tighter">{formatCurrency(totalAmount)}</p>
                        </div>
                        <div className="flex gap-2">
                            <button
                                onClick={handlePrint}
                                className="px-4 py-3 bg-slate-700 hover:bg-slate-600 text-white rounded-xl font-bold transition-all active:scale-95 flex items-center gap-2 whitespace-nowrap"
                                title="Print Order Details"
                            >
                                <Printer size={16} />
                                Print
                            </button>
                            <button
                                onClick={onClose}
                                className="px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl font-bold transition-all shadow-lg shadow-indigo-600/20 active:scale-95 whitespace-nowrap"
                            >
                                Close Details
                            </button>
                        </div>
                    </div>
        </AccessibleModal>
    );
};

export default React.memo(TransactionDetailModal);
