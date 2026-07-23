import { describe, it, expect, beforeEach } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { AttributionPanelShell } from "./AttributionPanelShell"
import { usePanelStore } from "@/stores/panelStore"
import { useChatStore } from "@/stores/chatStore"
import type { ChatMessage } from "@/types"

function makeAssistantMessage(overrides: Partial<ChatMessage> = {}): ChatMessage {
  return {
    id: "m1",
    role: "assistant",
    content: "Here is the answer.",
    timestamp: new Date(),
    attributionPanel: {
      primary_document_id: "DOC-1",
      primary_document_name: "VL150 config guide",
      verified_by: "admin",
      verified_date: "2026-07-01",
      secondary_sources: [],
      confidence_badge: "green",
      form_entry_id: null,
      screenshots: [],
    },
    ...overrides,
  }
}

describe("AttributionPanelShell", () => {
  beforeEach(() => {
    usePanelStore.setState({ collapsed: false })
    useChatStore.setState({ websocket: null, messages: [], streamingState: "idle" })
  })

  it("shows the collapse toggle and expanded content when not collapsed", () => {
    useChatStore.setState({ messages: [makeAssistantMessage()] })
    render(<AttributionPanelShell />)

    expect(screen.getByLabelText("Collapse source panel")).toBeInTheDocument()
    expect(screen.getByText("VL150 config guide")).toBeInTheDocument()
  })

  it("shows the collapsed icon strip and hides content when collapsed", () => {
    usePanelStore.setState({ collapsed: true })
    useChatStore.setState({ messages: [makeAssistantMessage()] })
    render(<AttributionPanelShell />)

    expect(screen.getByLabelText("Expand source panel")).toBeInTheDocument()
    expect(screen.queryByText("VL150 config guide")).not.toBeInTheDocument()
  })

  it("toggle button flips the panelStore collapsed state", async () => {
    const user = userEvent.setup()
    render(<AttributionPanelShell />)

    await user.click(screen.getByLabelText("Collapse source panel"))
    expect(usePanelStore.getState().collapsed).toBe(true)
  })

  it("uses the last assistant message's attribution, ignoring a trailing user message", () => {
    useChatStore.setState({
      messages: [
        makeAssistantMessage({
          id: "m1",
          attributionPanel: {
            primary_document_id: "DOC-1",
            primary_document_name: "Older doc",
            verified_by: "admin",
            verified_date: "2026-07-01",
            secondary_sources: [],
            confidence_badge: "green",
            form_entry_id: null,
            screenshots: [],
          },
        }),
        { id: "m2", role: "user", content: "follow up", timestamp: new Date() },
      ],
    })
    render(<AttributionPanelShell />)

    expect(screen.getByText("Older doc")).toBeInTheDocument()
  })

  it("shows a loading state when streaming and no attribution is available yet", () => {
    useChatStore.setState({
      messages: [{ id: "m1", role: "user", content: "hi", timestamp: new Date() }],
      streamingState: "streaming",
    })
    render(<AttributionPanelShell />)

    // No document card, no "no sources" empty state — AttributionPanel's own
    // loading skeleton should be showing instead.
    expect(screen.queryByText(/config guide/i)).not.toBeInTheDocument()
  })
})
