import { API_BASE, authenticatedFetch } from './authService';

export interface LedgerEntry {
    id: string;
    entity_type: 'STAFF' | 'CONSUMER';
    entity_id: string;
    amount: number;
    type: 'CREDIT' | 'DEBIT';
    balance_before: number;
    balance_after: number;
    reference_id: string | null;
    reason: string;
    created_at: string;
}

export interface LedgerResponse {
    data: LedgerEntry[];
    pagination: {
        total: number;
        page: number;
        limit: number;
        totalPages: number;
    };
    currentBalance?: number;
}

export const getLedgerEntries = async (entityType: string, entityId: string, page = 1, limit = 50): Promise<LedgerResponse> => {
    const response = await authenticatedFetch(`${API_BASE}/ledger?entityType=${entityType}&entityId=${entityId}&page=${page}&limit=${limit}`);

    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.error || 'Failed to fetch ledger entries');
    }

    return response.json();
};
