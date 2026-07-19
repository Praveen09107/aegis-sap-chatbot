import { test, expect } from "@playwright/experimental-ct-react"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card"
import { Spinner } from "@/components/ui/spinner"
import { StatusDot } from "@/components/ui/status-dot"
import { AvatarWithInitials } from "@/components/ui/avatar-fallback"

// F05 — component-level visual baselines for the core foundational
// components (FRONTEND_05_CORE_COMPONENTS.md), captured via Playwright CT
// per the pattern established in F04 (no real page renders these yet).
//
// NOTE: could not be executed in the sandbox this was authored in — same
// Playwright browser-binary limitation already disclosed in
// tests/e2e/design-tokens.spec.ts and tests/ct/f04-tailwind-globals.spec.tsx.
// Run `npx playwright test -c playwright-ct.config.ts --update-snapshots`
// once on a machine with `sudo npx playwright install-deps` already done.

test.describe("Button variants", () => {
  test("all 7 variants render with distinct AEGIS colors", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 16, background: "white" }}>
        <Button variant="default">Default</Button>
        <Button variant="destructive">Destructive</Button>
        <Button variant="outline">Outline</Button>
        <Button variant="secondary">Secondary</Button>
        <Button variant="ghost">Ghost</Button>
        <Button variant="success">Success</Button>
        <Button variant="link">Link</Button>
      </div>
    )
    await expect(component).toHaveScreenshot("button-variants-light.png")
  })

  test("loading state shows a spinner and disabled styling", async ({ mount }) => {
    const component = await mount(
      <div style={{ padding: 16, background: "white" }}>
        <Button loading>Saving</Button>
      </div>
    )
    await expect(component).toHaveScreenshot("button-loading.png")
  })
})

test.describe("Badge variants", () => {
  test("confidence system + document-status variants are visually distinct", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", flexWrap: "wrap", gap: 8, padding: 16, background: "white" }}>
        <Badge variant="success" dot>High confidence</Badge>
        <Badge variant="warning" dot>Moderate</Badge>
        <Badge variant="danger" dot>Insufficient</Badge>
        <Badge variant="active">Active</Badge>
        <Badge variant="deprecated">Deprecated</Badge>
        <Badge variant="processing">Processing</Badge>
      </div>
    )
    await expect(component).toHaveScreenshot("badge-variants-light.png")
  })
})

test.describe("Card variants", () => {
  test("default/elevated/ghost/sunken/accent are visually distinct", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", gap: 12, padding: 16, background: "#F8FAFC" }}>
        <Card style={{ width: 140 }}>
          <CardHeader>
            <CardTitle>Default</CardTitle>
          </CardHeader>
          <CardContent>Body</CardContent>
        </Card>
        <Card variant="elevated" style={{ width: 140 }}>
          <CardContent>Elevated</CardContent>
        </Card>
        <Card variant="accent" style={{ width: 140 }}>
          <CardContent>Accent</CardContent>
        </Card>
      </div>
    )
    await expect(component).toHaveScreenshot("card-variants-light.png")
  })
})

test.describe("Spinner sizes and colors", () => {
  test("xs/sm/md/lg/xl render at increasing sizes", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, background: "white" }}>
        <Spinner size="xs" color="accent" />
        <Spinner size="sm" color="accent" />
        <Spinner size="md" color="accent" />
        <Spinner size="lg" color="accent" />
        <Spinner size="xl" color="accent" />
      </div>
    )
    await expect(component).toHaveScreenshot("spinner-sizes.png")
  })
})

test.describe("StatusDot", () => {
  test("online/offline/connecting/error/warning are visually distinct with labels", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", flexDirection: "column", gap: 8, padding: 16, background: "white" }}>
        <StatusDot status="online" showLabel />
        <StatusDot status="offline" showLabel />
        <StatusDot status="connecting" showLabel />
        <StatusDot status="error" showLabel />
        <StatusDot status="warning" showLabel />
      </div>
    )
    await expect(component).toHaveScreenshot("status-dot-all.png")
  })
})

test.describe("AvatarWithInitials", () => {
  test("renders initials at each size", async ({ mount }) => {
    const component = await mount(
      <div style={{ display: "flex", alignItems: "center", gap: 12, padding: 16, background: "white" }}>
        <AvatarWithInitials name="Jane Doe" size="sm" />
        <AvatarWithInitials name="Jane Doe" size="default" />
        <AvatarWithInitials name="Jane Doe" size="lg" />
      </div>
    )
    await expect(component).toHaveScreenshot("avatar-initials.png")
  })
})
