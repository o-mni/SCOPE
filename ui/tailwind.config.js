/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    './index.html',
    './src/**/*.{js,jsx,ts,tsx}',
  ],
  theme: {
    extend: {
      colors: {
        background: '#0F1117',
        surface: '#1A1D27',
        border: '#2A2D3A',
        primary: '#4F8EF7',
        success: '#3ECF8E',
        warning: '#F5A623',
        danger: '#E5534B',
        'text-primary': '#E8EAF0',
        'text-muted': '#6B7280',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}
