import React, { useState, useEffect, useRef } from 'react';
import { Mail, Send, AlertCircle, Calendar } from 'lucide-react';
import { useUI } from '../../ui/UIContext';
import { getEmailTemplates, sendBulkEmail } from '../../../services/setupService';
import { CustomSelect } from '../../shared/CustomSelect';
import { Button } from '../../ui/Button';
import { AccessibleModal } from '../../ui/AccessibleModal';
import logger from '../../../utils/logger';

interface EmailActionModalProps {
    isOpen: boolean;
    onClose: () => void;
    recipientIds: string[];
    type: 'STAFF' | 'CONSUMER';
    recipientNames: string[];
}

export const EmailActionModal = ({ isOpen, onClose, recipientIds, type, recipientNames }: EmailActionModalProps) => {
    const isStaff = type === 'STAFF';
    const allowedKeys = isStaff
        ? ['email_template_admin_report', 'email_template_monthly_statement']
        : ['email_template_consumer_aggregate_report', 'email_template_monthly_statement'];

    const { showToast } = useUI();
    const [templates, setTemplates] = useState<any>({});
    const [loading, setLoading] = useState(false);
    const [sending, setSending] = useState(false);
    const [selectedTemplateKey, setSelectedTemplateKey] = useState('');
    const [sendToAdmin, setSendToAdmin] = useState(false);
    const NEPALI_MONTHS = [
        'Baishakh', 'Jestha', 'Ashadh', 'Shrawan', 'Bhadra', 'Ashwin',
        'Kartik', 'Mangshir', 'Poush', 'Magh', 'Falgun', 'Chaitra'
    ];

    const [month, setMonth] = useState('');
    const [startDate, setStartDate] = useState('');
    const [endDate, setEndDate] = useState('');
    const prevSendToAdmin = useRef(sendToAdmin);

    useEffect(() => {
        if (isOpen) {
            setSendToAdmin(false);
            prevSendToAdmin.current = false;
            setMonth('');
            setStartDate('');
            setEndDate('');
            fetchInitialData();
        }
    }, [isOpen]);

    const fetchInitialData = async () => {
        setLoading(true);
        try {
            const templateData = await getEmailTemplates(true);
            setTemplates(templateData);
        } catch (err) {
            logger.error('Failed to load email template data', err);
            showToast('Failed to load initial data', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => {
        if (!isOpen || Object.keys(templates).length === 0) return;
        if (prevSendToAdmin.current === sendToAdmin) return;
        prevSendToAdmin.current = sendToAdmin;

        // Reset selected template when destination changes
        // Clear selection if current template doesn't match the new destination
        if (selectedTemplateKey) {
            if (sendToAdmin) {
                // If switching to admin, keep only if it's an admin/aggregate report
                if (selectedTemplateKey !== 'email_template_admin_report' &&
                    selectedTemplateKey !== 'email_template_consumer_aggregate_report') {
                    setSelectedTemplateKey('');
                }
            } else {
                // If switching to individual, keep only if it's monthly statement
                if (selectedTemplateKey !== 'email_template_monthly_statement') {
                    setSelectedTemplateKey('');
                }
            }
        }
    }, [sendToAdmin, templates, isOpen, selectedTemplateKey]);

    const handleSend = async () => {
        if (!selectedTemplateKey || !month) {
            showToast('Please select email template and target period', 'error');
            return;
        }

        // Validate date range for individual emails
        if (!sendToAdmin && (!startDate || !endDate)) {
            showToast('Please select start date and end date', 'error');
            return;
        }

        if (!sendToAdmin && startDate && endDate && new Date(startDate) > new Date(endDate)) {
            showToast('Start date cannot be after end date', 'error');
            return;
        }

        setSending(true);
        try {
            await sendBulkEmail({
                templateKey: selectedTemplateKey,
                recipientIds,
                type,
                sendToAdmin,
                params: {
                    month,
                    startDate: !sendToAdmin ? startDate : undefined,
                    endDate: !sendToAdmin ? endDate : undefined
                }
            });
            showToast(sendToAdmin ? 'Report process started. Check admin email shortly.' : 'Batch process started. Check admin email for summary later.', 'success');
            onClose();
        } catch (err: any) {
            showToast(err.message || 'Failed to trigger emails', 'error');
        } finally {
            setSending(false);
        }
    };

    useEffect(() => {
        if (!selectedTemplateKey) return;
        if (selectedTemplateKey === 'email_template_admin_report' || selectedTemplateKey === 'email_template_consumer_aggregate_report') {
            setSendToAdmin(true);
        } else {
            setSendToAdmin(false);
        }
    }, [selectedTemplateKey]);

    const replaceLabelPlaceholders = (text: string) => {
        if (!text) return '';
        return text
            .replace(/\{\{month\}\}/g, month)
            .replace(/\{\{year\}\}/g, '')
            .replace(/\{\{date\}\}/g, new Date().toLocaleDateString())
            .replace(/\{\{.*?\}\}/g, '')
            .replace(/\s*-\s*$/, '')
            .trim();
    };

    // Filter templates based on sendToAdmin toggle
    const filteredKeys = allowedKeys.filter(key => {
        if (sendToAdmin) {
            // For admin destination: only show admin report/aggregate report
            return key === 'email_template_admin_report' || key === 'email_template_consumer_aggregate_report';
        } else {
            // For individual emails: only show monthly statement
            return key === 'email_template_monthly_statement';
        }
    });

    const templateOptions = filteredKeys.map(key => {
        const t = templates[key] || {};
        const label = t.label || t.subject || key;
        return {
            value: key,
            label: replaceLabelPlaceholders(label)
        };
    });

    const monthOptions = NEPALI_MONTHS.map(m => ({
        value: m,
        label: m,
        icon: Calendar
    }));

    return (
        <AccessibleModal
            isOpen={isOpen}
            onClose={onClose}
            title="Batch Email Action"
            subtitle="Communication System"
            headerIcon={
                <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center text-white shadow-lg shadow-indigo-100">
                    <Mail size={20} />
                </div>
            }
            maxWidth="lg"
            footer={
                <div className="flex justify-end gap-3 w-full">
                    <Button variant="secondary" type="button" onClick={onClose} className="shadow-none">Cancel</Button>
                    <Button
                        onClick={handleSend}
                        disabled={sending || !selectedTemplateKey}
                        isLoading={sending}
                        leftIcon={!sending && <Send size={18} />}
                    >
                        {sending ? 'Processing...' : 'Send Batch Now'}
                    </Button>
                </div>
            }
        >
            <div className="space-y-6">
                {/* Send to Admin Toggle */}
                <div className={`p-4 rounded-2xl border transition-all flex items-center justify-between ${sendToAdmin ? 'bg-indigo-600 border-indigo-700 shadow-lg shadow-indigo-100' : 'bg-slate-50 border-slate-100'}`}>
                    <div className="flex items-center gap-3">
                        <div className={`w-8 h-8 rounded-lg flex items-center justify-center transition-colors ${sendToAdmin ? 'bg-white/20 text-white' : 'bg-white text-indigo-600 shadow-sm'}`}>
                            <Mail size={16} />
                        </div>
                        <div>
                            <p className={`text-[10px] font-black uppercase tracking-wider transition-colors ${sendToAdmin ? 'text-white' : 'text-slate-700'}`}>Target Destination</p>
                            <p className={`text-[10px] font-bold italic transition-colors leading-tight ${sendToAdmin ? 'text-indigo-100' : 'text-slate-500'}`}>
                                {sendToAdmin ? 'Direct Administrator Inbox' : 'Individual Recipient Emails'}
                            </p>
                        </div>
                    </div>
                    <label className="relative inline-flex items-center cursor-pointer">
                        <input
                            type="checkbox"
                            className="sr-only peer"
                            checked={sendToAdmin}
                            onChange={(e) => setSendToAdmin(e.target.checked)}
                        />
                        <div className={`w-11 h-6 rounded-full peer transition-all after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all ${sendToAdmin ? 'bg-white/30 after:translate-x-full' : 'bg-slate-200'}`}></div>
                    </label>
                </div>

                {/* Recipients Info */}
                {!sendToAdmin && (
                    <div className="p-4 bg-slate-50 border border-slate-100 rounded-2xl">
                        <p className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3 ml-1">Included Recipients ({recipientIds.length})</p>
                        <div className="flex flex-wrap gap-2">
                            {recipientNames.slice(0, 8).map((name, i) => (
                                <span key={name ?? i} className="px-3 py-1 bg-white border border-slate-200 rounded-full text-[10px] font-black uppercase text-slate-600 shadow-sm">
                                    {name}
                                </span>
                            ))}
                            {recipientNames.length > 8 && (
                                <span className="px-3 py-1 bg-indigo-50 border border-indigo-100 rounded-full text-[10px] font-black uppercase text-indigo-600">
                                    +{recipientNames.length - 8} MORE
                                </span>
                            )}
                        </div>
                    </div>
                )}

                {/* Template Selection */}
                <div className="space-y-4">
                    <CustomSelect
                        label="Email Content Template"
                        required
                        value={selectedTemplateKey}
                        onChange={setSelectedTemplateKey}
                        options={templateOptions}
                        placeholder="Select a template..."
                        disabled={loading}
                        searchable={true}
                    />

                    <div className="space-y-1.5">
                        <label className="text-[10px] font-black text-slate-400 ml-1 uppercase tracking-widest">
                            Target Period <span className="text-rose-500">*</span>
                        </label>
                        <CustomSelect
                            value={month}
                            onChange={setMonth}
                            options={monthOptions}
                            placeholder="Select month..."
                            searchable={false}
                            required
                        />
                        <p className="text-[10px] text-slate-400 px-1 font-bold italic leading-tight">
                            The template's period tag will be dynamically replaced by this selection.
                        </p>
                    </div>

                    {/* Date Range - Only for Individual Recipient Emails */}
                    {!sendToAdmin && (
                        <div className="grid grid-cols-2 gap-4 p-4 bg-indigo-50 border border-indigo-100 rounded-2xl">
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-indigo-600 ml-1 uppercase tracking-widest">
                                    Start Date <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={startDate}
                                    onChange={(e) => setStartDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm bg-white"
                                    required
                                />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[10px] font-black text-indigo-600 ml-1 uppercase tracking-widest">
                                    End Date <span className="text-rose-500">*</span>
                                </label>
                                <input
                                    type="date"
                                    value={endDate}
                                    onChange={(e) => setEndDate(e.target.value)}
                                    className="w-full px-4 py-3 rounded-xl border border-indigo-200 focus:outline-none focus:ring-2 focus:ring-indigo-500 transition-all text-sm bg-white"
                                    required
                                />
                            </div>
                            <p className="text-[10px] text-indigo-700 px-1 font-bold italic leading-tight col-span-2">
                                Statement data will be filtered to transactions within this date range for each recipient.
                            </p>
                        </div>
                    )}
                </div>

                {/* Batch Alert */}
                <div className="flex gap-4 p-4 bg-amber-50 rounded-2xl border border-amber-100">
                    <AlertCircle className="w-5 h-5 text-amber-500 shrink-0 mt-0.5" />
                    <div className="space-y-1">
                        <p className="text-[10px] font-black text-amber-800 uppercase tracking-widest">Queue System Info</p>
                        <p className="text-xs text-amber-700 leading-relaxed font-bold">
                            Batch operations run asynchronously. A summary report will be sent to the admin upon successful queuing.
                        </p>
                    </div>
                </div>
            </div>
        </AccessibleModal>
    );
};
