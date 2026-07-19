"use client"

import { Toaster } from "sonner"
import { useTheme } from "next-themes"

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const { theme } = useTheme()

  return (
    <>
      {children}
      <Toaster
        position="bottom-right"
        theme={theme as "light" | "dark" | "system"}
        richColors
        closeButton
        duration={4000}
        toastOptions={{
          classNames: {
            toast: "font-sans text-sm",
            title: "font-medium",
            description: "text-text-secondary",
          },
        }}
      />
    </>
  )
}
