/** @type {import('tailwindcss').Config} */
module.exports = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        // AEGIS brand colors
        'aegis-green': '#16a34a',    // Confidence badge: green
        'aegis-amber': '#d97706',    // Confidence badge: amber
        'aegis-blue': '#1d4ed8',     // Primary action color
        'aegis-gray': '#6b7280',     // Secondary text
      },
    },
  },
  plugins: [],
};
