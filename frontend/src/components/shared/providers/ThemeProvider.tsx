"use client"

import { ThemeProvider as NextThemesProvider, type ThemeProviderProps } from "next-themes"

// ThemeProviderProps is exported directly from "next-themes" in the current
// package (0.4.6) — the spec's "next-themes/dist/types" subpath does not
// exist in this version, confirmed live against the installed package.
export function ThemeProvider({ children, ...props }: ThemeProviderProps) {
  return <NextThemesProvider {...props}>{children}</NextThemesProvider>
}
