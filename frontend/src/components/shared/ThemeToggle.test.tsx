import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { ThemeToggle } from "./ThemeToggle"

const setThemeMock = vi.fn()
let currentTheme = "light"

vi.mock("next-themes", () => ({
  useTheme: () => ({ theme: currentTheme, setTheme: setThemeMock }),
}))

describe("ThemeToggle", () => {
  it("renders the moon icon (switch-to-dark affordance) in light mode", async () => {
    currentTheme = "light"
    render(<ThemeToggle />)
    expect(await screen.findByRole("button", { name: "Switch to dark mode" })).toBeInTheDocument()
  })

  it("renders the sun icon (switch-to-light affordance) in dark mode", async () => {
    currentTheme = "dark"
    render(<ThemeToggle />)
    expect(await screen.findByRole("button", { name: "Switch to light mode" })).toBeInTheDocument()
  })

  it("calls setTheme with the opposite theme on click", async () => {
    currentTheme = "light"
    setThemeMock.mockClear()
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(await screen.findByRole("button"))
    expect(setThemeMock).toHaveBeenCalledWith("dark")
  })
})
