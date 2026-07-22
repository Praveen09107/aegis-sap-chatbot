"use client"

/**
 * Dynamic-import barrel for the admin chart components.
 *
 * Recharts (~200KB) is only needed on the two admin routes that actually
 * render charts (dashboard, analytics) — importing these from here instead
 * of the chart files directly keeps Recharts out of every other route's
 * bundle (FRONTEND_28_PERFORMANCE.md). ssr:false because Recharts measures
 * its container via the DOM and has no useful server-rendered output here.
 */

import dynamic from "next/dynamic"
import { ChartSkeleton } from "./ChartSkeleton"

export const ValidationScoreChart = dynamic(
  () => import("./ValidationScoreChart").then((m) => m.ValidationScoreChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const ConfidenceDistChart = dynamic(
  () => import("./ConfidenceDistChart").then((m) => m.ConfidenceDistChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const RetrievalModeChart = dynamic(
  () => import("./RetrievalModeChart").then((m) => m.RetrievalModeChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const QueryVolumeChart = dynamic(
  () => import("./QueryVolumeChart").then((m) => m.QueryVolumeChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const CachePerformanceChart = dynamic(
  () => import("./CachePerformanceChart").then((m) => m.CachePerformanceChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)

export const TopModulesChart = dynamic(
  () => import("./TopModulesChart").then((m) => m.TopModulesChart),
  { loading: () => <ChartSkeleton />, ssr: false }
)
