/**
 * Title-case a display name: trims, collapses runs of whitespace, then turns
 * every word into "Xxxx". Words are split on spaces and punctuation such as
 * - / ( & ; so "coca-cola (large)" becomes "Coca-Cola (Large)". Apostrophes
 * stay inside a word ("chef's" -> "Chef's").
 *
 * Short all-caps words (2-4 letters, e.g. BIC, BBQ, KFC) are kept as typed,
 * unless the whole name is in caps — then it is treated as caps-lock input
 * and fully title-cased ("CHICKEN MOMO" -> "Chicken Momo").
 *
 * Non-string input is returned unchanged so callers can pass request fields
 * straight through without extra guards.
 */
const toTitleCase = (value) => {
    if (typeof value !== 'string') return value;
    const text = value.trim().replace(/\s+/g, ' ');
    const isAllCaps = !/\p{Ll}/u.test(text);
    return text.replace(/[\p{L}\p{N}'’]+/gu, (word) => {
        if (!isAllCaps && /^\p{Lu}{2,4}$/u.test(word)) return word;
        return word.toLowerCase().replace(/^\p{L}/u, (ch) => ch.toUpperCase());
    });
};

module.exports = { toTitleCase };
