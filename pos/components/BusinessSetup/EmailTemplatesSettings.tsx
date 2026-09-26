import React, { useState, useEffect } from 'react';
import DOMPurify from 'dompurify';
import { Mail, Save, Info, AlertCircle, Trash2, X, Paperclip, Copy, Code2, Eye, Columns2, Maximize2, Minimize2 } from 'lucide-react';
import { useUI } from '../ui/UIContext';
import CustomSelect from '../shared/CustomSelect';
import { REPORT_MODULES } from '../../constants/reports';
import { getEmailTemplates, updateEmailTemplate, testEmailTemplate, deleteEmailTemplate, getReportSchemas } from '../../services/setupService';
import { getAppTimezone } from '../../utils/dateUtils';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import logger from '../../utils/logger';
import { AccessibleModal } from '../ui/AccessibleModal';

interface EmailTemplate {
    label?: string;
    subject: string;
    body: string;
    description: string;
    placeholders: string[];
    updatedBy?: string;
    updatedAt?: string;
    attachmentSchema?: string;
}

interface TemplateKey {
    key: string;
    label: string;
    description: string;
}

const TEMPLATE_KEYS = [
    { key: 'email_template_admin_report', label: 'Monthly Admin Summary', description: 'Sends a summarized Excel report of all staff consumption for the month to the System Administrator.' },
    { key: 'email_template_staff_reset', label: 'Staff Reset Confirmation (Admin)', description: 'Sent to administrators as a receipt when the Monthly Allowance Reset process is performed for staff.' },
    { key: 'email_template_consumer_reset', label: 'Consumer Reset Confirmation (Admin)', description: 'Sent to administrators as a receipt when the Monthly Allowance Reset process is performed for consumers.' },
    { key: 'email_template_consumer_aggregate_report', label: 'Consumer Aggregate Report', description: 'Sends a summarized Excel report of all consumer consumption for the month to the System Administrator.' },
    { key: 'email_template_staff_bulk_import', label: 'Staff Import Summary (Admin)', description: 'Summary report sent to admins after an Excel bulk import of staff members is processed.' },
    { key: 'email_template_monthly_statement', label: 'Monthly Statement', description: 'Personalized monthly consumption report sent directly to individual staff members.' },
    { key: 'email_template_statement_attachment', label: 'Individual Statement', description: 'Used for sending transaction-by-transaction details to a staff or consumer upon request.' },
    { key: 'email_template_bulk_statement_completion', label: 'Bulk Send Summary (Admin)', description: 'A completion report sent to admins showing the result of a batch email campaign.' }
];

export const EmailTemplatesSettings: React.FC = () => {
    const { showToast } = useUI();
    const [templates, setTemplates] = useState<Record<string, EmailTemplate>>({});
    const [activeKey, setActiveKey] = useState(TEMPLATE_KEYS[0].key);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [testing, setTesting] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [newTemplate, setNewTemplate] = useState({ key: '', label: '', description: '' });
    const [customKeys, setCustomKeys] = useState<TemplateKey[]>([]);
    const [deletingKey, setDeletingKey] = useState<string | null>(null);
    const [lastFocusedInput, setLastFocusedInput] = useState<'subject' | 'body'>('body');
    const [reportSchemas, setReportSchemas] = useState<Record<string, string[]>>({});
    const [previewMode, setPreviewMode] = useState<'code' | 'preview' | 'split'>('split');
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [editorHeight, setEditorHeight] = useState<'compact' | 'normal' | 'tall'>('normal');

    useEffect(() => {
        const fetchInitialData = async () => {
            try {
                const [templateData, schemas] = await Promise.all([
                    getEmailTemplates(),
                    getReportSchemas()
                ]);
                setTemplates(templateData);
                setReportSchemas(schemas);

                // Identify any keys that are NOT in the default TEMPLATE_KEYS list
                const existingKeys = TEMPLATE_KEYS.map(k => k.key);
                const dynamicKeys = Object.keys(templateData)
                    .filter(key => !existingKeys.includes(key))
                    .map(key => ({
                        key,
                        label: templateData[key].label || key.replace('email_template_', '').replace(/_/g, ' '),
                        description: templateData[key].description || ''
                    }));
                setCustomKeys(dynamicKeys);
            } catch (error) {
                logger.error('Failed to fetch initial settings data', error);
            } finally {
                setLoading(false);
            }
        };
        fetchInitialData();
    }, []);

    const allKeys = [...TEMPLATE_KEYS, ...customKeys];
    const activeLabel = allKeys.find(k => k.key === activeKey);

    // Helper to get height class based on preset
    const getHeightClass = () => {
        if (isFullscreen) return 'h-[calc(100vh-200px)]';
        switch (editorHeight) {
            case 'compact': return 'min-h-[400px]';
            case 'normal': return 'min-h-[600px]';
            case 'tall': return 'min-h-[800px]';
            default: return 'min-h-[600px]';
        }
    };

    const handleSave = async () => {
        const template = templates[activeKey];
        if (!template) return;

        setSaving(true);
        try {
            const { metadata } = await updateEmailTemplate(activeKey, template);
            setTemplates(prev => ({
                ...prev,
                [activeKey]: {
                    ...prev[activeKey],
                    ...metadata
                }
            }));
            showToast('Template saved successfully!', 'success');
        } catch (error: any) {
            showToast(error.message || 'An error occurred', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleTest = async () => {
        const template = templates[activeKey];
        if (!template) return;

        setTesting(true);
        try {
            const data = await testEmailTemplate(template);
            showToast(data.message || 'Test email sent!', 'success');
        } catch (error: any) {
            showToast(error.message || 'Failed to send test email', 'error');
        } finally {
            setTesting(false);
        }
    };

    const updateActiveTemplate = (field: keyof EmailTemplate | Partial<EmailTemplate>, value?: any) => {
        setTemplates(prev => ({
            ...prev,
            [activeKey]: typeof field === 'string'
                ? { ...prev[activeKey], [field]: value }
                : { ...prev[activeKey], ...field }
        }));
    };

    const renderPreview = (html: string) => {
        // Sample data for placeholders
        const sampleData: Record<string, string> = {
            '{{name}}': 'John Doe',
            '{{email}}': 'john.doe@example.com',
            '{{month}}': 'March',
            '{{year}}': '2026',
            '{{date}}': new Date().toLocaleDateString(),
            '{{username}}': 'admin',
            '{{totalStaff}}': '150',
            '{{totalConsumers}}': '300',
            '{{totalTransactions}}': '1,234',
            '{{totalAmount}}': '45,000',
            '{{department}}': 'Engineering',
            '{{allowance}}': '5,000',
            '{{spent}}': '3,500',
            '{{balance}}': '1,500',
            '{{payable}}': '0',
            '{{startDate}}': '2026-03-01',
            '{{endDate}}': '2026-03-31',
            '{{resetDate}}': new Date().toLocaleDateString(),
            '{{resetAmount}}': '750,000',
            '{{totalImported}}': '50',
            '{{successCount}}': '48',
            '{{failCount}}': '2',
            '{{errorCount}}': '2',
            '{{errorList}}': '<li>Duplicate email: jane@example.com</li><li>Invalid mobile: 123</li>',
            '{{total}}': '150',
            '{{sent}}': '145',
            '{{failed}}': '5',
            '{{errors}}': 'Connection timeout for 3 recipients',
            '{{testAlert}}': ''
        };

        let rendered = html;
        Object.entries(sampleData).forEach(([placeholder, value]) => {
            rendered = rendered.replace(new RegExp(placeholder.replace(/[{}]/g, '\\$&'), 'g'), value);
        });

        return rendered;
    };

    const insertPlaceholder = (placeholder: string) => {
        const template = templates[activeKey];
        if (!template) return;

        const field = lastFocusedInput;
        const currentValue = template[field] || '';
        const inputId = field === 'subject' ? 'template-subject' : 'template-body';
        const inputElement = document.getElementById(inputId) as HTMLInputElement | HTMLTextAreaElement;

        if (inputElement) {
            const start = inputElement.selectionStart || 0;
            const end = inputElement.selectionEnd || 0;
            const newValue = currentValue.substring(0, start) + placeholder + currentValue.substring(end);

            updateActiveTemplate(field, newValue);

            // Set focus back and move cursor after injected text
            setTimeout(() => {
                inputElement.focus();
                inputElement.setSelectionRange(start + placeholder.length, start + placeholder.length);
            }, 0);
        } else {
            updateActiveTemplate(field, currentValue + placeholder);
        }
    };

    const handleAddTemplate = async () => {
        if (!newTemplate.key || !newTemplate.label) {
            showToast('Key and Label are required', 'error');
            return;
        }

        const fullKey = newTemplate.key.startsWith('email_template_')
            ? newTemplate.key
            : `email_template_${newTemplate.key.toLowerCase().replace(/\s+/g, '_')}`;

        if (templates[fullKey]) {
            showToast('Template key already exists', 'error');
            return;
        }

        const templateData: EmailTemplate = {
            label: newTemplate.label,
            subject: 'New Email Subject',
            body: '<p>Edit your email content here...</p>',
            description: newTemplate.description,
            placeholders: ['{{date}}']
        };

        setSaving(true);
        try {
            await updateEmailTemplate(fullKey, templateData);
            setTemplates(prev => ({ ...prev, [fullKey]: templateData }));
            setCustomKeys(prev => [...prev, { key: fullKey, label: newTemplate.label, description: newTemplate.description }]);
            setActiveKey(fullKey);
            setShowAddModal(false);
            setNewTemplate({ key: '', label: '', description: '' });
            showToast('New template created!', 'success');
        } catch (error: any) {
            showToast(error.message || 'An error occurred', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDuplicate = async (templateKey: string) => {
        const template = templates[templateKey];
        if (!template) return;

        // Generate unique key for duplicate
        const baseLabel = template.label || templateKey.replace('email_template_', '').replace(/_/g, ' ');
        const duplicateLabel = `${baseLabel} (Copy)`;
        let duplicateKey = `email_template_${duplicateLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}`;

        // Ensure unique key
        let counter = 1;
        while (templates[duplicateKey]) {
            duplicateKey = `email_template_${duplicateLabel.toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '')}_${counter}`;
            counter++;
        }

        const duplicateData: EmailTemplate = {
            ...template,
            label: duplicateLabel
        };

        setSaving(true);
        try {
            await updateEmailTemplate(duplicateKey, duplicateData);
            setTemplates(prev => ({ ...prev, [duplicateKey]: duplicateData }));
            setCustomKeys(prev => [...prev, { key: duplicateKey, label: duplicateLabel, description: template.description }]);
            setActiveKey(duplicateKey);
            showToast('Template duplicated successfully!', 'success');
        } catch (error: any) {
            showToast(error.message || 'Failed to duplicate template', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingKey) return;

        setSaving(true);
        try {
            await deleteEmailTemplate(deletingKey);
            const updatedTemplates = { ...templates };
            delete updatedTemplates[deletingKey];
            setTemplates(updatedTemplates);
            setCustomKeys(prev => prev.filter(k => k.key !== deletingKey));

            if (activeKey === deletingKey) {
                setActiveKey(TEMPLATE_KEYS[0].key);
            }

            setShowDeleteModal(false);
            setDeletingKey(null);
            showToast('Template deleted successfully', 'success');
        } catch (error: any) {
            showToast(error.message || 'An error occurred', 'error');
        } finally {
            setSaving(false);
        }
    };

    const activeTemplate = templates[activeKey];

    if (loading) {
        return <div className="animate-pulse space-y-4">
            <div className="h-10 bg-slate-100 rounded-xl w-1/4"></div>
            <div className="h-64 bg-slate-100 rounded-2xl"></div>
        </div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-indigo-50 text-indigo-600 rounded-lg">
                    <Mail size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Email Templates</h3>
                    <p className="text-sm text-slate-500">Customize the content and subject of automated emails.</p>
                </div>
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* template list */}
                <div className="w-full lg:w-72 shrink-0">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-4">Templates</div>
                    <div className="space-y-1">
                        {allKeys.map(tk => {
                            const isSystem = TEMPLATE_KEYS.some(sk => sk.key === tk.key);
                            return (
                                <div key={tk.key} className="group relative">
                                    <button
                                        onClick={() => setActiveKey(tk.key)}
                                        className={`w-full text-left px-4 py-3 rounded-xl transition-all text-sm font-medium ${!isSystem ? 'pr-20' : 'pr-12'} shadow-none ${activeKey === tk.key
                                            ? 'bg-indigo-50 text-indigo-700 border border-indigo-100'
                                            : 'text-slate-600 hover:bg-slate-50'
                                            }`}
                                    >
                                        {tk.label}
                                    </button>
                                    <div className="absolute right-2 top-1/2 -translate-y-1/2 flex gap-1">
                                        <button
                                            onClick={(e: React.MouseEvent) => {
                                                e.stopPropagation();
                                                handleDuplicate(tk.key);
                                            }}
                                            className="p-2 text-indigo-600 bg-indigo-50 hover:bg-indigo-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95"
                                            title="Duplicate Template"
                                            disabled={saving}
                                        >
                                            <Copy size={14} />
                                        </button>
                                        {!isSystem && (
                                            <button
                                                onClick={(e: React.MouseEvent) => {
                                                    e.stopPropagation();
                                                    setDeletingKey(tk.key);
                                                    setShowDeleteModal(true);
                                                }}
                                                className="p-2 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-xl transition-all shadow-sm active:scale-95"
                                                title="Delete Template"
                                            >
                                                <Trash2 size={14} />
                                            </button>
                                        )}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                    <div className="mt-12 pt-4 border-t border-slate-50">
                        <Button
                            variant="ghost"
                            onClick={() => setShowAddModal(true)}
                            className="w-full justify-center border-2 border-dashed border-indigo-100 text-indigo-600 hover:bg-indigo-50"
                            leftIcon={<span>+</span>}
                        >
                            Add New Template
                        </Button>
                    </div>
                </div>

                {/* editor */}
                <div className="flex-1 min-w-0">
                    {!activeTemplate ? (
                        <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem] bg-slate-50">
                            <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
                            <p className="text-slate-500 font-medium">Template data not found. Try resetting to default or contact support.</p>
                        </div>
                    ) : (
                        <div className="space-y-6 animate-in fade-in duration-300">
                            <div className="p-4 bg-indigo-50 rounded-2xl border border-indigo-100 flex gap-3">
                                <Info className="text-indigo-600 shrink-0" size={20} />
                                <div className="space-y-1">
                                    <p className="text-sm font-semibold text-indigo-900">{activeLabel?.description || 'Custom Email Template'}</p>
                                    <div className="flex flex-wrap gap-2 items-center">
                                        <span className="text-[10px] uppercase font-bold text-indigo-400">Available Placeholders (Click to insert):</span>
                                        {(activeTemplate.placeholders || []).map(p => (
                                            <button
                                                key={p}
                                                onClick={() => insertPlaceholder(p)}
                                                title={`Insert ${p}`}
                                                className="text-[11px] bg-white hover:bg-indigo-500 hover:text-white px-1.5 py-0.5 rounded border border-indigo-100 font-mono text-indigo-600 transition-colors shadow-none"
                                            >
                                                {p}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            {/* Attachment Settings */}
                            <div className="p-5 bg-white rounded-[2rem] border border-slate-200 shadow-none space-y-4">
                                <div className="flex items-center justify-between">
                                    <div className="flex items-center gap-3">
                                        <div className="p-2 bg-indigo-50 rounded-lg text-indigo-600">
                                            <Paperclip size={20} />
                                        </div>
                                        <div>
                                            <h4 className="text-sm font-bold text-slate-800">Email Attachment</h4>
                                            <p className="text-[11px] text-slate-500 font-medium">Select a report to automatically attach to this email.</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => {
                                            if (activeTemplate.attachmentSchema) {
                                                updateActiveTemplate('attachmentSchema', '');
                                            } else {
                                                const schemas = Object.keys(reportSchemas);
                                                const firstSchema = schemas.includes('TRANSACTIONS_HISTORY') ? 'TRANSACTIONS_HISTORY' : (schemas[0] || '');
                                                updateActiveTemplate('attachmentSchema', firstSchema);
                                            }
                                        }}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none ${activeTemplate.attachmentSchema ? 'bg-indigo-600' : 'bg-slate-200'}`}
                                    >
                                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${activeTemplate.attachmentSchema ? 'translate-x-6' : 'translate-x-1'}`} />
                                    </button>
                                </div>

                                {activeTemplate.attachmentSchema && (
                                    <div className="pt-2 animate-in slide-in-from-top-2 duration-300">
                                        <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">Select Attachment Type</label>
                                        <CustomSelect
                                            value={activeTemplate.attachmentSchema || ''}
                                            onChange={(val) => updateActiveTemplate('attachmentSchema', val)}
                                            options={REPORT_MODULES
                                                .filter(module => module.value in reportSchemas)
                                                .map(module => ({ value: module.value, label: module.label }))}
                                            placeholder="Choose report..."
                                            searchable={true}
                                        />
                                        <p className="mt-2 text-[10px] text-slate-400 ml-1 italic">
                                            The selected report is attached as an Excel file using the standard template.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-4">
                                <div>
                                    <Input
                                        id="template-subject"
                                        label="Subject Line"
                                        required
                                        type="text"
                                        onFocus={() => setLastFocusedInput('subject')}
                                        value={activeTemplate.subject}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActiveTemplate('subject', e.target.value)}
                                        className="font-semibold text-slate-800"
                                    />
                                </div>

                                <div>
                                    <div className="flex items-center justify-between mb-1.5 ml-1">
                                        <label className="text-[11px] font-bold text-slate-400 uppercase tracking-widest">HTML Body <span className="text-rose-500">*</span></label>
                                        <div className="flex items-center gap-2">
                                            {/* View Mode Controls */}
                                            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                                                <button
                                                    onClick={() => setPreviewMode('code')}
                                                    className={`p-1.5 rounded transition-all ${previewMode === 'code' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                                    title="Code only"
                                                >
                                                    <Code2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setPreviewMode('split')}
                                                    className={`p-1.5 rounded transition-all ${previewMode === 'split' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                                    title="Split view"
                                                >
                                                    <Columns2 size={14} />
                                                </button>
                                                <button
                                                    onClick={() => setPreviewMode('preview')}
                                                    className={`p-1.5 rounded transition-all ${previewMode === 'preview' ? 'bg-white text-indigo-600 shadow-sm' : 'text-slate-400 hover:text-slate-600'}`}
                                                    title="Preview only"
                                                >
                                                    <Eye size={14} />
                                                </button>
                                            </div>

                                            {/* Height Presets */}
                                            <div className="w-28">
                                                <CustomSelect
                                                    value={editorHeight}
                                                    onChange={(val: string) => setEditorHeight(val as 'compact' | 'normal' | 'tall')}
                                                    options={[
                                                        { value: 'compact', label: 'Compact' },
                                                        { value: 'normal', label: 'Normal' },
                                                        { value: 'tall', label: 'Tall' },
                                                    ]}
                                                    searchable={false}
                                                />
                                            </div>

                                            {/* Fullscreen Toggle */}
                                            <button
                                                onClick={() => setIsFullscreen(!isFullscreen)}
                                                className="p-1.5 rounded-lg bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-indigo-600 transition-all"
                                                title={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
                                            >
                                                {isFullscreen ? <Minimize2 size={14} /> : <Maximize2 size={14} />}
                                            </button>
                                        </div>
                                    </div>

                                    <div className={`grid gap-4 ${previewMode === 'split' ? 'grid-cols-2' : 'grid-cols-1'}`}>
                                        {(previewMode === 'code' || previewMode === 'split') && (
                                            <div>
                                                <textarea
                                                    id="template-body"
                                                    onFocus={() => setLastFocusedInput('body')}
                                                    value={activeTemplate.body}
                                                    onChange={(e) => updateActiveTemplate('body', e.target.value)}
                                                    rows={12}
                                                    className={`w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all font-mono text-sm text-slate-700 shadow-none resize-y ${getHeightClass()}`}
                                                />
                                            </div>
                                        )}
                                        {(previewMode === 'preview' || previewMode === 'split') && (
                                            <div className={`border border-slate-200 rounded-xl p-4 bg-white overflow-auto custom-scrollbar ${getHeightClass()}`}>
                                                <div className="text-xs text-slate-400 mb-3 font-medium pb-2 border-b border-slate-100">
                                                    Live Preview (with sample data)
                                                </div>
                                                <div
                                                    dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(renderPreview(activeTemplate.body)) }}
                                                    className="prose prose-sm max-w-none"
                                                />
                                            </div>
                                        )}
                                    </div>
                                    <p className="mt-2 text-[11px] text-slate-400 italic">
                                        {previewMode === 'preview' ? 'Preview uses sample data. Switch to Code or Split view to edit.' : 'Caution: This field accepts HTML code. Ensure all placeholder tags are preserved. You can resize the editor vertically.'}
                                    </p>
                                </div>
                            </div>

                            <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                                <div className="flex flex-col items-end gap-2">
                                    <div className="flex gap-3">
                                        <Button
                                            variant="secondary"
                                            onClick={handleTest}
                                            disabled={testing}
                                            isLoading={testing}
                                            leftIcon={!testing && <Mail size={18} />}
                                            className="px-6 py-3.5 rounded-2xl shadow-none"
                                        >
                                            Test Template
                                        </Button>
                                        <Button
                                            onClick={handleSave}
                                            disabled={saving}
                                            isLoading={saving}
                                            leftIcon={!saving && <Save size={18} />}
                                            className="px-8 py-3.5 rounded-2xl shadow-none"
                                        >
                                            Save Template
                                        </Button>
                                    </div>
                                    <span className="text-[10px] text-slate-400 font-medium mr-2">
                                        {activeTemplate.updatedBy ? (
                                            <>Last updated by <span className="text-slate-600 font-bold uppercase">{activeTemplate.updatedBy}</span> on {new Date(activeTemplate.updatedAt!).toLocaleString('en-IN', { timeZone: getAppTimezone(), dateStyle: 'medium', timeStyle: 'short' })}</>
                                        ) : (
                                            "Last updated: Recently"
                                        )}
                                    </span>
                                </div>
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {showAddModal && (
                <AccessibleModal
                    isOpen
                    onClose={() => setShowAddModal(false)}
                    hideHeader
                    ariaLabelledBy="email-create-template-title"
                    closeOnOverlayClick={false}
                    overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    panelClassName="relative bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-0 flex flex-col max-h-[80vh] animate-in zoom-in-95 duration-200 overflow-hidden border border-slate-100"
                    bodyClassName="contents"
                >
                            <div className="flex items-center justify-between p-8 border-b border-slate-100 shrink-0">
                                <h3 id="email-create-template-title" className="text-xl font-bold text-slate-900 m-0">Create New Template</h3>
                                <Button variant="ghost" onClick={() => setShowAddModal(false)} className="!p-2 bg-transparent">
                                    <X size={20} />
                                </Button>
                            </div>
                            <div className="p-8 overflow-y-auto custom-scrollbar flex-1 space-y-5">
                                <div>
                                    <Input
                                        label="Template Name"
                                        required
                                        type="text"
                                        placeholder="e.g. Welcome Email"
                                        value={newTemplate.label}
                                        onChange={(e: React.ChangeEvent<HTMLInputElement>) => {
                                            const label = e.target.value;
                                            const key = label.trim().toLowerCase().replace(/\s+/g, '_').replace(/[^a-z0-9_]/g, '');
                                            setNewTemplate(prev => ({ ...prev, label, key }));
                                        }}
                                        className="font-medium text-slate-800"
                                    />
                                </div>

                                {newTemplate.key && (
                                    <div className="px-1">
                                        <div className="text-[10px] text-slate-400 font-medium font-mono">
                                            Internal ID: <span className="text-indigo-400">email_template_{newTemplate.key}</span>
                                        </div>
                                    </div>
                                )}

                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">What is this email for?</label>
                                    <textarea
                                        placeholder="Briefly describe when this email is sent..."
                                        value={newTemplate.description}
                                        onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 text-sm italic text-slate-600 shadow-none"
                                    />
                                </div>
                                <div className="p-8 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                                    <Button variant="secondary" onClick={() => setShowAddModal(false)} className="flex-1 py-3">Cancel</Button>
                                    <Button onClick={handleAddTemplate} disabled={saving} isLoading={saving} className="flex-1 py-3">
                                        Create Template
                                    </Button>
                                </div>
                            </div>
                </AccessibleModal>
            )}

            {/* Delete Confirmation Modal */}
            {showDeleteModal && (
                <AccessibleModal
                    isOpen
                    onClose={() => setShowDeleteModal(false)}
                    hideHeader
                    ariaLabelledBy="email-delete-template-title"
                    closeOnOverlayClick={false}
                    overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm animate-in fade-in duration-200"
                    panelClassName="relative bg-white rounded-2xl shadow-2xl w-full max-w-sm overflow-hidden animate-in zoom-in-95 duration-200 border border-slate-100 flex flex-col max-h-[80vh]"
                    bodyClassName="contents"
                >
                            <div className="p-8 overflow-y-auto custom-scrollbar flex-1">
                                <div className="flex flex-col items-center text-center space-y-4">
                                    <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center">
                                        <AlertCircle size={32} />
                                    </div>
                                    <div>
                                        <h3 id="email-delete-template-title" className="text-xl font-bold text-slate-900 m-0">Delete Template?</h3>
                                        <p className="text-sm text-slate-500 mt-2">Are you sure you want to delete this custom template? This action cannot be undone.</p>
                                    </div>
                                </div>
                            </div>
                            <div className="p-6 bg-slate-50 border-t border-slate-100 flex gap-3 shrink-0">
                                <Button variant="secondary" onClick={() => setShowDeleteModal(false)} className="flex-1 py-3">Cancel</Button>
                                <Button variant="danger" onClick={handleDelete} disabled={saving} isLoading={saving} className="flex-1 py-3">
                                    Delete
                                </Button>
                            </div>
                </AccessibleModal>
            )}
        </div>
    );
};
