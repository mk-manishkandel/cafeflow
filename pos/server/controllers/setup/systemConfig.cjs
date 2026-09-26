const logger = require('../../utils/logger.cjs');
const { REPORT_SCHEMAS } = require('../../utils/reportSchemas.cjs');

const getReportSchemas = async (req, res) => {
    try {
        res.json(REPORT_SCHEMAS);
    } catch (error) {
        logger.error('Error fetching report schemas', error);
        res.status(500).json({ error: 'Failed' });
    }
};
module.exports = { getReportSchemas };
