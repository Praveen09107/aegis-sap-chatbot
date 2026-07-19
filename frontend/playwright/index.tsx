// Playwright Component Testing mount point. Runs under a bare Vite context,
// not Next.js — next/font's --font-geist/--font-geist-mono variables are
// unavailable here, so components fall back to globals.css's own fallback
// chain (ui-sans-serif, system-ui, sans-serif). This is a disclosed,
// accepted limitation: CT verifies AEGIS's color/spacing/radius/shadow
// tokens (the actual override system under test), not exact webfont
// rendering, which the real Next.js app pages will cover separately.
import "../src/app/globals.css"
