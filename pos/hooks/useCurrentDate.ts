import { useState, useEffect } from 'react';

export const useCurrentDate = () => {
    const [date, setDate] = useState(new Date());

    useEffect(() => {
        const checkDate = () => {
            const now = new Date();
            if (now.getDate() !== date.getDate() || now.getMonth() !== date.getMonth() || now.getFullYear() !== date.getFullYear()) {
                setDate(now);
            }
        };

        // 1. Check on tab focus/visibility
        window.addEventListener('focus', checkDate);
        document.addEventListener('visibilitychange', checkDate);

        // 2. Schedule update for next midnight
        const now = new Date();
        const tomorrow = new Date(now);
        tomorrow.setDate(tomorrow.getDate() + 1);
        tomorrow.setHours(0, 0, 0, 0);
        const msUntilMidnight = tomorrow.getTime() - now.getTime();

        // Timer to update exactly at midnight
        const timer = setTimeout(() => {
            checkDate();
        }, msUntilMidnight);

        return () => {
            window.removeEventListener('focus', checkDate);
            document.removeEventListener('visibilitychange', checkDate);
            clearTimeout(timer);
        };
    }, [date]);

    return date;
};
