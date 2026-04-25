/**
 * Jira API client for the CMV project.
 * Server-only — uses Atlassian REST API v3 with Basic Auth (email + API token).
 */

const CLOUD_ID = "1f9d6e41-cc9a-435f-8028-e85a57e97752";
const BASE_URL = `https://api.atlassian.com/ex/jira/${CLOUD_ID}/rest/api/3`;

function authHeader() {
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;
  if (!email || !token) {
    throw new Error("ATLASSIAN_EMAIL or ATLASSIAN_API_TOKEN not configured");
  }
  const basic = Buffer.from(`${email}:${token}`).toString("base64");
  return `Basic ${basic}`;
}

export type JiraIssue = {
  id: string;
  key: string;
  fields: {
    summary: string;
    description: string | null;
    status: { name: string; statusCategory: { key: string; colorName: string } };
    issuetype: { name: string; iconUrl: string };
    priority: { name: string; id: string } | null;
    assignee: {
      accountId: string;
      displayName: string;
      avatarUrls: { "32x32": string };
    } | null;
    reporter?: {
      accountId: string;
      displayName: string;
    } | null;
    created: string;
    updated: string;
    labels: string[];
    customfield_10371?: string | null; // ML_Priority CM3
    customfield_10372?: string | null; // ML_Type_Ticket CM3
    customfield_10383?: string | null; // (legacy ML assignee)
    customfield_10376?: number | null; // SLA_Target_Min CM3
    customfield_10452?: string | null; // ML_Technician_Assigned_CM3
    customfield_10453?: number | null; // ML_SLA_Target_Min_CM3
    customfield_10454?: number | null; // Reopened_CM3 — count of times the ticket was reopened
    customfield_10377?: string | null; // Start_Time CM3 (datetime ISO)
    customfield_10381?: string | null; // ML Start-time CM3 (datetime ISO)
    customfield_10382?: string | null; // ML DUE DATE CM3 (date)
    customfield_10384?: string | null; // machine_id CM3
    duedate?: string | null;            // standard Jira due date
  };
};

const DEFAULT_SEARCH_FIELDS = [
  "summary",
  "description",
  "status",
  "issuetype",
  "priority",
  "assignee",
  "created",
  "updated",
  "labels",
] as const;

export async function searchIssues(
  jql: string,
  maxResults = 100,
  fields: readonly string[] = DEFAULT_SEARCH_FIELDS,
): Promise<JiraIssue[]> {
  const url = `${BASE_URL}/search/jql`;
  const body = {
    jql,
    maxResults,
    fields,
  };

  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Jira search error", res.status, text);
    throw new Error(`Jira search failed (${res.status})`);
  }

  const data = (await res.json()) as { issues?: JiraIssue[] };

  // Convert ADF descriptions to plain text strings if needed
  const issues = (data.issues ?? []).map((issue) => {
    const desc = issue.fields.description;
    if (desc && typeof desc === "object") {
      // ADF format — extract text
      issue.fields.description = adfToText(desc);
    }
    return issue;
  });

  return issues;
}

function adfToText(node: unknown): string {
  if (!node || typeof node !== "object") return "";
  const n = node as { type?: string; text?: string; content?: unknown[] };
  if (n.text) return n.text;
  if (Array.isArray(n.content)) {
    return n.content.map(adfToText).join(" ").trim();
  }
  return "";
}

export function getIssueUrl(key: string) {
  return `https://bpmproject.atlassian.net/browse/${key}`;
}

export async function searchOpenIssuesWithSuggestions(): Promise<JiraIssue[]> {
  return searchIssues(
    `project = CMV AND status = Open ORDER BY updated DESC`,
    100,
    [
      ...DEFAULT_SEARCH_FIELDS,
      "duedate",
      "customfield_10371", // ML_Priority CM3
      "customfield_10372", // ML_Type_Ticket CM3
      "customfield_10383",
      "customfield_10376", // SLA_Target_Min CM3
      "customfield_10452", // ML_Technician_Assigned_CM3
      "customfield_10453", // ML_SLA_Target_Min_CM3
      "customfield_10377", // Start_Time CM3
      "customfield_10381", // ML Start-time CM3
      "customfield_10382", // ML DUE DATE CM3
      "customfield_10384", // machine_id CM3
    ],
  );
}

// ─── Changelog & Comments (used by notification poller) ──────────────────

export type ChangelogItem = {
  field: string;
  fieldtype?: string;
  fromString: string | null;
  toString: string | null;
};

export type ChangelogEntry = {
  id: string;
  author: { accountId: string; displayName: string; avatarUrls?: { "32x32"?: string } } | null;
  created: string;
  items: ChangelogItem[];
};

export type JiraComment = {
  id: string;
  author: { accountId: string; displayName: string; avatarUrls?: { "32x32"?: string } } | null;
  body: unknown; // ADF
  bodyText?: string;
  created: string;
  updated: string;
};

/** Fetch issues updated since a given ISO timestamp, including changelog + comments. */
export async function searchUpdatedIssuesWithDetails(sinceIso: string, maxResults = 50) {
  // JQL: project CMV updated since X
  const jql = `project = CMV AND updated >= "${toJqlDate(sinceIso)}" ORDER BY updated DESC`;
  const url = `${BASE_URL}/search/jql`;
  const body = {
    jql,
    maxResults,
    fields: ["summary", "status", "issuetype", "assignee", "reporter", "updated", "priority"],
    expand: "changelog",
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Jira poll search error", res.status, txt);
    throw new Error(`Jira poll failed (${res.status})`);
  }
  const data = (await res.json()) as {
    issues?: Array<{
      id: string;
      key: string;
      fields: {
        summary: string;
        status: { name: string };
        issuetype: { name: string };
        assignee: { accountId: string; displayName: string; avatarUrls?: { "32x32"?: string } } | null;
        reporter: { accountId: string; displayName: string } | null;
        updated: string;
        priority: { name: string } | null;
      };
      changelog?: { histories?: ChangelogEntry[] };
    }>;
  };
  return data.issues ?? [];
}

/** Fetch comments for a single issue created since a date. */
export async function fetchIssueComments(key: string): Promise<JiraComment[]> {
  const url = `${BASE_URL}/issue/${key}/comment?orderBy=-created&maxResults=20`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { comments?: JiraComment[] };
  const comments = data.comments ?? [];
  return comments.map((c) => ({ ...c, bodyText: adfToText(c.body) }));
}

/** Fetch full changelog + comments for ONE issue (used on notification details page). */
export async function fetchIssueDetail(key: string) {
  const url = `${BASE_URL}/issue/${key}?expand=changelog&fields=summary,status,issuetype,assignee,reporter,updated,priority,description`;
  const res = await fetch(url, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`Jira issue fetch failed (${res.status})`);
  const data = (await res.json()) as {
    id: string;
    key: string;
    fields: {
      summary: string;
      status: { name: string };
      issuetype: { name: string };
      assignee: { accountId: string; displayName: string; avatarUrls?: { "32x32"?: string } } | null;
      reporter: { accountId: string; displayName: string } | null;
      updated: string;
      priority: { name: string } | null;
      description: unknown;
    };
    changelog?: { histories?: ChangelogEntry[] };
  };
  const comments = await fetchIssueComments(key);
  return {
    id: data.id,
    key: data.key,
    summary: data.fields.summary,
    status: data.fields.status?.name ?? "",
    issuetype: data.fields.issuetype?.name ?? "",
    assignee: data.fields.assignee,
    reporter: data.fields.reporter,
    updated: data.fields.updated,
    priority: data.fields.priority?.name ?? null,
    descriptionText: adfToText(data.fields.description),
    histories: (data.changelog?.histories ?? []).sort(
      (a, b) => new Date(b.created).getTime() - new Date(a.created).getTime(),
    ),
    comments,
  };
}

function toJqlDate(iso: string) {
  // JQL format: yyyy/MM/dd HH:mm
  const d = new Date(iso);
  const pad = (n: number) => n.toString().padStart(2, "0");
  return `${d.getUTCFullYear()}/${pad(d.getUTCMonth() + 1)}/${pad(d.getUTCDate())} ${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}`;
}

/** Fetch CMV issues with changelog for performance analytics. */
export async function searchIssuesWithChangelog(maxResults = 200): Promise<
  Array<{
    id: string;
    key: string;
    fields: JiraIssue["fields"] & { resolutiondate?: string | null };
    changelog?: { histories?: ChangelogEntry[] };
  }>
> {
  const url = `${BASE_URL}/search/jql`;
  const body = {
    jql: `project = CMV ORDER BY updated DESC`,
    maxResults,
    fields: [
      ...DEFAULT_SEARCH_FIELDS,
      "customfield_10453",
      "customfield_10376",
      "customfield_10454",
      "resolutiondate",
    ],
    expand: "changelog",
  };
  const res = await fetch(url, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const txt = await res.text();
    console.error("Jira changelog search error", res.status, txt);
    throw new Error(`Jira search failed (${res.status})`);
  }
  const data = (await res.json()) as {
    issues?: Array<{
      id: string;
      key: string;
      fields: JiraIssue["fields"] & { resolutiondate?: string | null };
      changelog?: { histories?: ChangelogEntry[] };
    }>;
  };
  return data.issues ?? [];
}
