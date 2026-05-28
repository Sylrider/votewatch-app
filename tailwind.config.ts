import type { Config } from 'tailwindcss';

const config: Config = {
  content: [
    './app/**/*.{js,ts,jsx,tsx,mdx}',
    './components/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // VoteWatch dark theme
        bg:       '#080a0f',
        surface:  '#0f1117',
        surface2: '#171b24',
        surface3: '#1e2333',
        border:   '#252a3a',
        accent:   '#f59e0b',
        accent2:  '#3b82f6',
        muted:    '#64748b',
        dem:      '#3b82f6',
        rep:      '#ef4444',
      },
      fontFamily: {
        display: ['var(--font-bebas)', 'Impact', 'sans-serif'],
        condensed: ['var(--font-barlow-condensed)', 'sans-serif'],
        body: ['var(--font-barlow)', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};

export default config;
