import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import LoginPage from "./page"

const pushMock = vi.fn()
const replaceMock = vi.fn()

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: pushMock, replace: replaceMock }),
}))

const loginWithCredentialsMock = vi.fn()
const isAuthenticatedMock = vi.fn(() => false)
const getUserRoleMock = vi.fn(() => "employee" as "employee" | "it-admin")

vi.mock("@/lib/auth", () => ({
  loginWithCredentials: (...args: unknown[]) => loginWithCredentialsMock(...args),
  isAuthenticated: () => isAuthenticatedMock(),
  getUserRole: () => getUserRoleMock(),
}))

describe("LoginPage", () => {
  beforeEach(() => {
    pushMock.mockClear()
    replaceMock.mockClear()
    loginWithCredentialsMock.mockReset()
    isAuthenticatedMock.mockReturnValue(false)
    getUserRoleMock.mockReturnValue("employee")
  })

  it("never renders a hardcoded company name — reads orgName instead", () => {
    render(<LoginPage />)
    expect(screen.queryByText(/Sona Comstar/i)).not.toBeInTheDocument()
  })

  it("submits credentials and routes an employee to /", async () => {
    loginWithCredentialsMock.mockResolvedValue({ success: true })
    getUserRoleMock.mockReturnValue("employee")
    const user = userEvent.setup()

    render(<LoginPage />)
    await user.type(screen.getByLabelText("Username"), "jdoe")
    await user.type(screen.getByLabelText("Password"), "hunter2")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/"))
    expect(loginWithCredentialsMock).toHaveBeenCalledWith("jdoe", "hunter2")
  })

  it("routes an it-admin to /admin/dashboard", async () => {
    loginWithCredentialsMock.mockResolvedValue({ success: true })
    getUserRoleMock.mockReturnValue("it-admin")
    const user = userEvent.setup()

    render(<LoginPage />)
    await user.type(screen.getByLabelText("Username"), "admin")
    await user.type(screen.getByLabelText("Password"), "hunter2")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    await waitFor(() => expect(pushMock).toHaveBeenCalledWith("/admin/dashboard"))
  })

  it("shows the server's error message and clears the password field on failure", async () => {
    loginWithCredentialsMock.mockResolvedValue({ success: false, error: "Invalid credentials." })
    const user = userEvent.setup()

    render(<LoginPage />)
    const passwordInput = screen.getByLabelText("Password")
    await user.type(screen.getByLabelText("Username"), "jdoe")
    await user.type(passwordInput, "wrong")
    await user.click(screen.getByRole("button", { name: "Sign in" }))

    expect(await screen.findByRole("alert")).toHaveTextContent("Invalid credentials.")
    expect(passwordInput).toHaveValue("")
    expect(pushMock).not.toHaveBeenCalled()
  })

  it("redirects away from /login immediately if already authenticated", () => {
    isAuthenticatedMock.mockReturnValue(true)
    getUserRoleMock.mockReturnValue("it-admin")

    render(<LoginPage />)

    expect(replaceMock).toHaveBeenCalledWith("/admin/dashboard")
  })

  it("keeps the submit button disabled until both fields are non-empty", async () => {
    const user = userEvent.setup()
    render(<LoginPage />)

    const submit = screen.getByRole("button", { name: "Sign in" })
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText("Username"), "jdoe")
    expect(submit).toBeDisabled()

    await user.type(screen.getByLabelText("Password"), "hunter2")
    expect(submit).toBeEnabled()
  })
})
