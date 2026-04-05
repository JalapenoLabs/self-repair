// Copyright © 2026 self-repair contributors

/**
 * Parses YAML-like frontmatter from a markdown file.
 * Returns the frontmatter key-value pairs and the body content below it.
 *
 * Supports simple scalar values and YAML list syntax (- item).
 * Does NOT handle nested objects or complex YAML -- just what our
 * skill output files need.
 */
export function parseFrontmatter(
  content: string,
): { meta: Record<string, string | string[]>, body: string } {
  const meta: Record<string, string | string[]> = {}

  const fmMatch = content.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/)
  if (!fmMatch) {
    return { meta, body: content }
  }

  const frontmatterBlock = fmMatch[1] ?? ''
  const body = (fmMatch[2] ?? '').trim()

  const lines = frontmatterBlock.split('\n')
  let currentKey: string | null = null
  let currentList: string[] | null = null

  for (const line of lines) {
    // List item: "  - value"
    const listMatch = line.match(/^\s+-\s+(.+)$/)
    if (listMatch && currentKey) {
      if (!currentList) {
        currentList = []
      }
      currentList.push(listMatch[1]!.trim())
      meta[currentKey] = currentList
      continue
    }

    // Key-value pair: "key: value"
    const kvMatch = line.match(/^([a-zA-Z_]\w*):\s*(.*)$/)
    if (kvMatch) {
      // Save any in-progress list
      currentKey = kvMatch[1] ?? null
      const rawValue = (kvMatch[2] ?? '').trim()
      currentList = null

      if (currentKey) {
        // Strip surrounding quotes if present
        const unquoted = rawValue.replace(/^["'](.*)["']$/, '$1')
        meta[currentKey] = unquoted
      }
    }
  }

  return { meta, body }
}
