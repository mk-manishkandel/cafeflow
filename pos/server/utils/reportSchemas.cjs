const REPORT_SCHEMAS = {
    'STAFF_LIST': ['ID', 'Name', 'Email', 'Mobile', 'Department', 'Monthly Allowance (Rs)', 'Spent (Rs)', 'Payable (Rs)'],
    'CONSUMER_LIST': ['ID', 'Name', 'Email', 'Mobile', 'Type', 'Category', 'Monthly Allowance (Rs)', 'Current Balance (Rs)', 'Total Spent (Rs)', 'Account Payable (Rs)', 'Active Subscriptions', 'Joined Date'],
    'TRANSACTIONS_HISTORY': ['ID', 'Date', 'Type', 'Entity', 'Amount (Rs)', 'Payment Method', 'Status', 'Reference', 'Cashier'],
    'CONSUMPTION_REPORTS': ['Order ID', 'Date', 'Customer Name', 'Customer Type', 'Items', 'Total Items', 'Total Paid (Rs)', 'Payment Method', 'Cashier'],
    'ITEM_ANALYTICS': ['Item', 'Category', 'Quantity Sold', 'Gross Revenue (Rs)', 'Net Revenue (Rs)'],
    'AUDIT_LOGS': ['Timestamp', 'User Name', 'Action', 'Details', 'Branch ID'],
    'INDIVIDUAL_STATEMENT': ['Date', 'Time', 'Items', 'Branch', 'Debit (Rs)', 'Credit (Rs)', 'Amount (Rs)', 'Status', 'Reference', 'Cashier'],
    'MENU_LIST': ['ID', 'Name', 'Category', 'Price (Rs)', 'Available', 'Self-Service', 'Branch']
};

module.exports = { REPORT_SCHEMAS };
