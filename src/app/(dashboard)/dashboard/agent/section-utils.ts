export type Section = {
  title: string
  content: string
}

function toTitleCase(str: string): string {
  return str.replace(/\w\S*/g, (w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase())
}

export function parseBusinessContext(text: string): Section[] {
  const parts = text.split(/^## /m)
  const sections: Section[] = []

  for (const part of parts) {
    const trimmed = part.trim()
    if (!trimmed) continue
    const newlineIndex = trimmed.indexOf('\n')
    if (newlineIndex === -1) continue  // sem conteúdo, ignora
    const rawTitle = trimmed.slice(0, newlineIndex).trim()
    const content  = trimmed.slice(newlineIndex + 1).trim()
    if (!content || rawTitle.startsWith('#')) continue
    sections.push({ title: toTitleCase(rawTitle), content })
  }

  return sections
}

export function reconstructBusinessContext(sections: Section[]): string {
  return sections
    .map(s => `## ${s.title}\n${s.content.trim()}`)
    .join('\n\n')
}
