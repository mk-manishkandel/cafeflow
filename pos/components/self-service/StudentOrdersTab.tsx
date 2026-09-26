import React from 'react';
import { ShoppingBag, Search } from 'lucide-react';
import Pagination from '../Pagination';
import { getAppTimezone } from '../../utils/dateUtils';
import { formatCurrency } from '../../utils/currency';

export type StudentOrderStatus = 'PENDING' | 'LOADED_TO_POS' | 'COMPLETED' | 'CANCELLED';

export interface StudentOrder {
    id: string;
    student_email: string;
    items: Array<{ id: string; name: string; price: number; quantity: number }>;
    total_amount: number | string;
    status: StudentOrderStatus;
    created_at: string;
    loaded_at: string | null;
    completed_at: string | null;
    branch_name?: string;
}

export const STUDENT_ORDER_STATUS: Record<StudentOrderStatus, { label: string; className: string }> = {
    PENDING: { label: 'Waiting for pickup', className: 'bg-amber-50 text-amber-700 border border-amber-100' },
    LOADED_TO_POS: { label: 'At POS', className: 'bg-indigo-50 text-indigo-700 border border-indigo-100' },
    COMPLETED: { label: 'Collected', className: 'bg-emerald-50 text-emerald-700 border border-emerald-100' },
    CANCELLED: { label: 'Cancelled', className: 'bg-slate-100 text-slate-500 border border-slate-200' }
};

const STATUS_FILTERS: Array<{ id: StudentOrderStatus | null; label: string }> = [
    { id: null, label: 'All' },
    { id: 'PENDING', label: 'Waiting for pickup' },
    { id: 'LOADED_TO_POS', label: 'At POS' },
    { id: 'COMPLETED', label: 'Collected' },
    { id: 'CANCELLED', label: 'Cancelled' }
];

interface StudentOrdersTabProps {
    orders: StudentOrder[];
    onSelect: (order: StudentOrder) => void;
    isMainBranch: boolean;
    statusFilter: StudentOrderStatus | null;
    onStatusFilterChange: (status: StudentOrderStatus | null) => void;
    search: string;
    onSearchChange: (search: string) => void;
    currentPage: number;
    totalPages: number;
    totalOrders: number;
    onPageChange: (page: number) => void;
    itemsPerPage: number;
}

const StudentOrdersTab: React.FC<StudentOrdersTabProps> = ({
    orders,
    onSelect,
    isMainBranch,
    statusFilter,
    onStatusFilterChange,
    search,
    onSearchChange,
    currentPage,
    totalPages,
    totalOrders,
    onPageChange,
    itemsPerPage
}) => {
    return (
        <div className="p-6 space-y-4">
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 justify-between">
                <div className="flex gap-1.5 overflow-x-auto scrollbar-hide">
                    {STATUS_FILTERS.map(f => (
                        <button
                            key={f.label}
                            onClick={() => onStatusFilterChange(f.id)}
                            className={`px-3 py-1 rounded-full text-[11px] font-bold transition-all flex-shrink-0 ${statusFilter === f.id
                                ? 'bg-indigo-600 text-white shadow-sm'
                                : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                                }`}
                        >
                            {f.label}
                        </button>
                    ))}
                </div>
                <div className="relative sm:w-72">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" aria-hidden="true" />
                    <input
                        type="search"
                        value={search}
                        onChange={e => onSearchChange(e.target.value)}
                        placeholder="Search order ID or email"
                        aria-label="Search student orders by order ID or email"
                        className="w-full pl-9 pr-3 py-2 text-sm rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/30 focus:border-indigo-400"
                    />
                </div>
            </div>

            {orders.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 text-slate-400">
                    <ShoppingBag size={48} className="mb-4 opacity-20" />
                    <p className="font-bold">No student orders found.</p>
                </div>
            ) : (
                <div className="space-y-4">
                    <div className="overflow-x-auto pt-1">
                        <table className="w-full text-left border-collapse">
                            <thead>
                                <tr className="border-b border-slate-200">
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Order ID</th>
                                    {isMainBranch && (
                                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Branch</th>
                                    )}
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Student</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Items</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Amount</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider">Status</th>
                                    <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right">Placed</th>
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-50">
                                {orders.map(order => {
                                    const items = Array.isArray(order.items) ? order.items : [];
                                    const itemsSummary = items.length
                                        ? items.map(i => `${i.name} x${i.quantity}`).join(', ')
                                        : 'No details';
                                    const status = STUDENT_ORDER_STATUS[order.status] ?? { label: order.status, className: 'bg-slate-100 text-slate-500' };

                                    return (
                                        <tr key={order.id} className="hover:bg-slate-50 transition-colors">
                                            <td className="px-6 py-4">
                                                <button
                                                    onClick={() => onSelect(order)}
                                                    className="px-3 py-1.5 bg-slate-100 text-slate-700 hover:bg-slate-200 rounded-lg font-mono text-xs font-bold transition-all border border-slate-200 whitespace-nowrap"
                                                >
                                                    {order.id}
                                                </button>
                                            </td>
                                            {isMainBranch && (
                                                <td className="px-6 py-4">
                                                    <span className="text-xs font-bold text-slate-500 bg-slate-100 px-2 py-1 rounded">
                                                        {order.branch_name}
                                                    </span>
                                                </td>
                                            )}
                                            <td className="px-6 py-4">
                                                <p className="text-xs font-medium text-slate-700 max-w-[200px] truncate" title={order.student_email}>
                                                    {order.student_email}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4">
                                                <p className="text-xs font-medium text-slate-600 max-w-[200px] truncate" title={itemsSummary}>
                                                    {itemsSummary}
                                                </p>
                                            </td>
                                            <td className="px-6 py-4 font-bold text-slate-800 whitespace-nowrap text-sm">{formatCurrency(Number(order.total_amount))}</td>
                                            <td className="px-6 py-4">
                                                <span className={`px-2.5 py-1 rounded-lg text-[10px] font-bold uppercase tracking-wider whitespace-nowrap ${status.className}`}>
                                                    {status.label}
                                                </span>
                                            </td>
                                            <td className="px-6 py-4 text-slate-500 text-[11px] font-bold text-right whitespace-nowrap">
                                                {new Date(order.created_at).toLocaleString('en-US', { timeZone: getAppTimezone() })}
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>

                    <div className="border-t border-slate-100 bg-slate-50/30">
                        <Pagination
                            currentPage={currentPage}
                            totalPages={totalPages}
                            onPageChange={onPageChange}
                            itemsPerPage={itemsPerPage}
                            totalItems={totalOrders}
                        />
                    </div>
                </div>
            )}
        </div>
    );
};

export default React.memo(StudentOrdersTab);
