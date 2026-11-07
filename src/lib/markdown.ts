export function stripFrontMatter(content: string): string {
  if (!content.startsWith("---\n") && !content.startsWith("---\r\n")) {
    return content;
  }

  const normalized = content.replace(/\r\n/g, "\n");
  const closing = normalized.indexOf("\n---\n", 4);
  if (closing < 0) {
    return content;
  }

  return normalized.slice(closing + "\n---\n".length);
}
