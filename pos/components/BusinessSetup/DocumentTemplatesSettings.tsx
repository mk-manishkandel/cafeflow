import React, { useState, useEffect, useCallback } from 'react';
import DOMPurify from 'dompurify';
import { FileText, Save, AlertCircle, Trash2, X, Eye, Plus } from 'lucide-react';
import { useUI } from '../ui/UIContext';
import CustomSelect from '../shared/CustomSelect';
import {
    getDocumentTemplates,
    getDocumentTemplatePlaceholders,
    createDocumentTemplate,
    updateDocumentTemplate,
    deleteDocumentTemplate,
    invalidateDocumentTemplateCache
} from '../../services/setupService';
import { Button } from '../ui/Button';
import { Input } from '../ui/Input';
import logger from '../../utils/logger';
import { AccessibleModal } from '../ui/AccessibleModal';

interface DocumentTemplate {
    id: string;
    name: string;
    type: string;
    description?: string;
    template_html: string;
    template_css?: string;
    placeholders: string[];
    is_default: boolean;
    is_active: boolean;
    branch_id?: string;
    branch_name?: string;
    updated_by?: string;
    updated_at?: string;
}

const TEMPLATE_TYPES = [
    { value: 'KOT', label: 'Kitchen Order Ticket (KOT)', description: 'Order tickets for kitchen staff' },
    { value: 'INVOICE', label: 'Invoice', description: 'Detailed customer invoices' },
    { value: 'RECEIPT', label: 'Receipt', description: 'Payment receipts' },
    { value: 'BILL', label: 'Bill', description: 'Customer bills' },
    { value: 'PAYOUT', label: 'Payout', description: 'Staff payout slips' },
    { value: 'CUSTOM_ORDER', label: 'Custom Order', description: 'Slip printed when items are added via Add Custom Item' }
];

export const DocumentTemplatesSettings: React.FC = () => {
    const { showToast } = useUI();
    const [templates, setTemplates] = useState<DocumentTemplate[]>([]);
    const [placeholders, setPlaceholders] = useState<Record<string, string[]>>({});
    const [selectedType, setSelectedType] = useState<string>('KOT');
    const [selectedTemplate, setSelectedTemplate] = useState<DocumentTemplate | null>(null);
    const [loading, setLoading] = useState(true);
    const [saving, setSaving] = useState(false);
    const [showDeleteModal, setShowDeleteModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [showPreviewModal, setShowPreviewModal] = useState(false);
    const [deletingTemplate, setDeletingTemplate] = useState<DocumentTemplate | null>(null);

    const [newTemplate, setNewTemplate] = useState({
        name: '',
        type: 'KOT',
        description: ''
    });

    const fetchData = useCallback(async () => {
        try {
            setLoading(true);
            const [templatesData, placeholdersData] = await Promise.all([
                getDocumentTemplates(),
                getDocumentTemplatePlaceholders()
            ]);
            setTemplates(templatesData);
            setPlaceholders(placeholdersData);

            // Auto-select first KOT template if available
            const kotTemplates = templatesData.filter((t: DocumentTemplate) => t.type === 'KOT');
            if (kotTemplates.length > 0 && !selectedTemplate) {
                setSelectedTemplate(kotTemplates[0]);
            }
        } catch (error) {
            logger.error('Failed to fetch document templates', error);
            showToast('Failed to load templates', 'error');
        } finally {
            setLoading(false);
        }
    }, [showToast]);

    useEffect(() => {
        fetchData();
    }, [fetchData]);

    const handleTypeChange = (type: string) => {
        setSelectedType(type);
        const templatesForType = templates.filter(t => t.type === type);
        if (templatesForType.length > 0) {
            setSelectedTemplate(templatesForType[0]);
        } else {
            setSelectedTemplate(null);
        }
    };

    const handleSave = async () => {
        if (!selectedTemplate) return;

        setSaving(true);
        try {
            await updateDocumentTemplate(selectedTemplate.id, {
                name: selectedTemplate.name,
                type: selectedTemplate.type,
                description: selectedTemplate.description,
                template_html: selectedTemplate.template_html,
                template_css: selectedTemplate.template_css,
                is_default: selectedTemplate.is_default
            });

            // Invalidate all cache entries for this type (covers every branchId variant)
            // so the print path picks up the new template immediately
            invalidateDocumentTemplateCache(selectedTemplate.type);
            const freshTemplates = await getDocumentTemplates();
            setTemplates(freshTemplates);
            setSelectedTemplate(freshTemplates.find((t: DocumentTemplate) => t.id === selectedTemplate.id) ?? null);

            showToast('Template saved successfully!', 'success');
        } catch (error: any) {
            showToast(error.message || 'Failed to save template', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleCreate = async () => {
        if (!newTemplate.name || !newTemplate.type) {
            showToast('Name and type are required', 'error');
            return;
        }

        setSaving(true);
        try {
            const created = await createDocumentTemplate({
                name: newTemplate.name,
                type: newTemplate.type,
                description: newTemplate.description,
                template_html: '<div class="container"><p>Edit your template here...</p></div>',
                template_css: 'body { font-family: Arial, sans-serif; }',
                is_default: false
            });

            invalidateDocumentTemplateCache(created.type);
            const freshTemplates = await getDocumentTemplates();
            setTemplates(freshTemplates);
            setSelectedType(newTemplate.type);
            setSelectedTemplate(created);
            setShowAddModal(false);
            setNewTemplate({ name: '', type: 'KOT', description: '' });
            showToast('Template created successfully!', 'success');
        } catch (error: any) {
            showToast(error.message || 'Failed to create template', 'error');
        } finally {
            setSaving(false);
        }
    };

    const handleDelete = async () => {
        if (!deletingTemplate) return;

        setSaving(true);
        try {
            await deleteDocumentTemplate(deletingTemplate.id);

            setTemplates(prev => prev.filter(t => t.id !== deletingTemplate.id));
            if (selectedTemplate?.id === deletingTemplate.id) {
                const remaining = templates.filter(t => t.id !== deletingTemplate.id && t.type === selectedType);
                setSelectedTemplate(remaining.length > 0 ? remaining[0] : null);
            }

            setShowDeleteModal(false);
            setDeletingTemplate(null);
            showToast('Template deleted successfully', 'success');
        } catch (error: any) {
            showToast(error.message || 'Failed to delete template', 'error');
        } finally {
            setSaving(false);
        }
    };

    const updateActiveTemplate = (field: keyof DocumentTemplate, value: any) => {
        if (!selectedTemplate) return;

        // When setting a template as default, unset is_default on all other templates of the same type
        if (field === 'is_default' && value === true) {
            setTemplates(prev => prev.map(t =>
                t.type === selectedTemplate.type && t.id !== selectedTemplate.id
                    ? { ...t, is_default: false }
                    : t
            ));
        }

        setSelectedTemplate(prev => prev ? { ...prev, [field]: value } : null);
    };

    const insertPlaceholder = (placeholder: string) => {
        if (!selectedTemplate) return;

        const textarea = document.getElementById('template-html') as HTMLTextAreaElement;
        if (textarea) {
            const start = textarea.selectionStart || 0;
            const end = textarea.selectionEnd || 0;
            const currentValue = selectedTemplate.template_html || '';
            const newValue = currentValue.substring(0, start) + placeholder + currentValue.substring(end);

            updateActiveTemplate('template_html', newValue);

            setTimeout(() => {
                textarea.focus();
                textarea.setSelectionRange(start + placeholder.length, start + placeholder.length);
            }, 0);
        } else {
            updateActiveTemplate('template_html', (selectedTemplate.template_html || '') + placeholder);
        }
    };

    const filteredTemplates = templates.filter(t => t.type === selectedType);
    const currentPlaceholders = placeholders[selectedType] || [];
    const currentTypeInfo = TEMPLATE_TYPES.find(t => t.value === selectedType);

    if (loading) {
        return <div className="animate-pulse space-y-4">
            <div className="h-10 bg-slate-100 rounded-xl w-1/4"></div>
            <div className="h-64 bg-slate-100 rounded-2xl"></div>
        </div>;
    }

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3 mb-2">
                <div className="p-2 bg-purple-50 text-purple-600 rounded-lg">
                    <FileText size={20} />
                </div>
                <div>
                    <h3 className="text-lg font-bold text-slate-900">Document Templates</h3>
                    <p className="text-sm text-slate-500">Customize print templates for KOT, invoices, receipts, and more.</p>
                </div>
            </div>

            {/* Type Selector */}
            <div className="flex flex-wrap gap-2">
                {TEMPLATE_TYPES.map(type => (
                    <button
                        key={type.value}
                        onClick={() => handleTypeChange(type.value)}
                        className={`px-4 py-2 rounded-xl text-sm font-medium transition-all ${selectedType === type.value
                            ? 'bg-purple-600 text-white shadow-md'
                            : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                    >
                        {type.label}
                    </button>
                ))}
            </div>

            <div className="flex flex-col lg:flex-row gap-8">
                {/* Template List */}
                <div className="w-full lg:w-72 shrink-0">
                    <div className="text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2 ml-4">
                        {currentTypeInfo?.label} Templates
                    </div>
                    <div className="space-y-1">
                        {filteredTemplates.map(template => (
                            <div key={template.id} className="group relative">
                                <button
                                    onClick={() => setSelectedTemplate(template)}
                                    className={`w-full text-left px-4 py-3 rounded-xl transition-all text-sm font-medium pr-10 ${selectedTemplate?.id === template.id
                                        ? 'bg-purple-50 text-purple-700 border border-purple-100'
                                        : 'text-slate-600 hover:bg-slate-50'
                                        }`}
                                >
                                    <div className="flex items-center gap-2">
                                        <span>{template.name}</span>
                                        {template.is_default && (
                                            <span className="text-[9px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded uppercase font-bold">
                                                Default
                                            </span>
                                        )}
                                    </div>
                                </button>
                                {!template.is_default && (
                                    <button
                                        onClick={() => {
                                            setDeletingTemplate(template);
                                            setShowDeleteModal(true);
                                        }}
                                        className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-red-600 bg-red-50 hover:bg-red-600 hover:text-white rounded-xl transition-all"
                                        title="Delete Template"
                                    >
                                        <Trash2 size={14} />
                                    </button>
                                )}
                            </div>
                        ))}
                    </div>
                    <div className="mt-4 pt-4 border-t border-slate-100">
                        <Button
                            variant="ghost"
                            onClick={() => {
                                setNewTemplate({ ...newTemplate, type: selectedType });
                                setShowAddModal(true);
                            }}
                            className="w-full justify-center border-2 border-dashed border-purple-100 text-purple-600 hover:bg-purple-50"
                            leftIcon={<Plus size={16} />}
                        >
                            Add New Template
                        </Button>
                    </div>
                </div>

                {/* Editor */}
                <div className="flex-1 min-w-0">
                    {!selectedTemplate ? (
                        <div className="p-12 text-center border-2 border-dashed border-slate-100 rounded-[2rem] bg-slate-50">
                            <AlertCircle className="mx-auto text-slate-300 mb-4" size={48} />
                            <p className="text-slate-500 font-medium">
                                No template selected. Create a new one or select from the list.
                            </p>
                        </div>
                    ) : (
                        <div className="space-y-6">
                            {/* Info Banner */}
                            <div className="p-4 bg-purple-50 rounded-2xl border border-purple-100">
                                <p className="text-sm font-semibold text-purple-900 mb-2">
                                    {currentTypeInfo?.description}
                                </p>
                                <div className="flex flex-wrap gap-1">
                                    <span className="text-[10px] uppercase font-bold text-purple-400 mr-2">
                                        Available Placeholders:
                                    </span>
                                    {currentPlaceholders.map(p => (
                                        <button
                                            key={p}
                                            onClick={() => insertPlaceholder(p)}
                                            className="text-[10px] bg-white hover:bg-purple-500 hover:text-white px-1.5 py-0.5 rounded border border-purple-100 font-mono text-purple-600 transition-colors"
                                            title={`Insert ${p}`}
                                        >
                                            {p}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div>
                                <Input
                                    label="Template Name"
                                    required
                                    value={selectedTemplate.name}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => updateActiveTemplate('name', e.target.value)}
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                                    Description
                                </label>
                                <textarea
                                    value={selectedTemplate.description || ''}
                                    onChange={(e) => updateActiveTemplate('description', e.target.value)}
                                    rows={2}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                                    HTML Template <span className="text-rose-500">*</span>
                                </label>
                                <textarea
                                    id="template-html"
                                    value={selectedTemplate.template_html}
                                    onChange={(e) => updateActiveTemplate('template_html', e.target.value)}
                                    rows={12}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm text-slate-700 min-h-[300px]"
                                />
                            </div>

                            <div>
                                <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                                    CSS Styling
                                </label>
                                <textarea
                                    id="template-css"
                                    value={selectedTemplate.template_css || ''}
                                    onChange={(e) => updateActiveTemplate('template_css', e.target.value)}
                                    rows={8}
                                    className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 font-mono text-sm text-slate-700"
                                />
                            </div>

                            <div className="flex items-center gap-3">
                                <input
                                    type="checkbox"
                                    id="is-default"
                                    checked={selectedTemplate.is_default}
                                    onChange={(e) => updateActiveTemplate('is_default', e.target.checked)}
                                    className="w-4 h-4 text-purple-600 rounded focus:ring-purple-500"
                                />
                                <label htmlFor="is-default" className="text-sm font-medium text-slate-700">
                                    Set as default template for {currentTypeInfo?.label}
                                </label>
                            </div>

                            <div className="pt-4 flex items-center justify-between border-t border-slate-100">
                                <div className="flex gap-3">
                                    <Button
                                        variant="secondary"
                                        onClick={() => setShowPreviewModal(true)}
                                        leftIcon={<Eye size={18} />}
                                    >
                                        Preview
                                    </Button>
                                    <Button
                                        onClick={handleSave}
                                        disabled={saving}
                                        isLoading={saving}
                                        leftIcon={!saving && <Save size={18} />}
                                    >
                                        Save Template
                                    </Button>
                                </div>
                                {selectedTemplate.updated_by && (
                                    <span className="text-[10px] text-slate-400 font-medium">
                                        Last updated by <span className="text-slate-600 font-bold">{selectedTemplate.updated_by}</span>
                                    </span>
                                )}
                            </div>
                        </div>
                    )}
                </div>
            </div>

            {/* Add Template Modal */}
            {showAddModal && (
                <AccessibleModal
                    isOpen
                    onClose={() => setShowAddModal(false)}
                    hideHeader
                    ariaLabelledBy="doc-create-template-title"
                    closeOnOverlayClick={false}
                    overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    panelClassName="bg-white rounded-[2rem] shadow-2xl w-full max-w-md p-8"
                    bodyClassName="contents"
                >
                            <h3 id="doc-create-template-title" className="text-xl font-bold text-slate-900 mb-6">Create New Template</h3>
                            <div className="space-y-4">
                                <Input
                                    label="Template Name"
                                    required
                                    value={newTemplate.name}
                                    onChange={(e: React.ChangeEvent<HTMLInputElement>) => setNewTemplate(prev => ({ ...prev, name: e.target.value }))}
                                />
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                                        Type <span className="text-rose-500">*</span>
                                    </label>
                                    <CustomSelect
                                        value={newTemplate.type}
                                        onChange={(val) => setNewTemplate(prev => ({ ...prev, type: val }))}
                                        options={TEMPLATE_TYPES}
                                    />
                                </div>
                                <div>
                                    <label className="block text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5 ml-1">
                                        Description
                                    </label>
                                    <textarea
                                        value={newTemplate.description}
                                        onChange={(e) => setNewTemplate(prev => ({ ...prev, description: e.target.value }))}
                                        rows={3}
                                        className="w-full px-4 py-3 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-purple-500 text-sm"
                                    />
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <Button variant="secondary" onClick={() => setShowAddModal(false)} className="flex-1">
                                    Cancel
                                </Button>
                                <Button onClick={handleCreate} disabled={saving} isLoading={saving} className="flex-1">
                                    Create
                                </Button>
                            </div>
                </AccessibleModal>
            )}

            {/* Delete Modal */}
            {showDeleteModal && (
                <AccessibleModal
                    isOpen
                    onClose={() => setShowDeleteModal(false)}
                    hideHeader
                    ariaLabelledBy="doc-delete-template-title"
                    closeOnOverlayClick={false}
                    overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-sm p-8"
                    bodyClassName="contents"
                >
                            <div className="flex flex-col items-center text-center space-y-4">
                                <div className="w-16 h-16 bg-rose-50 text-rose-500 rounded-full flex items-center justify-center">
                                    <AlertCircle size={32} />
                                </div>
                                <div>
                                    <h3 className="text-xl font-bold text-slate-900">Delete Template?</h3>
                                    <p className="text-sm text-slate-500 mt-2">
                                        Are you sure you want to delete &quot;{deletingTemplate?.name}&quot;? This action cannot be undone.
                                    </p>
                                </div>
                            </div>
                            <div className="flex gap-3 mt-6">
                                <Button variant="secondary" onClick={() => setShowDeleteModal(false)} className="flex-1">
                                    Cancel
                                </Button>
                                <Button variant="danger" onClick={handleDelete} disabled={saving} isLoading={saving} className="flex-1">
                                    Delete
                                </Button>
                            </div>
                </AccessibleModal>
            )}

            {/* Preview Modal */}
            {showPreviewModal && selectedTemplate && (
                <AccessibleModal
                    isOpen
                    onClose={() => setShowPreviewModal(false)}
                    hideHeader
                    ariaLabelledBy="doc-preview-title"
                    closeOnOverlayClick={false}
                    overlayClassName="fixed inset-0 flex items-center justify-center p-4 bg-black/60 backdrop-blur-sm"
                    panelClassName="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-hidden flex flex-col"
                    bodyClassName="contents"
                >
                            <div className="p-6 border-b border-slate-200 flex items-center justify-between">
                                <h3 id="doc-preview-title" className="text-xl font-bold text-slate-900">Template Preview</h3>
                                <button onClick={() => setShowPreviewModal(false)} className="p-2 hover:bg-slate-100 rounded-full">
                                    <X size={20} />
                                </button>
                            </div>
                            <div className="flex-1 overflow-auto p-6">
                                <div className="border-2 border-dashed border-slate-200 rounded-xl p-8 bg-slate-50">
                                    <style dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedTemplate.template_css || '', { FORCE_BODY: false, ALLOWED_TAGS: ['style'] }) }} />
                                    <div dangerouslySetInnerHTML={{ __html: DOMPurify.sanitize(selectedTemplate.template_html) }} />
                                </div>
                            </div>
                </AccessibleModal>
            )}
        </div>
    );
};
