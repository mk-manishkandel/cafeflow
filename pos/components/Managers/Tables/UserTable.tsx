import React from 'react';
import { Edit, Trash2, Ban, CheckCircle2 } from 'lucide-react';
import clsx from 'clsx';
import { User } from '../../../types';
import { TableSortIcon } from '../../shared/TableSortIcon';
import { EmptyState } from '../../shared/EmptyState';

interface UserTableProps {
    users: User[];
    onSort: (key: string) => void;
    sortKey: string;
    sortDir: 'asc' | 'desc';
    onEdit: (user: User) => void;
    onDelete: (user: User) => void;
    onToggleActive: (user: User) => void;
    canManage: boolean;
    searchQuery: string;
}

export const UserTable = ({
    users,
    onSort,
    sortKey,
    sortDir,
    onEdit,
    onDelete,
    onToggleActive,
    canManage,
    searchQuery
}: UserTableProps) => {
    return (
        <div className="overflow-x-auto pt-1">
            <table className="w-full text-left min-w-[500px]">
                <thead className="bg-slate-50 border-b border-slate-200">
                    <tr>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors leading-tight"
                            onClick={() => onSort('username')}
                        >
                            <div className="flex items-center gap-2">
                                Username
                                <TableSortIcon column="username" sortKey={sortKey} sortDir={sortDir} />
                            </div>
                        </th>
                        <th className="px-6 py-4 cursor-pointer hover:bg-slate-100 transition-colors"
                            onClick={() => onSort('role')}
                        >
                            <div className="flex items-center gap-2">
                                Role
                                <TableSortIcon column="branchId" sortKey={sortKey} sortDir={sortDir} />
                            </div>
                        </th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider leading-tight">Status</th>
                        <th className="px-6 py-4 text-xs font-bold text-slate-500 uppercase tracking-wider text-right leading-tight">Actions</th>
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                    {users.length > 0 ? (
                        users.map(user => (
                            <tr key={user.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-6 py-4 font-medium text-slate-800 flex items-center gap-3">
                                    <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center font-bold text-xs">
                                        {user.username.substring(0, 2).toUpperCase()}
                                    </div>
                                    {user.username}
                                </td>
                                <td className="px-6 py-4">
                                    <span className={clsx(
                                        "px-2 py-1 rounded-full text-xs font-bold uppercase",
                                        user.role?.toLowerCase() === 'admin' ? "bg-purple-100 text-purple-700" : "bg-blue-50 text-blue-600"
                                    )}>
                                        {user.role}
                                    </span>
                                </td>
                                <td className="px-6 py-4">
                                    <span className={clsx(
                                        "px-2 py-1 rounded-full text-xs font-bold uppercase",
                                        user.isActive === false ? "bg-red-50 text-red-600" : "bg-emerald-50 text-emerald-600"
                                    )}>
                                        {user.isActive === false ? 'Disabled' : 'Active'}
                                    </span>
                                </td>
                                <td className="px-6 py-4 text-right space-x-2">
                                    {canManage && (
                                        <>
                                            <button
                                                onClick={() => onToggleActive(user)}
                                                className={clsx(
                                                    "p-2 rounded-lg transition-colors",
                                                    user.isActive === false
                                                        ? "text-slate-400 hover:text-emerald-600 hover:bg-emerald-50"
                                                        : "text-slate-400 hover:text-red-600 hover:bg-red-50"
                                                )}
                                                title={user.isActive === false ? 'Enable User' : 'Disable User'}
                                                aria-label={`${user.isActive === false ? 'Enable' : 'Disable'} user ${user.username}`}
                                            >
                                                {user.isActive === false ? <CheckCircle2 size={18} aria-hidden="true" /> : <Ban size={18} aria-hidden="true" />}
                                            </button>
                                            <button
                                                onClick={() => onEdit(user)}
                                                className="p-2 text-slate-400 hover:text-indigo-600 hover:bg-indigo-50 rounded-lg transition-colors"
                                                title="Edit User"
                                                aria-label={`Edit user ${user.username}`}
                                            >
                                                <Edit size={18} aria-hidden="true" />
                                            </button>
                                            <button
                                                onClick={() => onDelete(user)}
                                                className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                                                title="Delete User"
                                                aria-label={`Delete user ${user.username}`}
                                            >
                                                <Trash2 size={18} aria-hidden="true" />
                                            </button>
                                        </>
                                    )}
                                </td>
                            </tr>
                        ))
                    ) : (
                        <tr>
                            <td colSpan={4} className="py-20 text-center">
                                <EmptyState title={searchQuery ? "No users match your search." : "No users found."} />
                            </td>
                        </tr>
                    )}
                </tbody>
            </table>
        </div>
    );
};
