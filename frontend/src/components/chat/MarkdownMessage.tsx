"use client"

import { Children, type ReactNode } from "react"
import ReactMarkdown, { type Components } from "react-markdown"
import remarkGfm from "remark-gfm"
import rehypeSanitize from "rehype-sanitize"
import { SAPEntityHighlighter } from "./SAPEntityHighlighter"

interface MarkdownMessageProps {
  content: string
}

/**
 * Renders LLM-generated AI response content as markdown.
 *
 * Security (FRONTEND_VERIFICATION_STANDARDS.md Part 6): this is a real XSS
 * surface, not a theoretical one — `content` is model output, which can
 * itself be influenced by retrieved document text or, in principle, a
 * prompt-injected instruction. Two independent layers, not one:
 *  1. react-markdown never uses dangerouslySetInnerHTML for the nodes it
 *     parses — markdown syntax becomes real React elements, and literal
 *     HTML in the source is rendered as escaped text, not interpreted,
 *     because rehype-raw (the plugin that WOULD parse embedded HTML into
 *     the tree) is deliberately not used here.
 *  2. rehype-sanitize is wired in anyway, stripping any script/event-handler/
 *     javascript: content that could reach the tree — a defense-in-depth
 *     layer that costs nothing today and matters immediately if a later
 *     session ever adds rehype-raw for richer HTML support.
 *
 * SAP entity highlighting composes with markdown here (not just applied to
 * raw text) by overriding the leaf text-bearing elements (p, li, strong,
 * em, table cells) and running their string children through
 * SAPEntityHighlighter — code/pre are deliberately left alone so code
 * examples display literally, not as interactive chips.
 */
export function MarkdownMessage({ content }: MarkdownMessageProps) {
  return (
    <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]} components={markdownComponents}>
      {content}
    </ReactMarkdown>
  )
}

function highlightTextChildren(children: ReactNode): ReactNode {
  return Children.map(children, (child) => {
    if (typeof child === "string") {
      return <SAPEntityHighlighter text={child} />
    }
    return child
  })
}

const markdownComponents: Components = {
  p: ({ children }) => <p>{highlightTextChildren(children)}</p>,
  li: ({ children }) => <li>{highlightTextChildren(children)}</li>,
  strong: ({ children }) => <strong>{highlightTextChildren(children)}</strong>,
  em: ({ children }) => <em>{highlightTextChildren(children)}</em>,
  td: ({ children }) => <td>{highlightTextChildren(children)}</td>,
  th: ({ children }) => <th>{highlightTextChildren(children)}</th>,
  // code/pre intentionally NOT overridden — code examples render literally,
  // never as interactive entity chips.
  a: ({ children, href, ...props }) => {
    // rel="noopener noreferrer" — a target="_blank" link with only
    // rel="noopener" would still leak via window.opener otherwise; sourced
    // from model output, not something to trust by default.
    const isExternal = typeof href === "string" && /^https?:\/\//.test(href)
    return (
      <a href={href} target={isExternal ? "_blank" : undefined} rel={isExternal ? "noopener noreferrer" : undefined} {...props}>
        {children}
      </a>
    )
  },
}
