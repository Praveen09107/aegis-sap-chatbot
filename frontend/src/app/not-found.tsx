import Link from "next/link"
import { FileQuestion } from "lucide-react"

export default function NotFound() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-bg-secondary">
      <div className="max-w-md w-full mx-4 text-center">
        <div className="w-16 h-16 rounded-2xl bg-accent-subtle border border-border-primary flex items-center justify-center mx-auto mb-6">
          <FileQuestion className="w-8 h-8 text-accent" />
        </div>

        <h1 className="text-2xl font-bold text-text-primary mb-2">Page not found</h1>
        <p className="text-text-secondary mb-8 text-sm leading-relaxed">
          The page you&apos;re looking for doesn&apos;t exist or has been moved.
        </p>

        <Link
          href="/"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent text-white rounded-lg text-sm font-medium hover:bg-accent-hover transition-colors"
        >
          Back to AEGIS
        </Link>
      </div>
    </div>
  )
}
