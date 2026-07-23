import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { FormField, TextArea, NoneCheckboxField } from "./FormFieldPrimitives"

describe("FormField", () => {
  it("renders the label, required marker, hint, and children", () => {
    render(
      <FormField label="Issue description" required hint="One sentence">
        <span>child content</span>
      </FormField>
    )
    expect(screen.getByText("Issue description")).toBeInTheDocument()
    expect(screen.getByText("*")).toBeInTheDocument()
    expect(screen.getByText("One sentence")).toBeInTheDocument()
    expect(screen.getByText("child content")).toBeInTheDocument()
  })

  it("omits the required marker when not required", () => {
    render(<FormField label="Notes">{null}</FormField>)
    expect(screen.queryByText("*")).not.toBeInTheDocument()
  })
})

describe("TextArea", () => {
  it("calls onChange with the new text", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<TextArea value="" onChange={onChange} />)
    await user.type(screen.getByRole("textbox"), "a")
    expect(onChange).toHaveBeenCalledWith("a")
  })
})

describe("NoneCheckboxField", () => {
  it("shows a text input when value isn't NONE", () => {
    render(<NoneCheckboxField label="Error code" noneLabel="No error code" value="" onChange={vi.fn()} />)
    expect(screen.getByRole("textbox")).toBeInTheDocument()
    expect(screen.getByRole("checkbox")).not.toBeChecked()
  })

  it("hides the text field and checks the box when value is NONE", () => {
    render(<NoneCheckboxField label="Error code" noneLabel="No error code" value="NONE" onChange={vi.fn()} />)
    expect(screen.queryByRole("textbox")).not.toBeInTheDocument()
    expect(screen.getByRole("checkbox")).toBeChecked()
  })

  it("sets the value to the literal string NONE when the checkbox is checked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NoneCheckboxField label="Error code" noneLabel="No error code" value="" onChange={onChange} />)
    await user.click(screen.getByRole("checkbox"))
    expect(onChange).toHaveBeenCalledWith("NONE")
  })

  it("clears back to an empty string when unchecked", async () => {
    const user = userEvent.setup()
    const onChange = vi.fn()
    render(<NoneCheckboxField label="Error code" noneLabel="No error code" value="NONE" onChange={onChange} />)
    await user.click(screen.getByRole("checkbox"))
    expect(onChange).toHaveBeenCalledWith("")
  })

  it("uses a textarea when multiline is set", () => {
    render(<NoneCheckboxField label="Error message" noneLabel="No message" value="" onChange={vi.fn()} multiline />)
    expect(screen.getByRole("textbox").tagName).toBe("TEXTAREA")
  })
})
