import { API_BASE, authenticatedFetch } from './authService';

const BASE = `${API_BASE}/student-orders`;
const ORDER_ID_RE = /^\d{4}-\d{2}-\d{2}-\d{4}$/;

export interface StudentOrderItem {
    id: string;
    name: string;
    price: number;
    category: string;
    quantity: number;
    itemTotal: number;
}

export interface StudentOrderResult {
    id: string;
    studentEmail: string;
    branchId: string;
    branchName: string;
    items: StudentOrderItem[];
    totalAmount: number;
    status: 'PENDING' | 'LOADED_TO_POS' | 'COMPLETED' | 'CANCELLED';
    createdAt: string;
}

export function isValidOrderIdFormat(id: string): boolean {
    return ORDER_ID_RE.test(id.trim());
}

// The server only allows orders belonging to the cashier's branch; admins send the
// branch selected in the POS header, non-admins are pinned to their own server-side.
function orderUrl(orderId: string, branchId: string, action = ''): string {
    return `${BASE}/${encodeURIComponent(orderId.trim())}${action ? `/${action}` : ''}?branchId=${encodeURIComponent(branchId)}`;
}

export async function fetchStudentOrder(orderId: string, branchId: string): Promise<StudentOrderResult> {
    const res = await authenticatedFetch(orderUrl(orderId, branchId));
    const data = await res.json() as StudentOrderResult & { error?: string };
    if (!res.ok) {
        throw Object.assign(new Error(data.error ?? `Error ${res.status}`), { status: res.status });
    }
    return data;
}

async function postStatusChange(orderId: string, branchId: string, action: 'load' | 'complete'): Promise<void> {
    const res = await authenticatedFetch(orderUrl(orderId, branchId, action), {
        method: 'POST'
    });
    if (!res.ok) {
        const data = await res.json() as { error?: string };
        throw Object.assign(new Error(data.error ?? `Error ${res.status}`), { status: res.status });
    }
}

export function markStudentOrderLoaded(orderId: string, branchId: string): Promise<void> {
    return postStatusChange(orderId, branchId, 'load');
}

export function markStudentOrderCompleted(orderId: string, branchId: string): Promise<void> {
    return postStatusChange(orderId, branchId, 'complete');
}
