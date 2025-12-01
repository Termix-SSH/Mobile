/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ["./app/**/*.{js,jsx,ts,tsx}"],
  presets: [require("nativewind/preset")],
  theme: {
    extend: {
      colors: {
        'dark-bg': '#18181b',
        'dark-bg-darker': '#0e0e10',
        'dark-bg-darkest': '#09090b',
        'dark-bg-input': '#222225',
        'dark-bg-button': '#23232a',
        'dark-bg-active': '#1d1d1f',
        'dark-bg-header': '#131316',
        'dark-border': '#303032',
        'dark-border-active': '#2d2d30',
        'dark-border-hover': '#434345',
        'dark-hover': '#2d2d30',
        'dark-active': '#2a2a2c',
        'dark-pressed': '#1a1a1c',
        'dark-hover-alt': '#2a2a2d',
        'dark-border-light': '#5a5a5d',
        'dark-bg-light': '#141416',
        'dark-border-medium': '#373739',
        'dark-bg-very-light': '#101014',
        'dark-bg-panel': '#1b1b1e',
        'dark-border-panel': '#222224',
        'dark-bg-panel-hover': '#232327',
      },
      borderRadius: {
        'button': '6px',
        'card': '12px',
        'small': '4px',
      },
    },
  },
  plugins: [],
}