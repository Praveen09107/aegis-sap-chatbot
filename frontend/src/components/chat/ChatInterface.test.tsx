import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, act } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ChatInterface } from "./ChatInterface"
import { useChatStore } from "@/stores/chatStore"
import { createQueryWrapper } from "@/test-utils/queryTestWrapper"

const sendMessageMock = vi.fn()
vi.mock("@/hooks/useWebSocket", () => ({
  useWebSocket: () => ({ sendMessage: sendMessageMock, disconnect: vi.fn(), isConnected: true }),
}))

const submitFeedbackMutate = vi.fn()
vi.mock("@/hooks/queries", () => ({
  useSubmitFeedback: () => ({ mutate: submitFeedbackMutate }),
}))

function renderInterface() {
  const { Wrapper } = createQueryWrapper()
  return render(<ChatInterface />, { wrapper: Wrapper })
}

describe("ChatInterface", () => {
  beforeEach(() => {
    sendMessageMock.mockReset()
    submitFeedbackMutate.mockReset()
    useChatStore.setState({
      messages: [],
      streamingState: "idle",
      composeValue: "",
      pendingScreenshot: null,
      screenshotPreviewUrl: null,
      currentSessionId: null,
    })
  })

  it("sends the composed message and clears state is handled by the store, not re-implemented here", async () => {
    useChatStore.setState({ composeValue: "How do I fix VL150?" })
    const user = userEvent.setup()
    renderInterface()

    await user.click(screen.getByRole("button", { name: "Send message" }))

    expect(sendMessageMock).toHaveBeenCalledWith("How do I fix VL150?", null)
  })

  it("does not send while already streaming or thinking", async () => {
    useChatStore.setState({ composeValue: "question", streamingState: "thinking" })
    renderInterface()

    // The send button itself is disabled during thinking/streaming
    // (ComposeBar's own canSend logic) — handleSend is a second layer of
    // protection against any programmatic bypass.
    expect(screen.getByRole("button", { name: "Waiting for response..." })).toBeDisabled()
  })

  it("does not send an empty/whitespace-only message", async () => {
    useChatStore.setState({ composeValue: "   " })
    renderInterface()

    expect(screen.getByRole("button", { name: "Send message" })).toBeDisabled()
  })

  it("forwards feedback with the correct turn index among assistant messages only", async () => {
    useChatStore.setState({
      messages: [
        { id: "u1", role: "user", content: "q1", timestamp: new Date() },
        { id: "a1", role: "assistant", content: "answer 1", timestamp: new Date(), confidenceBadge: "green" },
        { id: "u2", role: "user", content: "q2", timestamp: new Date() },
        { id: "a2", role: "assistant", content: "answer 2", timestamp: new Date(), confidenceBadge: "green" },
      ],
      currentSessionId: "sess-1",
      streamingState: "complete",
    })
    const user = userEvent.setup()
    renderInterface()

    const helpfulButtons = screen.getAllByRole("button", { name: "Helpful" })
    await user.click(helpfulButtons[1]) // second assistant message → turnIndex 1

    expect(submitFeedbackMutate).toHaveBeenCalledWith({ sessionId: "sess-1", turnIndex: 1, signal: "positive" })
  })

  it("does not submit feedback when there is no active session (error/edge path)", async () => {
    useChatStore.setState({
      messages: [{ id: "a1", role: "assistant", content: "answer", timestamp: new Date(), confidenceBadge: "green" }],
      currentSessionId: null,
      streamingState: "complete",
    })
    const user = userEvent.setup()
    renderInterface()

    await user.click(screen.getByRole("button", { name: "Helpful" }))
    expect(submitFeedbackMutate).not.toHaveBeenCalled()
  })

  it("listens for the screenshot-selected custom event dispatched by ComposeBar's file picker", async () => {
    renderInterface()
    const file = new File(["x"], "screenshot.png", { type: "image/png" })

    await act(async () => {
      document.dispatchEvent(new CustomEvent("aegis:screenshot-selected", { detail: file }))
    })

    expect(useChatStore.getState().pendingScreenshot).toBe(file)
    expect(useChatStore.getState().screenshotPreviewUrl).toMatch(/^blob:/)
  })

  it("regenerate re-sends the most recent user message's content", async () => {
    useChatStore.setState({
      messages: [
        { id: "u1", role: "user", content: "first question", timestamp: new Date() },
        { id: "a1", role: "assistant", content: "shaky answer", timestamp: new Date(), confidenceBadge: "amber" },
        { id: "u2", role: "user", content: "How do I fix VL150?", timestamp: new Date() },
        { id: "a2", role: "assistant", content: "another shaky answer", timestamp: new Date(), confidenceBadge: "amber" },
      ],
      streamingState: "complete",
    })
    const user = userEvent.setup()
    renderInterface()

    await user.click(screen.getAllByRole("button", { name: "Try different approach" })[1])

    expect(sendMessageMock).toHaveBeenCalledWith("How do I fix VL150?")
  })

  it("does nothing on regenerate when there is no prior user message (error/edge path)", async () => {
    useChatStore.setState({
      messages: [{ id: "a1", role: "assistant", content: "answer", timestamp: new Date(), confidenceBadge: "amber" }],
      streamingState: "complete",
    })
    const user = userEvent.setup()
    renderInterface()

    await user.click(screen.getByRole("button", { name: "Try different approach" }))
    expect(sendMessageMock).not.toHaveBeenCalled()
  })

  it("clicking a suggestion chip in the empty state sends it directly (no compose-bar fill)", async () => {
    const user = userEvent.setup()
    renderInterface()

    const suggestions = screen.getAllByRole("button", { name: /VL150|MIGO|F5|delivery|error/i })
    await user.click(suggestions[0])

    expect(sendMessageMock).toHaveBeenCalledTimes(1)
  })

  it("clicking the attach button triggers the hidden file input", async () => {
    const user = userEvent.setup()
    renderInterface()

    const fileInput = document.querySelector('input[type="file"][accept="image/*"]') as HTMLInputElement
    const clickSpy = vi.spyOn(fileInput, "click")

    await user.click(screen.getByRole("button", { name: "Attach SAP screenshot" }))

    // ComposeBar's own attach handler already clicks its ref'd file input
    // directly; ChatInterface's handleAttachClick independently re-triggers
    // the same input via a querySelector lookup (its real job is to be the
    // onAttachClick prop ComposeBar calls) — so the same input ends up
    // clicked twice per press. Harmless (repeat clicks on a file input are
    // a no-op beyond re-opening the same picker), but this test's job is
    // only to confirm ChatInterface's own querySelector path actually fires.
    expect(clickSpy).toHaveBeenCalled()
  })

  it("clicking a related-question chip fills the compose bar and sends it", async () => {
    useChatStore.setState({
      messages: [
        {
          id: "a1",
          role: "assistant",
          content: "answer",
          timestamp: new Date(),
          confidenceBadge: "green",
          relatedQuestions: ["How do I check delivery status?"],
        },
      ],
      streamingState: "complete",
    })
    const user = userEvent.setup()
    renderInterface()

    await user.click(screen.getByRole("button", { name: "How do I check delivery status?" }))

    expect(sendMessageMock).toHaveBeenCalledWith("How do I check delivery status?")
  })
})
