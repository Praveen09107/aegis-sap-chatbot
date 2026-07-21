import { describe, it, expect, vi, afterEach } from "vitest"
import {
  cn,
  formatRelativeDate,
  groupSessionsByDate,
  formatScore,
  formatFileSize,
  formatDuration,
  truncate,
  debounce,
  hasSAPEntities,
  sleep,
  formatDateLocalized,
  formatDateIST,
  toLocalizedDateString,
  toISTDateString,
  startOfTodayLocalized,
  startOfTodayIST,
} from "./utils"

describe("cn", () => {
  it("joins plain class strings", () => {
    expect(cn("flex", "items-center")).toBe("flex items-center")
  })

  it("drops falsy values", () => {
    expect(cn("flex", false, undefined, null, "gap-2")).toBe("flex gap-2")
  })

  it("resolves conflicting Tailwind utilities to the last one (tailwind-merge behavior)", () => {
    expect(cn("px-2", "px-4")).toBe("px-4")
  })

  it("applies conditional classes from an object", () => {
    expect(cn("base", { "text-danger": true, "text-success": false })).toBe("base text-danger")
  })
})

describe("formatRelativeDate", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("returns 'Today' for the current date", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"))
    expect(formatRelativeDate(new Date("2026-07-19T08:00:00Z"))).toBe("Today")
  })

  it("returns 'Yesterday' for exactly one day ago", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"))
    expect(formatRelativeDate(new Date("2026-07-18T12:00:00Z"))).toBe("Yesterday")
  })

  it("returns 'N days ago' under a week", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"))
    expect(formatRelativeDate(new Date("2026-07-16T12:00:00Z"))).toBe("3 days ago")
  })

  it("returns 'N weeks ago' under a month", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"))
    expect(formatRelativeDate(new Date("2026-07-05T12:00:00Z"))).toBe("2 weeks ago")
  })

  it("returns 'N months ago' under a year", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"))
    expect(formatRelativeDate(new Date("2026-04-19T12:00:00Z"))).toBe("3 months ago")
  })

  it("returns 'N years ago' beyond a year", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"))
    expect(formatRelativeDate(new Date("2024-07-19T12:00:00Z"))).toBe("2 years ago")
  })

  it("accepts an ISO string as well as a Date", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"))
    expect(formatRelativeDate("2026-07-19T08:00:00Z")).toBe("Today")
  })
})

describe("groupSessionsByDate", () => {
  it("groups sessions under the correct relative-date label, preserving first-seen order", () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date("2026-07-19T12:00:00Z"))
    const sessions = [
      { id: "1", updated_at: "2026-07-19T08:00:00Z" }, // Today
      { id: "2", updated_at: "2026-07-18T08:00:00Z" }, // Yesterday
      { id: "3", updated_at: "2026-07-19T06:00:00Z" }, // Today
    ]
    const groups = groupSessionsByDate(sessions)
    expect(groups.map(([label]) => label)).toEqual(["Today", "Yesterday"])
    expect(groups[0][1].map((s) => s.id)).toEqual(["1", "3"])
    expect(groups[1][1].map((s) => s.id)).toEqual(["2"])
    vi.useRealTimers()
  })

  it("returns an empty array for no sessions", () => {
    expect(groupSessionsByDate([])).toEqual([])
  })
})

describe("formatScore", () => {
  it("formats a fraction as a one-decimal percentage", () => {
    expect(formatScore(0.847)).toBe("84.7%")
  })

  it("handles 0 and 1 boundaries", () => {
    expect(formatScore(0)).toBe("0.0%")
    expect(formatScore(1)).toBe("100.0%")
  })
})

describe("formatFileSize", () => {
  it("formats bytes under 1KB as bytes", () => {
    expect(formatFileSize(500)).toBe("500 B")
  })

  it("formats kilobytes with one decimal", () => {
    expect(formatFileSize(1536)).toBe("1.5 KB")
  })

  it("formats megabytes with one decimal", () => {
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0 MB")
  })
})

describe("formatDuration", () => {
  it("formats sub-second durations in ms", () => {
    expect(formatDuration(450)).toBe("450ms")
  })

  it("formats sub-minute durations in seconds", () => {
    expect(formatDuration(4500)).toBe("4.5s")
  })

  it("formats durations over a minute as m/s", () => {
    expect(formatDuration(125_000)).toBe("2m 5s")
  })
})

describe("truncate", () => {
  it("leaves short strings unchanged", () => {
    expect(truncate("hello", 10)).toBe("hello")
  })

  it("truncates long strings with an ellipsis, respecting maxLength", () => {
    const result = truncate("this is a long string", 10)
    expect(result).toBe("this is...")
    expect(result.length).toBe(10)
  })
})

describe("debounce", () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it("only invokes the wrapped function once after the delay, using the last call's args", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced("first")
    debounced("second")
    debounced("third")
    expect(fn).not.toHaveBeenCalled()

    vi.advanceTimersByTime(200)
    expect(fn).toHaveBeenCalledTimes(1)
    expect(fn).toHaveBeenCalledWith("third")
  })

  it("invokes again on a separate call after the delay has elapsed", () => {
    vi.useFakeTimers()
    const fn = vi.fn()
    const debounced = debounce(fn, 200)

    debounced("a")
    vi.advanceTimersByTime(200)
    debounced("b")
    vi.advanceTimersByTime(200)

    expect(fn).toHaveBeenCalledTimes(2)
    expect(fn).toHaveBeenNthCalledWith(1, "a")
    expect(fn).toHaveBeenNthCalledWith(2, "b")
  })
})

describe("hasSAPEntities", () => {
  it("detects an error code", () => {
    expect(hasSAPEntities("Getting VL150 when creating delivery")).toBe(true)
  })

  it("detects a transaction code", () => {
    expect(hasSAPEntities("Open VL01N to check")).toBe(true)
  })

  it("detects a document number", () => {
    expect(hasSAPEntities("Document 4500012345 failed")).toBe(true)
  })

  it("returns false for plain text with no SAP entities", () => {
    expect(hasSAPEntities("hello world, nothing to see here")).toBe(false)
  })
})

describe("formatDateLocalized", () => {
  it("formats a date string using the default (en-IN/Asia-Kolkata) deploy locale", () => {
    // 2024-03-28T09:00:00Z is 14:30 IST (UTC+5:30)
    expect(formatDateLocalized("2024-03-28T09:00:00Z")).toBe("28 Mar 2024, 02:30 pm")
  })

  it("formats a Date object the same way as an ISO string", () => {
    expect(formatDateLocalized(new Date("2024-03-28T09:00:00Z"))).toBe("28 Mar 2024, 02:30 pm")
  })

  it("formatDateIST is a deprecated alias for formatDateLocalized, not a separate hardcoded implementation", () => {
    expect(formatDateIST).toBe(formatDateLocalized)
  })

  it("honors NEXT_PUBLIC_DEPLOY_LOCALE/NEXT_PUBLIC_DEPLOY_TIMEZONE overrides for a non-Indian deployment", async () => {
    vi.resetModules()
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_LOCALE", "en-US")
    vi.stubEnv("NEXT_PUBLIC_DEPLOY_TIMEZONE", "America/New_York")
    try {
      const { formatDateLocalized: formatOverridden } = await import("./utils")
      // 2024-03-28T09:00:00Z is 05:00 EDT (UTC-4) in New York
      expect(formatOverridden("2024-03-28T09:00:00Z")).toBe("Mar 28, 2024, 05:00 AM")
    } finally {
      vi.unstubAllEnvs()
      vi.resetModules()
    }
  })
})

describe("toLocalizedDateString", () => {
  it("returns a YYYY-MM-DD string in the deploy timezone", () => {
    // 2024-03-28T20:00:00Z is 2024-03-29 01:30 IST — crosses into the next day
    expect(toLocalizedDateString(new Date("2024-03-28T20:00:00Z"))).toBe("2024-03-29")
  })

  it("toISTDateString is a deprecated alias for toLocalizedDateString", () => {
    expect(toISTDateString).toBe(toLocalizedDateString)
  })
})

describe("startOfTodayLocalized", () => {
  it("returns a UTC Date whose deploy-timezone-local date matches today's deploy-timezone date", () => {
    const result = startOfTodayLocalized()
    const expectedLocalDate = new Date().toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })
    expect(result.toLocaleDateString("en-CA", { timeZone: "Asia/Kolkata" })).toBe(expectedLocalDate)
  })

  it("is exactly midnight in the deploy timezone (00:00:00 local)", () => {
    const result = startOfTodayLocalized()
    const localTimeParts = new Intl.DateTimeFormat("en-US", {
      timeZone: "Asia/Kolkata",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
      hourCycle: "h23",
    }).formatToParts(result)
    const hour = localTimeParts.find((p) => p.type === "hour")?.value
    const minute = localTimeParts.find((p) => p.type === "minute")?.value
    expect(`${hour}:${minute}`).toBe("00:00")
  })

  it("startOfTodayIST is a deprecated alias for startOfTodayLocalized", () => {
    expect(startOfTodayIST).toBe(startOfTodayLocalized)
  })
})

describe("sleep", () => {
  it("resolves after the given delay", async () => {
    vi.useFakeTimers()
    const promise = sleep(1000)
    let resolved = false
    promise.then(() => {
      resolved = true
    })

    await vi.advanceTimersByTimeAsync(1000)
    expect(resolved).toBe(true)
    vi.useRealTimers()
  })
})
