/**
 * Backlog analysis utilities (pure functions, no I/O).
 */
import type { JiraIssue } from "./jira";

export type BacklogHealth = {
  score: number;
  total: number;
  vagueDescriptions: number;
  shortTitles: number;
  noLabels: number;
  noAssignee: number;
  staleInProgress: number; // > 2 days in "En cours"
  duplicates: number;
  misclassified: number;
};

const VAGUE_PATTERNS = [
  /^(test|hello|hi|hey|hahah?|hhh+|ouch|oups+|ouf|bbb+|ccc+|ddd+|eee+|hh+|aa+|nn+|yarbi)/i,
  /^.{0,4}$/,
];

export function isVague(text: string | null): boolean {
  if (!text) return true;
  const t = text.trim();
  if (t.length < 8) return true;
  for (const p of VAGUE_PATTERNS) if (p.test(t)) return true;
  return false;
}

export function isShortTitle(s: string): boolean {
  return s.trim().length < 12;
}

export function machineFromText(text: string): string | null {
  const m = text.match(/M0?(\d{1,2})/i);
  if (!m) return null;
  const n = parseInt(m[1], 10);
  if (n < 1 || n > 20) return null;
  return `M${n.toString().padStart(2, "0")}`;
}

export function isMisclassified(issue: JiraIssue): boolean {
  const summary = issue.fields.summary.toLowerCase();
  const type = issue.fields.issuetype.name.toLowerCase();
  if (summary.includes("corrective") && type.includes("preventive")) return true;
  if (summary.includes("preventive") && type.includes("corrective")) return true;
  return false;
}

export function daysSince(iso: string): number {
  const then = new Date(iso).getTime();
  const now = Date.now();
  return Math.max(0, (now - then) / (1000 * 60 * 60 * 24));
}

export function findDuplicates(issues: JiraIssue[]): Array<{
  signature: string;
  issues: JiraIssue[];
}> {
  const groups = new Map<string, JiraIssue[]>();
  for (const issue of issues) {
    const sig = normalize(issue.fields.summary);
    if (!sig) continue;
    if (!groups.has(sig)) groups.set(sig, []);
    groups.get(sig)!.push(issue);
  }
  return Array.from(groups.entries())
    .filter(([, arr]) => arr.length > 1)
    .map(([signature, arr]) => ({ signature, issues: arr }));
}

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[–—\-_]/g, " ")
    .replace(/\b(corrective|preventive|test|title|rule|m\d+)\b/g, "")
    .replace(/[^a-z0-9 ]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

export function computeHealth(issues: JiraIssue[]): BacklogHealth {
  const total = issues.length || 1;
  let vagueDescriptions = 0;
  let shortTitles = 0;
  let noLabels = 0;
  let noAssignee = 0;
  let staleInProgress = 0;
  let misclassified = 0;

  for (const i of issues) {
    if (isVague(i.fields.description)) vagueDescriptions++;
    if (isShortTitle(i.fields.summary)) shortTitles++;
    if (!i.fields.labels?.length) noLabels++;
    if (!i.fields.assignee) noAssignee++;
    const cat = i.fields.status.statusCategory.key;
    if (cat === "indeterminate" && daysSince(i.fields.updated) > 2) staleInProgress++;
    if (isMisclassified(i)) misclassified++;
  }

  const dupGroups = findDuplicates(issues);
  const duplicates = dupGroups.reduce((acc, g) => acc + g.issues.length - 1, 0);

  // Score = 100 - weighted issues / total
  const penalty =
    (vagueDescriptions * 1.5 +
      shortTitles * 1.0 +
      noLabels * 0.4 +
      noAssignee * 1.2 +
      staleInProgress * 2.0 +
      duplicates * 2.5 +
      misclassified * 1.8) /
    total;
  const score = Math.max(0, Math.min(100, Math.round(100 - penalty * 18)));

  return {
    score,
    total: issues.length,
    vagueDescriptions,
    shortTitles,
    noLabels,
    noAssignee,
    staleInProgress,
    duplicates,
    misclassified,
  };
}

export function groupByMachine(issues: JiraIssue[]): Record<string, JiraIssue[]> {
  const out: Record<string, JiraIssue[]> = {};
  for (const i of issues) {
    const m = machineFromText(i.fields.summary) ?? "Unassigned";
    if (!out[m]) out[m] = [];
    out[m].push(i);
  }
  return out;
}

export function groupByAssignee(issues: JiraIssue[]): Array<{
  name: string;
  avatar: string | null;
  total: number;
  inProgress: number;
  done: number;
  todo: number;
}> {
  const map = new Map<
    string,
    { name: string; avatar: string | null; total: number; inProgress: number; done: number; todo: number }
  >();
  for (const i of issues) {
    const a = i.fields.assignee;
    const key = a?.displayName ?? "Unassigned";
    if (!map.has(key)) {
      map.set(key, {
        name: key,
        avatar: a?.avatarUrls["32x32"] ?? null,
        total: 0,
        inProgress: 0,
        done: 0,
        todo: 0,
      });
    }
    const entry = map.get(key)!;
    entry.total++;
    const cat = i.fields.status.statusCategory.key;
    if (cat === "done") entry.done++;
    else if (cat === "indeterminate") entry.inProgress++;
    else entry.todo++;
  }
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}
