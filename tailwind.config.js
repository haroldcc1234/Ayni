/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: ['Inter Variable', 'Inter', 'system-ui', 'sans-serif'],
      },
      colors: {
        canvas: '#F6F1E7',
        brand: {
          50: '#f5f4f1',
          100: '#ebe9e4',
          200: '#dcd9d2',
          300: '#b9b5ab',
          400: '#8f8a7e',
          500: '#5f5b52',
          600: '#0D3558',
          700: '#0f0e0d',
          800: '#0a0a09',
          900: '#000000',
        },
        community: {
          50: '#f1f6f2',
          100: '#e0ebe3',
          200: '#c4d9ca',
          500: '#4F7F3A',
          600: '#2f6647',
          700: '#245238',
        },
        crisis: {
          50: '#fbf2f0',
          100: '#f6e2de',
          200: '#eec9c2',
          300: '#dfa195',
          400: '#c96d5d',
          500: '#ad4030',
          600: '#A84A3A',
          700: '#7f291d',
          800: '#662117',
          900: '#4c180f',
        },
      },
      boxShadow: {
        subtle: 'none',
        card: 'none',
        float: '0 12px 30px -18px rgba(20, 20, 20, 0.45)',
        crisis: 'none',
      },
      borderRadius: {
        '4xl': '1.25rem',
      },
    },
  },
  plugins: [],
};
