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
    created: string;
    updated: string;
    labels: string[];
  };
};

export async function searchIssues(
  jql: string,
  maxResults = 100,
): Promise<JiraIssue[]> {
  const url = `${BASE_URL}/search/jql`;
  const body = {
    jql,
    maxResults,
    fields: [
      "summary",
      "description",
      "status",
      "issuetype",
      "priority",
      "assignee",
      "created",
      "updated",
      "labels",
    ],
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
