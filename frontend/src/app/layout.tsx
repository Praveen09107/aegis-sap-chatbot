import type { Metadata, Viewport } from "next"
import { geist, geistMono } from "./fonts"
import { orgName } from "@/lib/constants"
import { ThemeProvider } from "@/components/shared/providers/ThemeProvider"
import { QueryProvider } from "@/components/shared/providers/QueryProvider"
import { ToastProvider } from "@/components/shared/providers/ToastProvider"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "AEGIS — SAP Intelligence",
    template: "%s | AEGIS",
  },
  // orgName from src/lib/constants.ts from this file's first version —
  // AMENDMENT_GENERALIZATION_FRONTEND.md FILE 6, never a hardcoded company
  // name even temporarily.
  description: `SAP ERP Helpdesk AI — ${orgName}`,
  robots: { index: false, follow: false }, // Internal tool
}

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  minimumScale: 1,
}

interface RootLayoutProps {
  children: React.ReactNode
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html
      lang="en"
      suppressHydrationWarning // next-themes requires this
      className={`${geist.variable} ${geistMono.variable}`}
    >
      <head>
        <meta name="color-scheme" content="light dark" />
      </head>
      <body className="min-h-screen bg-bg-primary font-sans antialiased">
        <ThemeProvider
          attribute="class"
          defaultTheme="light" // Employee portal default: light
          enableSystem={false} // No OS detection — explicit toggle only
          disableTransitionOnChange={false}
          storageKey="aegis:dark-mode"
        >
          <QueryProvider>
            <ToastProvider>{children}</ToastProvider>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
