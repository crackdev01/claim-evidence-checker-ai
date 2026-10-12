import type { RulePassage } from "./schema";

export type ParsedRulePack = {
  name: string | null;
  passages: RulePassage[];
  /** Problems that make citations ambiguous; the request is rejected. */
  errors: string[];
  /** Things the reviewer should know but that do not block an assessment. */
  notes: string[];
};

const HEADER = /^\[([A-Za-z0-9][A-Za-z0-9._-]*)\]\s*(.*)$/;
const VERSION_COMMENT = /^#\s*Version:\s*([^,]+)/i;

/**
 * Parses supplied legal text into citable passages.
 *
 * Preferred format: each passage starts with a header line
 * `[RULE-ID] Title | Source | Applicability`, followed by the passage text.
 * Lines starting with "#" are comments. Text without any headers is split into
 * paragraphs with generated IDs R1, R2, ... so that pasted legal text still works.
 */
export function parseRulePack(input: string): ParsedRulePack {
  const lines = input.replace(/\r\n?/g, "\n").split("\n");
  const passages: RulePassage[] = [];
  const errors: string[] = [];
  const notes: string[] = [];
  let name: string | null = null;
  let current: { header: Omit<RulePassage, "text">; body: string[] } | null = null;
  const orphanLines: string[] = [];

  const flush = () => {
    if (!current) return;
    const text = current.body.join("\n").trim();
    if (!text) errors.push(`Rule ${current.header.id} has a header but no text.`);
    else passages.push({ ...current.header, text });
    current = null;
  };

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith("#")) {
      const version = VERSION_COMMENT.exec(trimmed);
      if (version?.[1] && !name) name = version[1].trim();
      continue;
    }
    const header = HEADER.exec(trimmed);
    if (header) {
      flush();
      const [title = "", source = "", applicability = ""] = (header[2] ?? "").split(" | ").map((part) => part.trim());
      current = { header: { id: header[1]!, title: title || header[1]!, source, applicability }, body: [] };
      continue;
    }
    if (current) current.body.push(line);
    else orphanLines.push(line);
  }
  flush();

  const orphanText = orphanLines.join("\n").trim();
  if (passages.length === 0 && orphanText) {
    const paragraphs = orphanText.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
    paragraphs.forEach((text, index) => {
      const firstLine = text.split("\n")[0] ?? "";
      passages.push({
        id: `R${index + 1}`,
        title: firstLine.length > 80 ? `${firstLine.slice(0, 77)}...` : firstLine,
        source: "Supplied text",
        applicability: "",
        text,
      });
    });
    notes.push(`No [RULE-ID] headers found, so the text was split into ${paragraphs.length} paragraphs (R1-R${paragraphs.length}).`);
  } else if (orphanText) {
    notes.push("Text before the first [RULE-ID] header was ignored.");
  }

  const seen = new Set<string>();
  for (const passage of passages) {
    if (seen.has(passage.id)) errors.push(`Rule ID ${passage.id} appears more than once.`);
    seen.add(passage.id);
  }
  if (passages.length === 0) errors.push("No rule passages found in the supplied legal text.");

  return { name, passages, errors, notes };
}
