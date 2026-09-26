import { BarChart3, ShoppingBag, FileText, Users, UserCog, Settings, Shield, Monitor } from 'lucide-react';

export const PERMISSION_GROUPS = [
    {
        name: 'Dashboard & Reports',
        icon: BarChart3,
        permissions: [
            { id: 'VIEW_DASHBOARD', label: 'View Dashboard' },
            { id: 'VIEW_REPORTS', label: 'View Consumption Reports' },
            { id: 'VIEW_ITEM_SALES_REPORT', label: 'View Item Sales Reports' },
            { id: 'EXPORT_REPORTS', label: 'Export Reports' },
            { id: 'VIEW_AUDIT_LOGS', label: 'View Audit Logs' }
        ]
    },
    {
        name: 'POS & Transactions',
        icon: ShoppingBag,
        permissions: [
            { id: 'ACCESS_POS', label: 'Access POS' },
            { id: 'TRANSACTION_VIEW', label: 'View Transactions' },
            { id: 'TRANSACTION_REFUND', label: 'Refund Transactions' },
            { id: 'TRANSACTION_EDIT', label: 'Edit Transaction' },
            { id: 'TRANSACTION_DELETE', label: 'Delete Transactions' },
            { id: 'TRANSACTION_EXPORT', label: 'Export Transactions' }
        ]
    },
    {
        name: 'Menu Management',
        icon: FileText,
        permissions: [
            { id: 'MENU_VIEW', label: 'View Menu' },
            { id: 'MENU_ADD_ITEM', label: 'Add Items' },
            { id: 'MENU_EDIT_ITEM', label: 'Edit Items' },
            { id: 'MENU_DELETE_ITEM', label: 'Delete Items' },
            { id: 'MENU_MANAGE_CATEGORIES', label: 'Manage Categories' },
            { id: 'MENU_BULK_IMPORT', label: 'Bulk Import' }
        ]
    },
    {
        name: 'Staff Management',
        icon: Users,
        permissions: [
            { id: 'STAFF_VIEW', label: 'View Staff' },
            { id: 'STAFF_ADD', label: 'Add Staff' },
            { id: 'STAFF_EDIT', label: 'Edit Staff' },
            { id: 'STAFF_DELETE', label: 'Delete Staff' },
            { id: 'STAFF_RESET', label: 'Reset Allowances' },
            { id: 'STAFF_BULK_IMPORT', label: 'Bulk Import' },
            { id: 'STAFF_SEND_NOTIFICATION', label: 'Notifications' },
            { id: 'STAFF_SEND_STATEMENT', label: 'Send Account Statement' }
        ]
    },
    {
        name: 'Consumer Management',
        icon: UserCog,
        permissions: [
            { id: 'CONSUMER_VIEW', label: 'View Consumers' },
            { id: 'CONSUMER_ADD', label: 'Add Consumers' },
            { id: 'CONSUMER_EDIT', label: 'Edit Consumers' },
            { id: 'CONSUMER_DELETE', label: 'Delete Consumers' },
            { id: 'CONSUMER_RESET', label: 'Reset Allowances' },
            { id: 'CONSUMER_SEND_STATEMENT', label: 'Send Account Statement' }
        ]
    },
    {
        name: 'Business Setup',
        icon: Settings,
        permissions: [
            { id: 'MANAGE_BRANCHES', label: 'Manage Branches' },
            { id: 'MANAGE_PAYMENT_METHODS', label: 'Manage Payment Methods' },
            { id: 'MANAGE_EMAIL_CONFIG', label: 'Email Configuration' },
            { id: 'MANAGE_EMAIL_TEMPLATES', label: 'Email Templates' }
        ]
    },
    {
        name: 'System Administration',
        icon: Shield,
        permissions: [
            { id: 'MANAGE_USERS', label: 'Manage Users' },
            { id: 'MANAGE_ROLES', label: 'Manage Roles' },
            { id: 'MANAGE_API_KEYS', label: 'Manage API Keys' }
        ]
    },
    {
        name: 'Self-Service Management',
        icon: Monitor,
        permissions: [
            { id: 'SELF_SERVICE_VIEW', label: 'View Self-Service Status' },
            { id: 'SELF_SERVICE_MANAGE', label: 'Manage Menu Availability' },
            { id: 'SELF_SERVICE_VIEW_TRANSACTIONS', label: 'View Order History' },
            { id: 'SELF_SERVICE_VIEW_LOGS', label: 'View Activity Logs' }
        ]
    }
];

export const PROTECTED_ROLES = ['Admin', 'Manager', 'Staff'];
export const ALL_PERMISSIONS = PERMISSION_GROUPS.flatMap(g => g.permissions.map(p => p.id));
