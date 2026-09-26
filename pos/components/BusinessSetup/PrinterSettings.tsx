import React, { useState, useCallback } from 'react';
import {
    Printer, Plus, Pencil, Trash2, Wifi, WifiOff, X,
    CheckCircle, AlertCircle, Loader2, ChevronDown, ChevronUp,
    RefreshCw, Network
} from 'lucide-react';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import { useUI } from '../ui/UIContext';
import { CustomSelect } from '../shared/CustomSelect';
import { Z_INDEX } from '../../constants/zIndex';
import { AccessibleModal } from '../ui/AccessibleModal';
import {
    usePrinters,
    SERVICE_TYPES,
    PRINTER_TYPES,
    type Printer as PrinterType,
    type PrinterFormData,
    type Branch,
} from '../../hooks/usePrinters';

// ─────────────────────────────────────────────────────────────────────────────
// Service-type badge colour map
// ─────────────────────────────────────────────────────────────────────────────
const SERVICE_COLORS: Record<string, string> = {
    KOT:          'bg-orange-100 text-orange-700 border-orange-200',
    BILL:         'bg-green-100 text-green-700 border-green-200',
    RECEIPT:      'bg-indigo-100 text-indigo-700 border-indigo-200',
    CUSTOM_ORDER: 'bg-teal-100 text-teal-700 border-teal-200',
    INVOICE:      'bg-blue-100 text-blue-700 border-blue-200',
    PAYOUT:       'bg-violet-100 text-violet-700 border-violet-200',
};

// ─────────────────────────────────────────────────────────────────────────────
// Printer form modal
// ─────────────────────────────────────────────────────────────────────────────
interface PrinterFormModalProps {
    printer: PrinterType | null;  // null = create
    isMainBranch: boolean;
    branches: Branch[];
    onSave: (data: PrinterFormData) => Promise<void>;
    onClose: () => void;
}

const EMPTY_FORM: PrinterFormData = {
    name: '',
    description: '',
    printer_type: 'THERMAL_80MM',
    mode: 'OFF',
    ip_address: '',
    port: 9100,
    is_active: true,
    sort_order: 0,
    service_types: [],
};

const PrinterFormModal: React.FC<PrinterFormModalProps> = ({
    printer, isMainBranch, branches, onSave, onClose,
}) => {
    const [form, setForm] = useState<PrinterFormData>(
        printer
            ? {
                name: printer.name,
                description: printer.description || '',
                printer_type: printer.printer_type,
                mode: printer.mode,
                ip_address: printer.ip_address || '',
                port: printer.port || 9100,
                is_active: printer.is_active,
                sort_order: printer.sort_order,
                service_types: printer.service_types || [],
                target_branch_id: printer.branch_id,
            }
            : { ...EMPTY_FORM }
    );
    const [saving, setSaving] = useState(false);
    const [error, setError] = useState('');

    const toggleService = (svc: string) => {
        setForm(f => ({
            ...f,
            service_types: f.service_types.includes(svc)
                ? f.service_types.filter(s => s !== svc)
                : [...f.service_types, svc],
        }));
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setError('');
        setSaving(true);
        try {
            await onSave(form);
            onClose();
        } catch (err: any) {
            setError(err.message || 'Failed to save printer');
        } finally {
            setSaving(false);
        }
    };

    const isNetwork = !!form.ip_address.trim();

    return (
        <AccessibleModal
            isOpen
            onClose={onClose}
            hideHeader
            ariaLabelledBy="printer-form-title"
            closeOnOverlayClick
            overlayClassName="fixed inset-0 bg-black/50 flex items-center justify-center p-4"
            overlayStyle={{ zIndex: Z_INDEX.MODAL_BACKDROP }}
            panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-lg flex flex-col"
            panelStyle={{ zIndex: Z_INDEX.MODAL_CONTENT, maxHeight: '90vh' }}
            bodyClassName="contents"
        >
                    {/* ── Fixed header ── */}
                    <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 shrink-0">
                        <h3 id="printer-form-title" className="text-lg font-bold text-slate-800">
                            {printer ? 'Edit Printer' : 'Add Printer'}
                        </h3>
                        <button onClick={onClose} className="p-2 hover:bg-slate-100 rounded-lg transition-colors">
                            <X size={18} className="text-slate-500" />
                        </button>
                    </div>

                    {/* ── Scrollable body ── */}
                    <form id="printer-form" onSubmit={handleSubmit} className="flex-1 overflow-y-auto px-6 py-5 space-y-5">
                        {/* Branch selector (Main Branch admins only) */}
                        {isMainBranch && !printer && (
                            <CustomSelect
                                label="Branch"
                                placeholder="— Select branch —"
                                value={form.target_branch_id || ''}
                                onChange={(v: string) => setForm(f => ({ ...f, target_branch_id: v || undefined }))}
                                options={branches.map(b => ({ value: b.id, label: b.name }))}
                                searchable
                            />
                        )}

                        {/* Name */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Printer Name <span className="text-red-500">*</span></label>
                            <Input
                                value={form.name}
                                onChange={e => setForm(f => ({ ...f, name: e.target.value }))}
                                placeholder="e.g. Kitchen Printer"
                                required
                            />
                        </div>

                        {/* Description */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Description</label>
                            <Input
                                value={form.description}
                                onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
                                placeholder="Optional notes"
                            />
                        </div>

                        {/* Paper type */}
                        <CustomSelect
                            label="Paper / Printer Type"
                            value={form.printer_type}
                            onChange={(v: string) => setForm(f => ({ ...f, printer_type: v as PrinterFormData['printer_type'] }))}
                            options={PRINTER_TYPES}
                            searchable={false}
                        />

                        {/* IP address + port */}
                        <div className="grid grid-cols-3 gap-3">
                            <div className="col-span-2">
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">IP Address</label>
                                <Input
                                    value={form.ip_address}
                                    onChange={e => setForm(f => ({ ...f, ip_address: e.target.value }))}
                                    placeholder="192.168.1.100"
                                />
                            </div>
                            <div>
                                <label className="block text-sm font-semibold text-slate-700 mb-1.5">Port</label>
                                <Input
                                    type="number"
                                    value={form.port}
                                    onChange={e => setForm(f => ({ ...f, port: parseInt(e.target.value) || 9100 }))}
                                    min={1}
                                    max={65535}
                                />
                            </div>
                        </div>

                        {/* Mode — only relevant when no IP (browser print) */}
                        {!isNetwork && (
                            <CustomSelect
                                label="Mode (no IP set)"
                                value={form.mode}
                                onChange={(v: string) => setForm(f => ({ ...f, mode: v as PrinterFormData['mode'] }))}
                                options={[
                                    { value: 'LOCAL', label: 'LOCAL', description: 'Browser print dialog' },
                                    { value: 'OFF',   label: 'OFF',   description: 'Disabled' },
                                ]}
                                searchable={false}
                            />
                        )}

                        {/* Service type assignment */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-2">Assign to Services</label>
                            <div className="grid grid-cols-2 gap-2">
                                {SERVICE_TYPES.map(svc => {
                                    const active = form.service_types.includes(svc.value);
                                    return (
                                        <button
                                            key={svc.value}
                                            type="button"
                                            onClick={() => toggleService(svc.value)}
                                            className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-sm font-medium transition-all ${
                                                active
                                                    ? `${SERVICE_COLORS[svc.value] || 'bg-indigo-100 text-indigo-700 border-indigo-200'} shadow-sm`
                                                    : 'bg-slate-50 text-slate-500 border-slate-200 hover:border-slate-300'
                                            }`}
                                        >
                                            <span className={`w-4 h-4 rounded border flex items-center justify-center shrink-0 ${active ? 'bg-current border-current' : 'border-slate-300'}`}>
                                                {active && <svg viewBox="0 0 10 10" fill="white" className="w-2.5 h-2.5"><path d="M1.5 5l2.5 2.5 5-5" stroke="white" strokeWidth="1.5" fill="none" strokeLinecap="round" strokeLinejoin="round"/></svg>}
                                            </span>
                                            {svc.value}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>

                        {/* Active toggle */}
                        <div className="flex items-center justify-between py-2 border-t border-slate-100">
                            <div>
                                <p className="text-sm font-semibold text-slate-700">Active</p>
                                <p className="text-xs text-slate-500">Inactive printers won&apos;t receive jobs</p>
                            </div>
                            <button
                                type="button"
                                onClick={() => setForm(f => ({ ...f, is_active: !f.is_active }))}
                                className={`relative w-11 h-6 rounded-full transition-colors ${form.is_active ? 'bg-indigo-600' : 'bg-slate-300'}`}
                            >
                                <span className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${form.is_active ? 'translate-x-5' : ''}`} />
                            </button>
                        </div>

                        {/* Sort order */}
                        <div>
                            <label className="block text-sm font-semibold text-slate-700 mb-1.5">Sort Order</label>
                            <Input
                                type="number"
                                value={form.sort_order}
                                onChange={e => setForm(f => ({ ...f, sort_order: parseInt(e.target.value) || 0 }))}
                                min={0}
                                max={9999}
                            />
                        </div>

                        {error && (
                            <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-100 rounded-xl text-sm text-red-700">
                                <AlertCircle size={16} className="shrink-0" />
                                {error}
                            </div>
                        )}
                    </form>

                    {/* ── Fixed footer ── */}
                    <div className="flex gap-3 px-6 py-4 border-t border-slate-100 shrink-0">
                        <Button type="button" variant="secondary" onClick={onClose} className="flex-1">
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            form="printer-form"
                            disabled={saving}
                            className="flex-1 flex items-center justify-center gap-2"
                        >
                            {saving && <Loader2 size={14} className="animate-spin" />}
                            {printer ? 'Save Changes' : 'Add Printer'}
                        </Button>
                    </div>
        </AccessibleModal>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Printer card
// ─────────────────────────────────────────────────────────────────────────────
interface PrinterCardProps {
    printer: PrinterType;
    statusInfo?: { pending_jobs: number; failed_jobs: number };
    onEdit: () => void;
    onDelete: () => void;
    onTest: () => Promise<any>;
    onRetry: () => Promise<void>;
}

const PrinterCard: React.FC<PrinterCardProps> = ({
    printer, statusInfo, onEdit, onDelete, onTest, onRetry,
}) => {
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ online: boolean; latency_ms: number | null } | null>(null);
    const [expanded, setExpanded] = useState(false);

    const handleTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const r = await onTest() as any;
            setTestResult(r);
        } catch {
            setTestResult({ online: false, latency_ms: null });
        } finally {
            setTesting(false);
        }
    };

    const isNetworkPrinter = !!printer.ip_address;

    return (
        <div className={`bg-white border rounded-2xl shadow-sm overflow-hidden transition-all ${printer.is_active ? 'border-slate-200' : 'border-slate-200 opacity-60'}`}>
            {/* Header row */}
            <div className="flex items-start justify-between gap-3 p-4">
                <div className="flex items-start gap-3 min-w-0">
                    <div className={`p-2.5 rounded-xl shrink-0 ${printer.is_active ? 'bg-indigo-50 text-indigo-600' : 'bg-slate-100 text-slate-400'}`}>
                        {isNetworkPrinter ? <Network size={18} /> : <Printer size={18} />}
                    </div>
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-bold text-slate-800 text-sm">{printer.name}</span>
                            {!printer.is_active && (
                                <span className="text-[10px] font-bold uppercase px-2 py-0.5 bg-slate-100 text-slate-400 rounded-full">Inactive</span>
                            )}
                            {printer.branch_name && (
                                <span className="text-[10px] font-semibold px-2 py-0.5 bg-blue-50 text-blue-600 border border-blue-100 rounded-full">{printer.branch_name}</span>
                            )}
                        </div>
                        {isNetworkPrinter ? (
                            <p className="text-xs text-slate-500 mt-0.5">{printer.ip_address}:{printer.port || 9100} · {PRINTER_TYPES.find(t => t.value === printer.printer_type)?.label || printer.printer_type}</p>
                        ) : (
                            <p className="text-xs text-slate-500 mt-0.5">
                                {printer.mode === 'LOCAL' ? 'Browser print' : 'Disabled'} · {PRINTER_TYPES.find(t => t.value === printer.printer_type)?.label || printer.printer_type}
                            </p>
                        )}
                        {/* Service badges */}
                        <div className="flex flex-wrap gap-1 mt-1.5">
                            {(printer.service_types || []).map(s => (
                                <span key={s} className={`text-[10px] font-bold px-1.5 py-0.5 rounded border ${SERVICE_COLORS[s] || 'bg-slate-100 text-slate-600 border-slate-200'}`}>
                                    {s}
                                </span>
                            ))}
                            {(!printer.service_types || printer.service_types.length === 0) && (
                                <span className="text-[10px] text-slate-400 italic">No services assigned</span>
                            )}
                        </div>
                    </div>
                </div>

                {/* Action buttons */}
                <div className="flex items-center gap-1 shrink-0">
                    <button
                        onClick={() => setExpanded(e => !e)}
                        className="p-1.5 hover:bg-slate-100 rounded-lg transition-colors text-slate-400"
                        title="Expand"
                    >
                        {expanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                    </button>
                    <button
                        onClick={onEdit}
                        className="p-1.5 hover:bg-indigo-50 text-slate-400 hover:text-indigo-600 rounded-lg transition-colors"
                        title="Edit"
                    >
                        <Pencil size={15} />
                    </button>
                    <button
                        onClick={onDelete}
                        className="p-1.5 hover:bg-red-50 text-slate-400 hover:text-red-600 rounded-lg transition-colors"
                        title="Delete"
                    >
                        <Trash2 size={15} />
                    </button>
                </div>
            </div>

            {/* Expanded section */}
            {expanded && (
                <div className="border-t border-slate-100 px-4 py-3 space-y-3 bg-slate-50/50">
                    {/* Job stats */}
                    {statusInfo && (statusInfo.pending_jobs > 0 || statusInfo.failed_jobs > 0) && (
                        <div className="flex gap-3">
                            {statusInfo.pending_jobs > 0 && (
                                <span className="text-xs text-amber-700 bg-amber-50 border border-amber-100 px-2 py-0.5 rounded-full font-medium">
                                    {statusInfo.pending_jobs} pending
                                </span>
                            )}
                            {statusInfo.failed_jobs > 0 && (
                                <div className="flex items-center gap-2">
                                    <span className="text-xs text-red-700 bg-red-50 border border-red-100 px-2 py-0.5 rounded-full font-medium">
                                        {statusInfo.failed_jobs} failed
                                    </span>
                                    <button
                                        onClick={onRetry}
                                        className="text-xs text-indigo-600 hover:underline flex items-center gap-1"
                                    >
                                        <RefreshCw size={11} /> Retry
                                    </button>
                                </div>
                            )}
                        </div>
                    )}

                    {/* Test connection (only for network printers) */}
                    {isNetworkPrinter && (
                        <div className="flex items-center gap-3">
                            <button
                                onClick={handleTest}
                                disabled={testing}
                                className="flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-white border border-slate-200 rounded-lg hover:border-indigo-300 hover:text-indigo-600 transition-all disabled:opacity-50"
                            >
                                {testing ? <Loader2 size={12} className="animate-spin" /> : <Wifi size={12} />}
                                Test Connection
                            </button>
                            {testResult !== null && (
                                <span className={`flex items-center gap-1 text-xs font-semibold ${testResult.online ? 'text-green-600' : 'text-red-500'}`}>
                                    {testResult.online
                                        ? <><CheckCircle size={13} /> Online{testResult.latency_ms !== null ? ` · ${testResult.latency_ms}ms` : ''}</>
                                        : <><WifiOff size={13} /> Unreachable</>
                                    }
                                </span>
                            )}
                        </div>
                    )}

                    {/* Description */}
                    {printer.description && (
                        <p className="text-xs text-slate-500">{printer.description}</p>
                    )}
                </div>
            )}
        </div>
    );
};

// ─────────────────────────────────────────────────────────────────────────────
// Main component
// ─────────────────────────────────────────────────────────────────────────────
export const PrinterSettings = () => {
    const { confirm, showToast } = useUI();
    const {
        printers, status, loading, error,
        isMainBranch, branches,
        createPrinter, updatePrinter, deletePrinter,
        retryFailed, testConnection,
        fetchPrinters, fetchStatus,
    } = usePrinters();

    const [modalPrinter, setModalPrinter] = useState<PrinterType | null | 'new'>( null);

    const statusMap = Object.fromEntries(status.map(s => [s.id, s]));

    const handleSave = useCallback(async (data: PrinterFormData) => {
        if (modalPrinter === 'new') {
            await createPrinter(data);
            showToast('Printer added', 'success');
        } else if (modalPrinter) {
            await updatePrinter((modalPrinter as PrinterType).id, data);
            showToast('Printer updated', 'success');
        }
        fetchPrinters();
        fetchStatus();
    }, [modalPrinter, createPrinter, updatePrinter, fetchPrinters, fetchStatus, showToast]);

    const handleDelete = useCallback(async (printer: PrinterType) => {
        const ok = await confirm({
            title: 'Delete Printer',
            description: `Remove "${printer.name}"? Any pending jobs for this printer will also be deleted.`,
            confirmText: 'Delete',
            variant: 'danger',
        });
        if (!ok) return;
        try {
            await deletePrinter(printer.id);
            showToast('Printer deleted', 'success');
        } catch (err: any) {
            showToast(err.message || 'Failed to delete', 'error');
        }
    }, [confirm, deletePrinter, showToast]);

    const handleRetry = useCallback(async (id: string) => {
        try {
            const n = await retryFailed(id);
            showToast(`${n} job(s) re-queued`, 'success');
        } catch (err: any) {
            showToast(err.message || 'Retry failed', 'error');
        }
    }, [retryFailed, showToast]);

    const handleTest = useCallback(async (id: string) => {
        return testConnection(id);
    }, [testConnection]);

    return (
        <div className="space-y-6">
            {/* Header */}
            <div className="flex items-center justify-between">
                <div>
                    <h3 className="text-xl font-bold text-slate-800">Printer Management</h3>
                    <p className="text-slate-500 text-sm mt-0.5">
                        Add ESC/POS network printers and assign them to KOT, Bill, Receipt and other services.
                    </p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={() => { fetchPrinters(); fetchStatus(); }}
                        className="p-2 hover:bg-slate-100 rounded-xl transition-colors text-slate-400"
                        title="Refresh"
                    >
                        <RefreshCw size={16} />
                    </button>
                    <Button
                        onClick={() => setModalPrinter('new')}
                        className="flex items-center gap-2"
                    >
                        <Plus size={16} />
                        Add Printer
                    </Button>
                </div>
            </div>

            {/* Content */}
            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-400">
                    <Loader2 size={24} className="animate-spin mr-3" />
                    Loading printers…
                </div>
            ) : error ? (
                <div className="flex items-center gap-3 p-4 bg-red-50 border border-red-100 rounded-2xl text-red-700 text-sm">
                    <AlertCircle size={18} className="shrink-0" />
                    {error}
                </div>
            ) : printers.length === 0 ? (
                <div className="text-center py-16 border-2 border-dashed border-slate-200 rounded-2xl">
                    <div className="w-14 h-14 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4 text-slate-400">
                        <Printer size={28} />
                    </div>
                    <p className="font-semibold text-slate-600 mb-1">No printers configured</p>
                    <p className="text-sm text-slate-400 mb-5">Add your first network printer to start printing KOTs and bills.</p>
                    <Button onClick={() => setModalPrinter('new')} className="flex items-center gap-2 mx-auto">
                        <Plus size={15} />
                        Add Printer
                    </Button>
                </div>
            ) : (
                <div className="space-y-3">
                    {printers.map(printer => (
                        <PrinterCard
                            key={printer.id}
                            printer={printer}
                            statusInfo={statusMap[printer.id]}
                            onEdit={() => setModalPrinter(printer)}
                            onDelete={() => handleDelete(printer)}
                            onTest={() => handleTest(printer.id)}
                            onRetry={() => handleRetry(printer.id)}
                        />
                    ))}
                </div>
            )}

            {/* Service-type quick reference */}
            <div className="mt-4 p-4 bg-slate-50 border border-slate-200 rounded-2xl">
                <p className="text-xs font-bold text-slate-600 uppercase tracking-wide mb-3">Service Types</p>
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
                    {SERVICE_TYPES.map(svc => (
                        <div key={svc.value} className="flex flex-col gap-1">
                            <span className={`self-start text-[10px] font-bold px-1.5 py-0.5 rounded border ${SERVICE_COLORS[svc.value] || ''}`}>
                                {svc.value}
                            </span>
                            <span className="text-[11px] text-slate-500 leading-tight">
                                {svc.label.split('(')[1]?.replace(')', '') || svc.label}
                            </span>
                        </div>
                    ))}
                </div>
                <p className="text-[11px] text-slate-400 mt-3">
                    <strong>Tip:</strong> Assign a static IP to your printer in your router so the address never changes after a reboot.
                    Network printers connect via TCP on port 9100 (ESC/POS).
                </p>
            </div>

            {/* Add/Edit modal */}
            {modalPrinter !== null && (
                <PrinterFormModal
                    printer={modalPrinter === 'new' ? null : modalPrinter}
                    isMainBranch={isMainBranch}
                    branches={branches}
                    onSave={handleSave}
                    onClose={() => setModalPrinter(null)}
                />
            )}
        </div>
    );
};
