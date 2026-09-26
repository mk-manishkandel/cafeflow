// Split into domain sub-modules under controllers/setup/ (audit item #13).
// This file re-exports everything so existing route imports keep working unchanged.
module.exports = {
    ...require('./setup/paymentMethods.cjs'),
    ...require('./setup/emailConfig.cjs'),
    ...require('./setup/systemConfig.cjs'),
    ...require('./setup/emailTemplates.cjs'),
    ...require('./setup/bulkEmail.cjs')
};
