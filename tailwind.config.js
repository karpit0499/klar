/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Semantic colors → CSS variables defined in src/index.css (with .dark
      // overrides). Using var(--x) means one class works in BOTH themes: e.g.
      // `bg-surface` is white in light mode and near-black in dark mode with no
      // `dark:` variant needed. The design tokens come straight from the brand kit.
      colors: {
        bg: 'var(--bg)',
        surface: 'var(--surface)',
        'surface-2': 'var(--surface-2)',
        sidebar: 'var(--sidebar)',
        'sidebar-border': 'var(--sidebar-border)',
        ink: 'var(--ink)',
        muted: 'var(--text-2)',
        faint: 'var(--text-3)',
        border: 'var(--border)',
        'border-2': 'var(--border-2)',
        accent: 'var(--accent)',
        'accent-ink': 'var(--accent-ink)',
        'accent-tint': 'var(--accent-tint)',
        primary: 'var(--primary)',
        'primary-ink': 'var(--primary-ink)',
        danger: 'var(--danger)',
        'danger-ink': 'var(--danger-ink)',
        success: 'var(--success)',
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        sans: ['"Hanken Grotesk"', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
      // Brand radius scale (px): xs4 · sm6 · md8 · lg10 · xl14 · full999.
      borderRadius: {
        sm: '6px',
        md: '8px',
        lg: '10px',
        xl: '14px',
        full: '999px',
      },
      // Brand type steps.
      fontSize: {
        'display-xl': ['64px', { lineHeight: '1.05', letterSpacing: '-0.02em' }],
        'display-lg': ['32px', { lineHeight: '1.1', letterSpacing: '-0.01em' }],
        'display-md': ['24px', { lineHeight: '1.2' }],
      },
      minHeight: {
        tap: '44px', // WCAG 2.5.5 minimum touch target
      },
      minWidth: {
        tap: '44px',
      },
    },
  },
  plugins: [],
}