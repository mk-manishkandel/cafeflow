const { escapeHTML } = require('./html.cjs');

/**
 * Document Template Renderer
 * Renders document templates (KOT, Invoice, Receipt, etc.) by replacing placeholders with actual data
 * Supports simple placeholders ({{key}}) and loop constructs ({{#items}}...{{/items}})
 */

/**
 * Process loop sections like {{#items}}...{{/items}}
 * @param {string} template - Template HTML
 * @param {object} data - Data object
 * @returns {string} - Processed template
 */
const processLoops = (template, data) => {
    // Pattern: {{#arrayName}}content{{/arrayName}}
    const loopPattern = /\{\{#(\w+)\}\}([\s\S]*?)\{\{\/\1\}\}/g;

    return template.replace(loopPattern, (match, arrayName, content) => {
        const arrayData = data[arrayName];

        // If array doesn't exist or is empty, return empty string
        if (!Array.isArray(arrayData) || arrayData.length === 0) {
            return '';
        }

        // Render content for each array item
        return arrayData.map(item => {
            return replacePlaceholders(content, item, false);
        }).join('');
    });
};

/**
 * Replace simple placeholders {{key}} with values from data object
 * @param {string} text - Text containing placeholders
 * @param {object} data - Data object with values
 * @param {boolean} escape - Whether to escape HTML (default: true for security)
 * @returns {string} - Text with placeholders replaced
 */
const replacePlaceholders = (text, data, escape = true) => {
    if (!text) return '';
    if (!data) return text;

    return text.replace(/{{\s*(\w+)\s*}}/g, (match, key) => {
        let value = data[key];

        // Return empty string if key not found
        if (value === undefined || value === null) return '';

        // Convert numbers to string
        if (typeof value === 'number') {
            value = String(value);
        }

        // Escape HTML if requested and it's a string
        if (escape && typeof value === 'string') {
            return escapeHTML(value);
        }

        return value;
    });
};

/**
 * Render a complete document template with data
 * @param {string} templateHTML - The HTML template
 * @param {string} templateCSS - The CSS template
 * @param {object} data - The data to inject
 * @returns {string} - Complete HTML document ready for printing
 */
const renderDocumentTemplate = (templateHTML, templateCSS, data) => {
    // First, process any loop constructs
    let processedHTML = processLoops(templateHTML, data);

    // Then replace simple placeholders
    processedHTML = replacePlaceholders(processedHTML, data, true);

    // SEC-H6: Sanitize CSS to prevent injection of </style> or <script tags
    const safeCSS = (templateCSS || '').replace(/<\/style>/gi, '').replace(/<script/gi, '');

    // Wrap in complete HTML document with CSS
    const fullDocument = `
        <!DOCTYPE html>
        <html>
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Document Print</title>
                <style>
                    ${safeCSS}
                </style>
            </head>
            <body>
                ${processedHTML}
                <script>
                    window.onload = function() {
                        window.focus();
                        window.print();
                    };
                    window.onafterprint = function() {
                        window.close();
                    };
                </script>
            </body>
        </html>
    `;

    return fullDocument;
};

module.exports = { renderDocumentTemplate };
