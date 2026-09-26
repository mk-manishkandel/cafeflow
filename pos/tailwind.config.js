/** @type {import('tailwindcss').Config} */
export default {
    content: [
        "./index.html",
        "./App.tsx",
        "./index.tsx",
        "./components/**/*.{js,ts,jsx,tsx}",
        "./contexts/**/*.{js,ts,jsx,tsx}",
        "./hooks/**/*.{js,ts,jsx,tsx}",
        "./services/**/*.{js,ts,jsx,tsx}",
        "./utils/**/*.{js,ts,jsx,tsx}"
    ],
    theme: {
        extend: {
            fontFamily: {
                sans: ['Open Sans', 'Arial', 'sans-serif'],
            },
            colors: {
                primary: {
                    DEFAULT: 'var(--color-primary)',
                    hover: 'var(--color-primary-hover)',
                },
                secondary: {
                    DEFAULT: 'var(--color-secondary)',
                    hover: 'var(--color-secondary-hover)',
                },
                danger: {
                    DEFAULT: 'var(--color-danger)',
                    hover: 'var(--color-danger-hover)',
                },
                success: {
                    DEFAULT: 'var(--color-success)',
                    hover: 'var(--color-success-hover)',
                },
                'text-main': 'var(--color-text-main)',
                'text-secondary': 'var(--color-text-secondary)',
                'text-muted': 'var(--color-text-muted)',
                background: 'var(--color-background)',
                surface: 'var(--color-surface)',
            },
            fontSize: {
                'xxs': '0.625rem',      // 10px - for tiny labels
                'xs-alt': '0.6875rem',   // 11px - for alternative extra small
            },
            borderRadius: {
                '4xl': '2rem',           // 32px
                '5xl': '2.5rem',         // 40px
                // Semantic tokens — use these for new components to stay consistent:
                // 'card'  → rounded-card  (replaces ad-hoc rounded-3xl on panel/card surfaces)
                // 'modal' → rounded-modal (replaces ad-hoc rounded-2xl on dialog surfaces)
                // 'btn'   → rounded-btn   (replaces ad-hoc rounded-lg/xl on buttons)
                'card':  '1.5rem',       // 24px — matches existing rounded-3xl card usage
                'modal': '1rem',         // 16px — matches existing rounded-2xl modal usage
                'btn':   '0.5rem',       // 8px  — matches existing rounded-lg button usage
            },
            spacing: {
                '18': '4.5rem',          // 72px
                '22': '5.5rem',          // 88px
            }
        },
    },
    plugins: [],
}
