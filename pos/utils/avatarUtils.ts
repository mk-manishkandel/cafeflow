const AVATAR_COLORS = [
    '#4F46E5', '#7C3AED', '#DB2777', '#DC2626', '#D97706',
    '#059669', '#0891B2', '#2563EB', '#9333EA', '#C2410C',
];

const colorForName = (name: string): string => {
    let hash = 0;
    for (let i = 0; i < name.length; i++) hash = name.charCodeAt(i) + ((hash << 5) - hash);
    return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
};

const initials = (name: string): string => {
    const parts = name.trim().split(/\s+/).filter(Boolean);
    if (parts.length === 0) return '?';
    return parts.length === 1
        ? parts[0].charAt(0).toUpperCase()
        : (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toUpperCase();
};

export const getInitialsAvatar = (name: string): string => {
    const bg = colorForName(name);
    const text = initials(name);
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="64" height="64" viewBox="0 0 64 64">
  <circle cx="32" cy="32" r="32" fill="${bg}"/>
  <text x="32" y="32" dy="0.35em" text-anchor="middle" font-family="system-ui,sans-serif" font-size="${text.length > 1 ? 22 : 28}" font-weight="700" fill="white">${text}</text>
</svg>`;
    return `data:image/svg+xml;base64,${btoa(svg)}`;
};
