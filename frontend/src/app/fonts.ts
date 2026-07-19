import { Geist, Geist_Mono } from "next/font/google"

/**
 * Geist: Primary UI font
 * - Clean, modern, excellent legibility at small sizes
 * - Used for all UI text, labels, buttons, navigation
 */
export const geist = Geist({
  subsets: ["latin"],
  variable: "--font-geist",
  display: "swap",
  weight: ["300", "400", "500", "600", "700"],
})

/**
 * Geist Mono: Technical/code font
 * - Used exclusively for SAP entity chips (error codes, T-codes, document numbers)
 * - Used for document IDs in attribution panels
 * - Used for metric values in admin dashboard
 * - Never used for general UI text
 */
export const geistMono = Geist_Mono({
  subsets: ["latin"],
  variable: "--font-geist-mono",
  display: "swap",
  weight: ["400", "500", "600"],
})
