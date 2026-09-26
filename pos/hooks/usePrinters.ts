import { useState, useEffect, useCallback } from 'react';
import { API_BASE, authenticatedFetch } from '../services/authService';

export interface Printer {
    id: string;
    branch_id: string;
    branch_name?: string;
    name: string;
    description?: string;
    printer_type: 'THERMAL_80MM' | 'THERMAL_58MM' | 'LASER' | 'A4';
    mode: 'LOCAL' | 'OFF';
    ip_address?: string;
    port?: number;
    is_active: boolean;
    sort_order: number;
    service_types: string[];
    created_at: string;
    updated_at: string;
}

export interface PrinterStatus extends Printer {
    pending_jobs: number;
    failed_jobs: number;
}

export interface AvailableService {
    value: string;
}

export interface PrintJob {
    id: string;
    status: 'PENDING' | 'PRINTED' | 'FAILED';
    service_type: string | null;
    error_message: string | null;
    retry_count: number;
    created_at: string;
    updated_at: string;
}

export interface Branch {
    id: string;
    name: string;
}

export interface PrinterFormData {
    name: string;
    description: string;
    printer_type: 'THERMAL_80MM' | 'THERMAL_58MM' | 'LASER' | 'A4';
    mode: 'LOCAL' | 'OFF';
    ip_address: string;
    port: number;
    is_active: boolean;
    sort_order: number;
    service_types: string[];
    target_branch_id?: string;
}

export const SERVICE_TYPES = [
    { value: 'KOT',          label: 'KOT (Kitchen Order Ticket)',              color: 'orange' },
    { value: 'BILL',         label: 'Bill (POS Checkout)',                      color: 'green'  },
    { value: 'RECEIPT',      label: 'Receipt (Unassigned — template only)',     color: 'indigo' },
    { value: 'CUSTOM_ORDER', label: 'Custom Order (Custom Item Slip)',          color: 'teal'   },
    { value: 'INVOICE',      label: 'Invoice (Customer Invoice)',               color: 'blue'   },
    { value: 'PAYOUT',       label: 'Payout (Staff Payout Slip)',               color: 'violet' },
];

export const PRINTER_TYPES = [
    { value: 'THERMAL_80MM', label: '80mm Thermal (Standard)' },
    { value: 'THERMAL_58MM', label: '58mm Thermal (Compact)' },
    { value: 'LASER',        label: 'Laser Printer' },
    { value: 'A4',           label: 'A4 / Letter' },
];

const BASE = `${API_BASE}/printers`;

export const usePrinters = () => {
    const [printers, setPrinters]                     = useState<Printer[]>([]);
    const [status, setStatus]                         = useState<PrinterStatus[]>([]);
    const [availableServices, setAvailableServices]   = useState<AvailableService[]>([]);
    const [loading, setLoading]                       = useState(true);
    const [statusLoading, setStatusLoading]           = useState(false);
    const [error, setError]                           = useState<string | null>(null);
    const [isMainBranch, setIsMainBranch]             = useState(false);
    const [branches, setBranches]                     = useState<Branch[]>([]);

    const fetchPrinters = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            const res = await authenticatedFetch(BASE);
            if (!res.ok) throw new Error('Failed to fetch printers');
            const data = await res.json();
            // Server now returns { printers, isMainBranch, branches } for all users
            if (Array.isArray(data)) {
                // Fallback: older server response was a plain array
                setPrinters(data);
            } else {
                setPrinters(data.printers ?? []);
                setIsMainBranch(data.isMainBranch ?? false);
                setBranches(data.branches ?? []);
            }
        } catch (err: any) {
            setError(err.message || 'Failed to load printers');
        } finally {
            setLoading(false);
        }
    }, []);

    const fetchStatus = useCallback(async () => {
        setStatusLoading(true);
        try {
            const res = await authenticatedFetch(`${BASE}/status`);
            if (res.ok) setStatus(await res.json());
        } catch { /* non-fatal */ } finally {
            setStatusLoading(false);
        }
    }, []);

    const fetchAvailableServices = useCallback(async () => {
        try {
            const res = await authenticatedFetch(`${BASE}/available-services`);
            if (res.ok) setAvailableServices(await res.json());
        } catch { /* non-fatal */ }
    }, []);

    useEffect(() => {
        fetchPrinters();
        fetchStatus();
        fetchAvailableServices();
    }, [fetchPrinters, fetchStatus, fetchAvailableServices]);

    const createPrinter = useCallback(async (data: PrinterFormData): Promise<Printer> => {
        const body: Record<string, any> = {
            name: data.name.trim(),
            description: data.description.trim() || null,
            printer_type: data.printer_type,
            mode: data.mode,
            ip_address: data.ip_address.trim() || null,
            port: data.port || 9100,
            is_active: data.is_active,
            sort_order: data.sort_order,
            service_types: data.service_types,
        };
        if (data.target_branch_id) body.target_branch_id = data.target_branch_id;

        const res = await authenticatedFetch(BASE, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to create printer');
        await fetchPrinters();
        await fetchStatus();
        return json;
    }, [fetchPrinters, fetchStatus]);

    const updatePrinter = useCallback(async (id: string, data: PrinterFormData): Promise<Printer> => {
        const body: Record<string, any> = {
            name: data.name.trim(),
            description: data.description.trim() || null,
            printer_type: data.printer_type,
            mode: data.mode,
            ip_address: data.ip_address.trim() || null,
            port: data.port || 9100,
            is_active: data.is_active,
            sort_order: data.sort_order,
            service_types: data.service_types,
        };
        if (data.target_branch_id) body.target_branch_id = data.target_branch_id;

        const res = await authenticatedFetch(`${BASE}/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
        });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to update printer');
        await fetchPrinters();
        await fetchStatus();
        return json;
    }, [fetchPrinters, fetchStatus]);

    const deletePrinter = useCallback(async (id: string): Promise<void> => {
        const res = await authenticatedFetch(`${BASE}/${id}`, { method: 'DELETE' });
        if (!res.ok) {
            const json = await res.json();
            throw new Error(json.error || 'Failed to delete printer');
        }
        await fetchPrinters();
        await fetchStatus();
    }, [fetchPrinters, fetchStatus]);

    const retryFailed = useCallback(async (id: string): Promise<number> => {
        const res = await authenticatedFetch(`${BASE}/${id}/retry`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to retry jobs');
        await fetchStatus();
        return json.requeued;
    }, [fetchStatus]);

    const testConnection = useCallback(async (
        id: string
    ): Promise<{ online: boolean; latency_ms: number | null; ip_address: string; port: number }> => {
        const res = await authenticatedFetch(`${BASE}/${id}/test`);
        if (!res.ok) throw new Error('Connection test failed');
        return res.json();
    }, []);

    const cancelPending = useCallback(async (id: string): Promise<number> => {
        const res = await authenticatedFetch(`${BASE}/${id}/cancel-pending`, { method: 'POST' });
        const json = await res.json();
        if (!res.ok) throw new Error(json.error || 'Failed to cancel pending jobs');
        await fetchStatus();
        return json.cancelled;
    }, [fetchStatus]);

    const getJobs = useCallback(async (id: string): Promise<PrintJob[]> => {
        const res = await authenticatedFetch(`${BASE}/${id}/jobs`);
        if (!res.ok) throw new Error('Failed to fetch jobs');
        return res.json();
    }, []);

    const deleteJob = useCallback(async (printerId: string, jobId: string): Promise<void> => {
        const res = await authenticatedFetch(`${BASE}/${printerId}/jobs/${jobId}`, { method: 'DELETE' });
        if (!res.ok) {
            const json = await res.json();
            throw new Error(json.error || 'Failed to delete job');
        }
        await fetchStatus();
    }, [fetchStatus]);

    return {
        printers, loading, error,
        status, statusLoading,
        availableServices,
        isMainBranch, branches,
        fetchPrinters, fetchStatus, fetchAvailableServices,
        createPrinter, updatePrinter, deletePrinter, retryFailed,
        testConnection, cancelPending, getJobs, deleteJob,
    };
};
