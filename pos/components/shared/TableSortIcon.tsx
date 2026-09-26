import React from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

interface TableSortIconProps {
    column: string;
    sortKey: string | null;
    sortDir: 'asc' | 'desc';
}

export const TableSortIcon: React.FC<TableSortIconProps> = ({ column, sortKey, sortDir }) => {
    if (sortKey !== column) return <ArrowUpDown size={12} className="opacity-40" />;
    return sortDir === 'asc' ? <ArrowUp size={12} /> : <ArrowDown size={12} />;
};
