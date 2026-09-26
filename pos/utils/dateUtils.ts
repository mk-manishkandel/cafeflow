/**
 * Utility functions for date handling, respecting the application's configured timezone.
 */

/**
 * Returns the current date (or provided date) as a string in YYYY-MM-DD format.
 * Uses VITE_APP_TIMEZONE from environment if set, otherwise falls back to system local time.
 * 
 * @param date Optional Date object (defaults to now)
 * @returns Date string in 'YYYY-MM-DD' format
 */
export const getLocalDateString = (date: Date = new Date()): string => {
    const timezone = import.meta.env.VITE_APP_TIMEZONE;

    if (timezone) {
        try {
            // en-CA locale uses YYYY-MM-DD format
            return date.toLocaleDateString('en-CA', { timeZone: timezone });
        } catch (_e) {
            // Invalid timezone - fall through to local time fallback
        }
    }

    // Fallback to system local time
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const day = String(date.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
};

/**
 * Returns the application's configured timezone string.
 * Uses VITE_APP_TIMEZONE from environment if set,
 * otherwise falls back to the browser's local timezone.
 * Never falls back to a hardcoded region-specific timezone.
 */
export const getAppTimezone = (): string => {
    return import.meta.env.VITE_APP_TIMEZONE || Intl.DateTimeFormat().resolvedOptions().timeZone;
};

/**
 * Returns `date` shifted back by `months` calendar months with the day-of-month
 * clamped to the target month's length (e.g. Jan 31 - 1 month → Dec 31, not an
 * overflow into March). Preserves the time-of-day components.
 */
export const subtractMonthsClamped = (date: Date, months: number): Date => {
    const target = new Date(date.getFullYear(), date.getMonth() - months, 1);
    const daysInTargetMonth = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(date.getDate(), daysInTargetMonth));
    target.setHours(date.getHours(), date.getMinutes(), date.getSeconds(), date.getMilliseconds());
    return target;
};
