/**
 * AEGIS Session PDF Export Document
 * Built with @react-pdf/renderer
 *
 * This component is ONLY ever used via dynamic import inside sessionExport.ts.
 * It is never rendered in the browser DOM.
 *
 * PDF structure:
 * ┌─────────────────────────────────────────┐
 * │  AEGIS                              [date]│
 * │  Session: Topic summary text              │
 * │  Exported: DD MMM YYYY, HH:MM IST        │
 * ├─────────────────────────────────────────┤
 * │  [USER]  Question text here              │
 * │  ─────────────────────────────────────  │
 * │  [AEGIS] Response text here              │
 * │          ✓ 91% High confidence           │
 * │          Source: SD-ERR-001              │
 * │  ─────────────────────────────────────  │
 * │  [USER]  Second question...              │
 * └─────────────────────────────────────────┘
 */

import { Document, Page, Text, View, StyleSheet } from "@react-pdf/renderer"
import type { ChatMessage } from "@/types"
import { orgName } from "@/lib/constants"

// ── PDF styles ────────────────────────────────────────────────

const COLORS = {
  navy: "#060B14",
  cyan: "#06B6D4",
  white: "#FFFFFF",
  gray100: "#F1F5F9",
  gray300: "#CBD5E1",
  gray600: "#475569",
  gray800: "#1E293B",
  green: "#059669",
  amber: "#D97706",
  danger: "#DC2626",
}

const styles = StyleSheet.create({
  page: {
    backgroundColor: COLORS.white,
    paddingHorizontal: 48,
    paddingVertical: 48,
    fontFamily: "Helvetica",
    fontSize: 10,
    color: COLORS.gray800,
    lineHeight: 1.5,
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 24,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.gray300,
  },
  brandRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  brandMark: {
    width: 20,
    height: 20,
    backgroundColor: COLORS.cyan,
    borderRadius: 4,
  },
  brandText: { fontSize: 13, fontFamily: "Helvetica-Bold", color: COLORS.navy },
  headerDate: { fontSize: 9, color: COLORS.gray600 },
  sessionMeta: {
    marginBottom: 20,
    padding: 10,
    backgroundColor: COLORS.gray100,
    borderRadius: 6,
  },
  sessionTopic: { fontSize: 12, fontFamily: "Helvetica-Bold", color: COLORS.navy, marginBottom: 4 },
  sessionExported: { fontSize: 9, color: COLORS.gray600 },
  message: {
    marginBottom: 16,
    paddingBottom: 16,
    borderBottomWidth: 0.5,
    borderBottomColor: COLORS.gray300,
  },
  messageRole: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    color: COLORS.gray600,
    textTransform: "uppercase",
    letterSpacing: 0.8,
    marginBottom: 4,
  },
  messageContent: { fontSize: 10, color: COLORS.gray800, lineHeight: 1.6 },
  badgeRow: { flexDirection: "row", alignItems: "center", gap: 8, marginTop: 6 },
  badge: {
    fontSize: 8,
    fontFamily: "Helvetica-Bold",
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 10,
  },
  badgeGreen: { backgroundColor: "#D1FAE5", color: COLORS.green },
  badgeAmber: { backgroundColor: "#FEF3C7", color: COLORS.amber },
  badgeNone: { backgroundColor: "#FEE2E2", color: COLORS.danger },
  sourceText: { fontSize: 8, color: COLORS.gray600 },
  footer: {
    position: "absolute",
    bottom: 24,
    left: 48,
    right: 48,
    flexDirection: "row",
    justifyContent: "space-between",
    fontSize: 8,
    color: COLORS.gray600,
  },
})

// ── Helper ────────────────────────────────────────────────────

// NOTE: hardcoded to Asia/Kolkata/en-IN, same class of issue
// AMENDMENT_GENERALIZATION_FRONTEND.md FILE 10 addresses for
// src/lib/utils.ts's formatDateIST — but FILE 10 is explicitly scoped to
// that file only (session F10). This is a separate, local instance found
// during F03; left as-is here since fixing it is out of this session's
// scope, and disclosed as a follow-up rather than silently changed.
function formatISTDate(date: Date): string {
  return (
    date.toLocaleString("en-IN", {
      day: "numeric",
      month: "long",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Asia/Kolkata",
    }) + " IST"
  )
}

function getBadgeStyle(badge: string | null | undefined) {
  if (badge === "green") return [styles.badge, styles.badgeGreen]
  if (badge === "amber") return [styles.badge, styles.badgeAmber]
  return [styles.badge, styles.badgeNone]
}

function getBadgeLabel(badge: string | null | undefined, score?: number | null): string {
  const pct = score != null ? ` ${Math.round(score * 100)}%` : ""
  if (badge === "green") return `✓${pct} High confidence`
  if (badge === "amber") return `~${pct} Moderate confidence`
  return `✗ Insufficient`
}

// ── Component ─────────────────────────────────────────────────

interface SessionDocumentProps {
  messages: ChatMessage[]
  topic: string
  exportedAt: Date
}

export function SessionDocument({ messages, topic, exportedAt }: SessionDocumentProps) {
  const now = formatISTDate(exportedAt)

  return (
    <Document title={`AEGIS Session — ${topic}`} author={`${orgName} AEGIS`} creator="AEGIS SAP Intelligence">
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <View style={styles.brandRow}>
            <View style={styles.brandMark} />
            <Text style={styles.brandText}>AEGIS</Text>
          </View>
          <Text style={styles.headerDate}>{now}</Text>
        </View>

        {/* Session metadata */}
        <View style={styles.sessionMeta}>
          <Text style={styles.sessionTopic}>{topic}</Text>
          <Text style={styles.sessionExported}>Exported: {now}</Text>
        </View>

        {/* Messages */}
        {messages.map((msg, i) => (
          <View key={i} style={styles.message}>
            <Text style={styles.messageRole}>{msg.role === "user" ? "Employee" : "AEGIS"}</Text>
            <Text style={styles.messageContent}>{msg.content}</Text>

            {msg.role === "assistant" && (
              <View style={styles.badgeRow}>
                <Text style={getBadgeStyle(msg.confidenceBadge)}>
                  {getBadgeLabel(msg.confidenceBadge, msg.validationScore)}
                </Text>
                {msg.attributionPanel?.primary_document_id && (
                  <Text style={styles.sourceText}>Source: {msg.attributionPanel.primary_document_id}</Text>
                )}
              </View>
            )}
          </View>
        ))}

        {/* Page footer */}
        <View style={styles.footer} fixed>
          <Text>{`AEGIS SAP Intelligence — ${orgName}`}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </Document>
  )
}
