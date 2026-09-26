import React from 'react';
import { DollarSign, ShoppingBag, Trophy, Users } from 'lucide-react';
import Skeleton from '../Skeleton';

import { formatCurrency } from '../../utils/currency';
const StatCard = React.memo(({ title, value, icon: Icon, color, loading }: { title: string, value: string, icon: any, color: string, loading?: boolean }) => (
    <div className="bg-white p-6 rounded-2xl shadow-sm border border-slate-100 flex items-start justify-between hover:shadow-md transition-shadow">
        <div className="min-w-0 flex-1">
            <p className="text-sm font-medium text-slate-500 mb-1 truncate">{title}</p>
            {loading ? (
                <Skeleton height={32} width="60%" className="mt-1" />
            ) : (
                <h3 className="text-2xl font-bold text-slate-800 whitespace-nowrap overflow-hidden text-ellipsis" title={value}>{value}</h3>
            )}
        </div>
        <div className={`p-3 rounded-xl ${color} shrink-0 ml-4`}>
            <Icon className="w-6 h-6 text-white" />
        </div>
    </div>
));

interface StatCardsGridProps {
    loading: boolean;
    totalSales: number;
    transactionCount: number;
    menuCount: number;
    staffCount: number;
}

export const StatCardsGrid: React.FC<StatCardsGridProps> = ({
    loading,
    totalSales,
    transactionCount,
    menuCount,
    staffCount
}) => {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-4 gap-4">
            <StatCard
                title="Total Sales"
                value={`${formatCurrency(totalSales)}`}
                icon={DollarSign}
                color="bg-emerald-500"
                loading={loading}
            />
            <StatCard
                title="Transactions"
                value={transactionCount.toString()}
                icon={ShoppingBag}
                color="bg-indigo-500"
                loading={loading}
            />
            <StatCard
                title="Total Menu"
                value={menuCount.toString()}
                icon={Trophy}
                color="bg-pink-500"
                loading={loading}
            />
            <StatCard
                title="Total Staff"
                value={staffCount.toString()}
                icon={Users}
                color="bg-orange-500"
                loading={loading}
            />
        </div>
    );
};
