/**
 * GitHub Content Indexer — classifies and extracts structured metadata
 * from synced course repository documents.
 *
 * Layer 2 of the GitHub content agent architecture.
 */

export type DocType =
  | "assignment"
  | "syllabus"
  | "lecture-notes"
  | "project-spec"
  | "exam-info"
  | "general-info"
  | "other";

export interface IndexedDocument {
  /** Stable ID derived from owner/repo/path */
  id: string;
  courseCode: string;
  owner: string;
  repo: string;
  path: string;
  url: string;
  docType: DocType;
  title: string;
  summary: string;
  highlights: string[];
  /** Full plain-text snippet for Gemini tool lookups */
  snippet: string;
  /** Structured metadata extracted per docType */
  metadata: DocumentMetadata;
  /** Blob SHA for change detection */
  blobSha: string;
  /** Last time this document was indexed */
  indexedAt: string;
}

export interface AssignmentMetadata {
  deadline?: string;
  submissionFormat?: string;
  requirements: string[];
  gradingWeight?: string;
  groupOrIndividual?: "group" | "individual" | "unknown";
  labNumber?: number;
}

export interface SyllabusMetadata {
  courseName?: string;
  credits?: string;
  lecturer?: string;
  gradingBreakdown: string[];
  readingList: string[];
}

export interface ExamMetadata {
  date?: string;
  duration?: string;
  format?: string;
  allowedAids: string[];
}

export interface ProjectMetadata {
  milestones: string[];
  teamSize?: string;
  deliverables: string[];
  technologies: string[];
}

export type DocumentMetadata =
  | { type: "assignment"; data: AssignmentMetadata }
  | { type: "syllabus"; data: SyllabusMetadata }
  | { type: "exam-info"; data: ExamMetadata }
  | { type: "project-spec"; data: ProjectMetadata }
  | { type: "general"; data: Record<string, never> };

// ── Classification rules ──────────────────────────────────────────

const PATH_RULES: Array<{ pattern: RegExp; docType: DocType }> = [
  { pattern: /assignments?\//i, docType: "assignment" },
  { pattern: /labs?\d*\//i, docType: "assignment" },
  { pattern: /oblig/i, docType: "assignment" },
  { pattern: /problem[-_]?set/i, docType: "assignment" },
  { pattern: /pset/i, docType: "assignment" },
  { pattern: /exam/i, docType: "exam-info" },
  { pattern: /syllabus/i, docType: "syllabus" },
  { pattern: /course[-_]?info/i, docType: "syllabus" },
  { pattern: /lecture[-_]?notes?/i, docType: "lecture-notes" },
  { pattern: /slides?\//i, docType: "lecture-notes" },
  { pattern: /project[-_]?spec/i, docType: "project-spec" },
  { pattern: /prosjekt/i, docType: "project-spec" },
];

const HEADING_RULES: Array<{ pattern: RegExp; docType: DocType }> = [
  { pattern: /\b(lab|assignment|oblig|deliverable)\b/i, docType: "assignment" },
  { pattern: /\bexam\b/i, docType: "exam-info" },
  { pattern: /\b(syllabus|course\s*(overview|info|description))\b/i, docType: "syllabus" },
  { pattern: /\b(project|prosjekt)\b/i, docType: "project-spec" },
  { pattern: /\b(lecture|slides|reading)\b/i, docType: "lecture-notes" },
];

/**
 * Classify a markdown document by its path and content.
 */
export function classifyDocument(path: string, markdown: string): DocType {
  // 1. Path-based classification (fastest)
  for (const rule of PATH_RULES) {
    if (rule.pattern.test(path)) {
      return rule.docType;
    }
  }

  // 2. First heading in the document
  const headingMatch = markdown.match(/^#{1,2}\s+(.+)$/m);
  if (headingMatch) {
    const heading = headingMatch[1];
    for (const rule of HEADING_RULES) {
      if (rule.pattern.test(heading)) {
        return rule.docType;
      }
    }
  }

  // 3. Content-based: presence of deadline table → assignment
  if (hasDeadlineTable(markdown)) {
    return "assignment";
  }

  // 4. README in root → general-info (likely course overview)
  if (/^readme\.md$/i.test(path)) {
    return "general-info";
  }

  return "other";
}

function hasDeadlineTable(markdown: string): boolean {
  const lines = markdown.split("\n");
  for (const line of lines) {
    if (line.startsWith("|") && /deadline|due\s*date/i.test(line)) {
      return true;
    }
  }
  return false;
}

// ── Metadata extraction ───────────────────────────────────────────

/**
 * Extract structured metadata from a classified document.
 */
export function extractMetadata(docType: DocType, markdown: string): DocumentMetadata {
  switch (docType) {
    case "assignment":
      return { type: "assignment", data: extractAssignmentMetadata(markdown) };
    case "syllabus":
    case "general-info":
      return { type: "syllabus", data: extractSyllabusMetadata(markdown) };
    case "exam-info":
      return { type: "exam-info", data: extractExamMetadata(markdown) };
    case "project-spec":
      return { type: "project-spec", data: extractProjectMetadata(markdown) };
    default:
      return { type: "general", data: {} };
  }
}

function extractAssignmentMetadata(md: string): AssignmentMetadata {
  const result: AssignmentMetadata = {
    requirements: [],
    groupOrIndividual: "unknown"
  };

  // Deadline extraction
  const deadlineMatch = md.match(/(?:deadline|due\s*(?:date)?)\s*[:：]\s*(.+)/i)
    ?? md.match(/\*\*deadline\*\*\s*[:：]?\s*(.+)/i);
  if (deadlineMatch) {
    result.deadline = deadlineMatch[1].trim().replace(/\*\*/g, "");
  }

  // Lab number
  const labMatch = md.match(/\blab\s*(\d+)/i) ?? md.match(/\bassignment\s*(\d+)/i);
  if (labMatch) {
    result.labNumber = parseInt(labMatch[1], 10);
  }

  // Submission format
  const submissionMatch = md.match(/(?:submit|submission|hand[- ]?in|deliver)\s*(?:via|through|on|to|using)?\s*[:：]?\s*(.{10,80})/i);
  if (submissionMatch) {
    result.submissionFormat = submissionMatch[1].trim();
  }

  // Group/individual
  if (/\b(individual|solo|alone)\b/i.test(md)) {
    result.groupOrIndividual = "individual";
  } else if (/\b(group|team|pair|partner)\b/i.test(md)) {
    result.groupOrIndividual = "group";
  }

  // Requirements (bulleted or numbered items under "requirements" heading)
  const reqSection = md.match(/#{1,4}\s*(?:requirements?|tasks?|deliverables?|what to do)\s*\n([\s\S]*?)(?=\n#{1,4}\s|\n\n\n|$)/i);
  if (reqSection) {
    const items = reqSection[1]
      .split("\n")
      .filter(line => /^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line))
      .map(line => line.replace(/^\s*[-*+\d.]+\s+/, "").trim())
      .filter(line => line.length > 5)
      .slice(0, 8);
    result.requirements = items;
  }

  // Grading weight
  const gradingMatch = md.match(/(?:weight|worth|counts?\s*for|percentage)\s*[:：]?\s*(\d+\s*%)/i);
  if (gradingMatch) {
    result.gradingWeight = gradingMatch[1];
  }

  return result;
}

function extractSyllabusMetadata(md: string): SyllabusMetadata {
  const result: SyllabusMetadata = {
    gradingBreakdown: [],
    readingList: []
  };

  // Course name from first H1
  const h1 = md.match(/^#\s+(.+)$/m);
  if (h1) {
    result.courseName = h1[1].replace(/\*\*/g, "").trim();
  }

  // Credits
  const creditsMatch = md.match(/(\d+)\s*(?:credits?|ECTS|stp|studiepoeng)/i);
  if (creditsMatch) {
    result.credits = creditsMatch[1] + " credits";
  }

  // Lecturer
  const lecturerMatch = md.match(/(?:lecturer|instructor|professor|teacher)\s*[:：]\s*(.+)/i);
  if (lecturerMatch) {
    result.lecturer = lecturerMatch[1].trim().replace(/\*\*/g, "");
  }

  // Grading breakdown
  const gradingSection = md.match(/#{1,4}\s*(?:grading|evaluation|assessment)\s*\n([\s\S]*?)(?=\n#{1,4}\s|\n\n\n|$)/i);
  if (gradingSection) {
    const items = gradingSection[1]
      .split("\n")
      .filter(line => /\d+\s*%/.test(line) || /^\s*[-*+]\s+/.test(line))
      .map(line => line.replace(/^\s*[-*+\d.]+\s+/, "").trim())
      .filter(line => line.length > 3)
      .slice(0, 6);
    result.gradingBreakdown = items;
  }

  // Reading list
  const readingSection = md.match(/#{1,4}\s*(?:reading|textbook|literature|resources?)\s*\n([\s\S]*?)(?=\n#{1,4}\s|\n\n\n|$)/i);
  if (readingSection) {
    const items = readingSection[1]
      .split("\n")
      .filter(line => /^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line))
      .map(line => line.replace(/^\s*[-*+\d.]+\s+/, "").trim())
      .filter(line => line.length > 5)
      .slice(0, 6);
    result.readingList = items;
  }

  return result;
}

function extractExamMetadata(md: string): ExamMetadata {
  const result: ExamMetadata = {
    allowedAids: []
  };

  // Exam date
  const dateMatch = md.match(/(?:exam\s*)?date\s*[:：]\s*(.+)/i)
    ?? md.match(/(\d{1,2}[./]\d{1,2}[./]\d{4})/);
  if (dateMatch) {
    result.date = dateMatch[1].trim();
  }

  // Duration
  const durationMatch = md.match(/(?:duration|length|time)\s*[:：]\s*(.+?)(?:\n|$)/i);
  if (durationMatch) {
    result.duration = durationMatch[1].trim();
  }

  // Format
  const formatMatch = md.match(/(?:format|type)\s*[:：]\s*(.+?)(?:\n|$)/i);
  if (formatMatch) {
    result.format = formatMatch[1].trim();
  } else if (/\b(written|skriftlig)\b/i.test(md)) {
    result.format = "written";
  } else if (/\b(oral|muntlig)\b/i.test(md)) {
    result.format = "oral";
  } else if (/\b(digital|computer)\b/i.test(md)) {
    result.format = "digital";
  }

  // Allowed aids
  const aidsSection = md.match(/#{1,4}\s*(?:allowed\s*aids?|permitted|hjelpemidler)\s*\n([\s\S]*?)(?=\n#{1,4}\s|\n\n\n|$)/i);
  if (aidsSection) {
    const items = aidsSection[1]
      .split("\n")
      .filter(line => /^\s*[-*+]\s+/.test(line))
      .map(line => line.replace(/^\s*[-*+]\s+/, "").trim())
      .filter(line => line.length > 2)
      .slice(0, 6);
    result.allowedAids = items;
  }

  return result;
}

function extractProjectMetadata(md: string): ProjectMetadata {
  const result: ProjectMetadata = {
    milestones: [],
    deliverables: [],
    technologies: []
  };

  // Team size
  const teamMatch = md.match(/(?:team|group)\s*size\s*[:：]\s*(.+?)(?:\n|$)/i)
    ?? md.match(/(\d+[-–]\d+)\s*(?:students?|members?|people)/i);
  if (teamMatch) {
    result.teamSize = teamMatch[1].trim();
  }

  // Milestones
  const milestoneSection = md.match(/#{1,4}\s*(?:milestones?|timeline|schedule|phases?)\s*\n([\s\S]*?)(?=\n#{1,4}\s|\n\n\n|$)/i);
  if (milestoneSection) {
    const items = milestoneSection[1]
      .split("\n")
      .filter(line => /^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line))
      .map(line => line.replace(/^\s*[-*+\d.]+\s+/, "").trim())
      .filter(line => line.length > 5)
      .slice(0, 8);
    result.milestones = items;
  }

  // Deliverables
  const delivSection = md.match(/#{1,4}\s*(?:deliverables?|submissions?|hand[- ]?ins?)\s*\n([\s\S]*?)(?=\n#{1,4}\s|\n\n\n|$)/i);
  if (delivSection) {
    const items = delivSection[1]
      .split("\n")
      .filter(line => /^\s*[-*+]\s+/.test(line) || /^\s*\d+\.\s+/.test(line))
      .map(line => line.replace(/^\s*[-*+\d.]+\s+/, "").trim())
      .filter(line => line.length > 5)
      .slice(0, 8);
    result.deliverables = items;
  }

  // Technologies
  const techKeywords = /\b(python|java|go|golang|rust|c\+\+|javascript|typescript|react|docker|kubernetes|pytorch|tensorflow|git)\b/gi;
  const techMatches = new Set<string>();
  let match;
  while ((match = techKeywords.exec(md)) !== null) {
    techMatches.add(match[1].toLowerCase());
  }
  result.technologies = Array.from(techMatches).slice(0, 8);

  return result;
}

// ── Document building ─────────────────────────────────────────────

function stripMarkdown(markdown: string): string {
  return markdown
    .replace(/```[\s\S]*?```/g, " ")
    .replace(/`[^`]+`/g, " ")
    .replace(/!\[[^\]]*\]\([^)]+\)/g, " ")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\r/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function textSnippet(value: string, maxLength: number): string {
  return value.length > maxLength ? `${value.slice(0, maxLength)}...` : value;
}

function extractTitle(markdown: string, path: string, courseCode: string): string {
  const headingMatch = markdown.match(/^#\s+(.+)$/m);
  if (headingMatch?.[1]) {
    return textSnippet(headingMatch[1].trim(), 120);
  }
  const fileName = path.split("/").at(-1) ?? `${courseCode} course info`;
  return textSnippet(fileName.replace(/\.md$/i, ""), 120);
}

function extractHighlights(markdown: string): string[] {
  const keywords =
    /\b(deadline|due|exam|project|assignment|grading|attendance|schedule|lecture|lab|module|office hour|policy|deliverable)\b/i;

  const candidates = markdown
    .split("\n")
    .map(line => line.replace(/^#{1,6}\s*/, "").replace(/^\s*[-*+]\s+/, "").replace(/`/g, "").trim())
    .filter(line => line.length >= 12);

  const matches = candidates
    .filter(line => keywords.test(line))
    .slice(0, 4)
    .map(line => textSnippet(line, 140));

  return matches.length > 0 ? matches : candidates.slice(0, 3).map(line => textSnippet(line, 140));
}

function summarizeDocument(markdown: string): string {
  const plainText = stripMarkdown(markdown);
  if (!plainText) return "No summary extracted.";

  const sentences = plainText
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(Boolean);

  if (sentences.length === 0) return textSnippet(plainText, 320);
  return textSnippet(sentences.slice(0, 3).join(" "), 320);
}

/**
 * Build an IndexedDocument from a markdown file.
 */
export function buildIndexedDocument(
  courseCode: string,
  owner: string,
  repo: string,
  path: string,
  markdown: string,
  blobSha: string,
  indexedAt: string
): IndexedDocument {
  const sourceKey = `${owner}/${repo}/${path}`;
  const id = `github-doc-${courseCode.toLowerCase()}-${Buffer.from(sourceKey).toString("base64url").slice(0, 32)}`;
  const docType = classifyDocument(path, markdown);
  const metadata = extractMetadata(docType, markdown);
  const plainText = stripMarkdown(markdown);

  return {
    id,
    courseCode,
    owner,
    repo,
    path,
    url: `https://github.com/${owner}/${repo}/blob/HEAD/${path}`,
    docType,
    title: extractTitle(markdown, path, courseCode),
    summary: summarizeDocument(markdown),
    highlights: extractHighlights(markdown),
    snippet: textSnippet(plainText, 900),
    metadata,
    blobSha,
    indexedAt
  };
}
