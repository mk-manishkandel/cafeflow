export const CURRENCY_SYMBOL = 'Rs.';

const roundHalfUpToCents = (value: number): number => {
    // Work from a correctly-rounded 3-decimal string so binary float drift
    // (e.g. 1.005 stored as 1.00499...) still rounds half-up to cents.
    if (!Number.isFinite(value)) return 0;
    const s = value.toFixed(3);
    const neg = s.startsWith('-');
    const digits = neg ? s.slice(1) : s;
    const [intPart, fracPart = ''] = digits.split('.');
    const frac = fracPart.padEnd(3, '0');
    let hundreds = Number(intPart) * 100 + Number(frac.slice(0, 2));
    if (Number(frac[2]) >= 5) hundreds += 1;
    const out = hundreds / 100;
    return neg ? -out : out;
};

const parseAmount = (amount: number | string | null | undefined): number => {
    if (typeof amount === 'number') return amount;
    if (typeof amount === 'string') {
        const cleaned = amount.replace(/[^\d.-]/g, '');
        return cleaned ? parseFloat(cleaned) : NaN;
    }
    return NaN;
};

const formatter = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
});

export function formatCurrency(amount: number | string | null | undefined): string {
    const n = parseAmount(amount);
    if (!Number.isFinite(n)) return `${CURRENCY_SYMBOL} ${formatter.format(0)}`;
    return `${CURRENCY_SYMBOL} ${formatter.format(roundHalfUpToCents(n))}`;
}
