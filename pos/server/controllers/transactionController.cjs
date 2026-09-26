// Split into domain sub-modules under controllers/transactions/ (audit item #13).
// This file re-exports everything so existing route imports keep working unchanged.
module.exports = {
    ...require('./transactions/queries.cjs'),
    ...require('./transactions/mutations.cjs'),
    ...require('./transactions/reports.cjs')
};
