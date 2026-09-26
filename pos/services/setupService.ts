import { PaymentMethodSettings, DocumentTemplate } from '../types';
import { API_BASE, authenticatedFetch } from './authService';
import { ApiError } from './errors';
import logger from '../utils/logger';

// --- Payment Methods ---

// --- Cache Management ---

const _pmCache = { data: null as PaymentMethodSettings[] | null, key: null as string | null, time: 0 };
let _pmPromise: Promise<PaymentMethodSettings[]> | null = null;
const _templatesCache = { data: null as any, time: 0 };
const _docTemplatesCache: Record<string, { data: any, time: number }> = {};

export const invalidateSetupCache = () => {
    _pmCache.data = null;
    _pmCache.key = null;
    _pmCache.time = 0;
    _pmPromise = null;
    _templatesCache.data = null;
    _templatesCache.time = 0;
    Object.keys(_docTemplatesCache).forEach(key => delete _docTemplatesCache[key]);
};

// Clears all cached entries for a given template type (e.g. 'BILL') so that
// the next print call fetches fresh data regardless of which branchId was used
// as the cache key. Pass no type to clear everything.
export const invalidateDocumentTemplateCache = (type?: string) => {
    const prefix = type ? `${type}_` : '';
    Object.keys(_docTemplatesCache).forEach(key => {
        if (!prefix || key.startsWith(prefix) || key === 'all_global') {
            delete _docTemplatesCache[key];
        }
    });
};

export const getPaymentMethods = async (branchId?: string, forceRefresh = false, signal?: AbortSignal): Promise<PaymentMethodSettings[]> => {
    const cacheKey = branchId || 'global';

    if (!forceRefresh) {
        if (_pmPromise && _pmCache.key === cacheKey && !signal) return _pmPromise;
        // Removed manual api caching
    }

    const promise = (async () => {
        try {
            const url = branchId
                ? `${API_BASE}/setup/payment-methods?branchId=${branchId}`
                : `${API_BASE}/setup/payment-methods`;
            const response = await authenticatedFetch(url, { signal });
            if (!response.ok) throw new ApiError('Failed to fetch payment methods', response.status);
            const data = await response.json();
            _pmCache.data = data;
            _pmCache.key = cacheKey;
            _pmCache.time = Date.now();
            return data;
        } catch (err) {
            logger.error('Failed to fetch payment methods', err);
            throw err;
        } finally {
            _pmPromise = null;
        }
    })();

    _pmPromise = promise;
    return promise;
};

export const addPaymentMethod = async (name: string, type: string, qrType: string = 'none', qrData: string | null = null, showQrInPos: boolean = false, branchId?: string) => {
    const url = branchId
        ? `${API_BASE}/setup/payment-methods?branchId=${branchId}`
        : `${API_BASE}/setup/payment-methods`;
    const response = await authenticatedFetch(url, {
        method: 'POST',
        headers: {},
        body: JSON.stringify({ name, type, qrType, qrData, showQrInPos })
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to add method');
    }
    invalidateSetupCache();
    return await response.json();
};

export const updatePaymentMethod = async (id: string, name: string, type: string, qrType: string = 'none', qrData: string | null = null, showQrInPos: boolean = false) => {
    const response = await authenticatedFetch(`${API_BASE}/setup/payment-methods/${id}`, {
        method: 'PUT',
        headers: {},
        body: JSON.stringify({ name, type, qrType, qrData, showQrInPos })
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update method');
    }
    invalidateSetupCache();
    return await response.json();
};

export const deletePaymentMethod = async (id: string) => {
    const response = await authenticatedFetch(`${API_BASE}/setup/payment-methods/${id}`, {
        method: 'DELETE',
        headers: {}
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete method');
    }
    invalidateSetupCache();
};

// --- Email Config ---

export const getEmailConfig = async () => {
    const response = await authenticatedFetch(`${API_BASE}/setup/email-config`);
    if (!response.ok) throw new Error('Failed to fetch email config');
    return await response.json();
};

export const updateEmailConfig = async (config: any) => {
    const response = await authenticatedFetch(`${API_BASE}/setup/email-config`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify(config)
    });
    if (!response.ok) throw new Error('Failed to save settings');
    invalidateSetupCache();
    return await response.json();
};

export const testEmailConfig = async (config: any) => {
    const response = await authenticatedFetch(`${API_BASE}/setup/email-config/test`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify(config)
    });
    if (!response.ok) {
        let msg = 'Test failed';
        try { const d = await response.json(); msg = d.error || msg; } catch (_) {}
        throw new Error(msg);
    }
    return await response.json();
};

// --- Email Templates ---

const TEMPLATES_TTL = 10 * 60 * 1000; // 10 minutes

export const getEmailTemplates = async (forceRefresh = false) => {
    if (!forceRefresh && _templatesCache.data && (Date.now() - _templatesCache.time) < TEMPLATES_TTL) {
        return _templatesCache.data;
    }
    const response = await authenticatedFetch(`${API_BASE}/setup/email-templates`);
    if (!response.ok) throw new Error('Failed to fetch templates');
    const data = await response.json();
    _templatesCache.data = data;
    _templatesCache.time = Date.now();
    return data;
};

export const updateEmailTemplate = async (key: string, template: any) => {
    const response = await authenticatedFetch(`${API_BASE}/setup/email-templates`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify({ key, template })
    });
    if (!response.ok) throw new Error('Failed to update template');
    invalidateSetupCache();
    return await response.json();
};

export const testEmailTemplate = async (template: any) => {
    const response = await authenticatedFetch(`${API_BASE}/setup/email-templates/test`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify({ template })
    });
    if (!response.ok) {
        let msg = 'Test failed';
        try { const d = await response.json(); msg = d.error || msg; } catch (_) {}
        throw new Error(msg);
    }
    return await response.json();
};

export const deleteEmailTemplate = async (key: string) => {
    const response = await authenticatedFetch(`${API_BASE}/setup/email-templates/${key}`, {
        method: 'DELETE',
        headers: {}
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete template');
    }
    invalidateSetupCache();
};

export const sendBulkEmail = async (params: { templateKey: string; recipientIds: string[]; type: 'STAFF' | 'CONSUMER'; sendToAdmin?: boolean; attachmentTemplateId?: string | null; params?: any }) => {
    const response = await authenticatedFetch(`${API_BASE}/setup/email-templates/send`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify(params)
    });
    if (!response.ok) {
        let msg = 'Failed to trigger email action';
        try { const d = await response.json(); msg = d.error || msg; } catch (_) {}
        throw new Error(msg);
    }
    return await response.json();
};

// --- API Keys ---

export const getApiKeys = async () => {
    const response = await authenticatedFetch(`${API_BASE}/api-keys`);
    if (!response.ok) throw new Error('Failed to fetch API keys');
    return await response.json();
};

export const generateApiKey = async (name: string, branchId: string | null, scope: string | null = null) => {
    const response = await authenticatedFetch(`${API_BASE}/api-keys`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify({ name, branch_id: branchId, scope })
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to generate key');
    }
    return await response.json();
};

export const revokeApiKey = async (id: string) => {
    const response = await authenticatedFetch(`${API_BASE}/api-keys/${id}`, {
        method: 'DELETE',
        headers: {}
    });
    if (!response.ok) throw new Error('Failed to revoke key');
};

export const getReportSchemas = async () => {
    const response = await authenticatedFetch(`${API_BASE}/setup/report-schemas`);
    if (!response.ok) throw new Error('Failed to fetch report schemas');
    return await response.json();
};

// --- Document Templates ---

const DOC_TEMPLATES_TTL = 10 * 60 * 1000; // 10 minutes

export const getDocumentTemplates = async (type?: string, branchId?: string, forceRefresh = false) => {
    const cacheKey = `${type || 'all'}_${branchId || 'global'}`;
    const cached = _docTemplatesCache[cacheKey];

    if (!forceRefresh && cached && (Date.now() - cached.time) < DOC_TEMPLATES_TTL) {
        return cached.data;
    }

    let url = `${API_BASE}/document-templates`;
    const params = new URLSearchParams();
    if (type) params.append('type', type);
    if (branchId) params.append('branchId', branchId);
    if (params.toString()) url += `?${params.toString()}`;

    const response = await authenticatedFetch(url);
    if (!response.ok) throw new Error('Failed to fetch document templates');
    
    const data = await response.json();
    _docTemplatesCache[cacheKey] = { data, time: Date.now() };
    return data;
};

export const getDocumentTemplate = async (id: string) => {
    const response = await authenticatedFetch(`${API_BASE}/document-templates/${id}`);
    if (!response.ok) throw new Error('Failed to fetch document template');
    return await response.json();
};

export const createDocumentTemplate = async (template: Partial<DocumentTemplate>) => {
    const response = await authenticatedFetch(`${API_BASE}/document-templates`, {
        method: 'POST',
        headers: {},
        body: JSON.stringify(template)
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to create document template');
    }
    invalidateSetupCache();
    return await response.json();
};

export const updateDocumentTemplate = async (id: string, template: Partial<DocumentTemplate>) => {
    const response = await authenticatedFetch(`${API_BASE}/document-templates/${id}`, {
        method: 'PUT',
        headers: {},
        body: JSON.stringify(template)
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to update document template');
    }
    invalidateSetupCache();
    return await response.json();
};

export const deleteDocumentTemplate = async (id: string) => {
    const response = await authenticatedFetch(`${API_BASE}/document-templates/${id}`, {
        method: 'DELETE',
        headers: {}
    });
    if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete document template');
    }
    invalidateSetupCache();
};

export const getDocumentTemplatePlaceholders = async () => {
    const response = await authenticatedFetch(`${API_BASE}/document-templates/placeholders`);
    if (!response.ok) throw new Error('Failed to fetch template placeholders');
    return await response.json();
};

