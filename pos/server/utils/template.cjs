const { escapeHTML } = require('./html.cjs');

/**
 * Replaces placeholders in the format {{key}} with values from the data object.
 * @param {string} text - The template text containing placeholders.
 * @param {Object} data - The data object containing replacement values.
 * @param {boolean} escape - Whether to escape replacement values for HTML safety. Default: true.
 * @returns {string} - The processed text with placeholders replaced.
 */
function replacePlaceholders(text, data, escape = true) {
    if (!text) return '';
    if (!data) return text;

    return text.replace(/{{\s*(\w+)\s*}}/g, (match, key) => {
        let value = data[key];

        // Return match if key not found (to preserve unhandled placeholders)
        if (value === undefined || value === null) return match;

        // If it's a number, convert to string
        if (typeof value === 'number') {
            value = String(value);
        }

        // Escape if requested and it's a string
        if (escape && typeof value === 'string') {
            return escapeHTML(value);
        }

        return value;
    });
}

module.exports = { replacePlaceholders };
