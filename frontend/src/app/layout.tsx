import type { Metadata, Viewport } from "next"
import { MotionConfig } from "motion/react"
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
            {/* Global reduced-motion policy for every motion.* element in
                the app (FRONTEND_23/24) — "user" strips transform/layout
                animation (x/y/scale/rotate) while keeping opacity
                transitions active whenever the OS setting is on, so
                individual components never need their own
                usePrefersReducedMotion() branch just to get this. */}
            <MotionConfig reducedMotion="user">
              <ToastProvider>{children}</ToastProvider>
            </MotionConfig>
          </QueryProvider>
        </ThemeProvider>
      </body>
    </html>
  )
}
