/** Extracted text carries the hard line breaks of the source PDF, so a single
 *  newline is a wrap at the document's column width, not an authored break.
 *  Collapse those so the browser reflows the text, but keep blank lines, which
 *  do separate real blocks such as a results list before the question. */
export function toParagraphs(text: string): string[] {
  return text
    .split(/\n\s*\n/)
    .map(block => block.replace(/\s+/g, ' ').trim())
    .filter(Boolean);
}

/** Same collapsing, flattened to one line. Used for short strings such as
 *  answer options, where a block break would be noise. */
export function toSingleLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}
