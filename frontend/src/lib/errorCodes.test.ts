import { describe, it, expect } from "vitest"
import { getHttpErrorMessage, HTTP_ERROR_MESSAGES } from "./errorCodes"

describe("getHttpErrorMessage", () => {
  it("returns the specific mapped message for a known status code", () => {
    expect(getHttpErrorMessage(404)).toBe(HTTP_ERROR_MESSAGES[404])
    expect(getHttpErrorMessage(401)).toBe(HTTP_ERROR_MESSAGES[401])
  })

  it("falls back to a generic server-error message for an unmapped 5xx code", () => {
    expect(getHttpErrorMessage(599)).toBe("A server error occurred. Please try again.")
  })

  it("falls back to a generic client-error message for an unmapped 4xx code", () => {
    expect(getHttpErrorMessage(499)).toBe("An unexpected error occurred.")
  })
})
