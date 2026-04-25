/**
 * Jira write-back helpers — used by manager-only server functions.
 * Updates summary, description (ADF), labels for an issue.
 */

const CLOUD_ID = "1f9d6e41-cc9a-435f-8028-e85a57e97752";
const BASE_URL = `https://api.atlassian.com/ex/jira/${CLOUD_ID}/rest/api/3`;

function authHeader() {
  const email = process.env.ATLASSIAN_EMAIL;
  const token = process.env.ATLASSIAN_API_TOKEN;
  if (!email || !token) {
    throw new Error("ATLASSIAN_EMAIL or ATLASSIAN_API_TOKEN not configured");
  }
  return `Basic ${Buffer.from(`${email}:${token}`).toString("base64")}`;
}

/** Convert plain text (with \n paragraphs) to ADF doc */
function textToAdf(text: string) {
  const paragraphs = text.split(/\n{2,}/).map((p) => ({
    type: "paragraph",
    content: p
      .split("\n")
      .flatMap((line, idx, arr) => {
        const nodes: Array<{ type: string; text?: string }> = [{ type: "text", text: line }];
        if (idx < arr.length - 1) nodes.push({ type: "hardBreak" });
        return nodes;
      }),
  }));
  return {
    version: 1,
    type: "doc",
    content: paragraphs.length > 0 ? paragraphs : [{ type: "paragraph", content: [] }],
  };
}

export async function updateJiraIssue(opts: {
  key: string;
  summary?: string;
  description?: string;
  labels?: string[];
  acceptanceCriteria?: string[];
}) {
  const fields: Record<string, unknown> = {};
  if (opts.summary) fields.summary = opts.summary;

  if (opts.description) {
    let body = opts.description;
    if (opts.acceptanceCriteria && opts.acceptanceCriteria.length > 0) {
      body += `\n\nAcceptance Criteria:\n${opts.acceptanceCriteria.map((c) => `• ${c}`).join("\n")}`;
    }
    body += `\n\n— Updated by AgileFlow AI`;
    fields.description = textToAdf(body);
  }

  if (opts.labels && opts.labels.length > 0) {
    // Jira labels can't have spaces — sanitize
    fields.labels = opts.labels.map((l) => l.trim().replace(/\s+/g, "-"));
  }

  const res = await fetch(`${BASE_URL}/issue/${opts.key}`, {
    method: "PUT",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error("Jira update error", res.status, text);
    throw new Error(`Jira update failed (${res.status}): ${text.slice(0, 200)}`);
  }

  return { ok: true };
}

const PROJECT_KEY = "CMV";

/**
 * Create a new Jira issue (used by the preventive scheduler).
 * Issue type defaults to "Preventive". Returns the created issue key.
 */
export async function createJiraIssue(opts: {
  summary: string;
  description?: string;
  machineId?: string;
  assigneeAccountId?: string | null;
  issueType?: string; // default "Preventive"
  labels?: string[];
}): Promise<{ key: string }> {
  const fields: Record<string, unknown> = {
    project: { key: PROJECT_KEY },
    summary: opts.summary,
    issuetype: { name: opts.issueType ?? "Preventive" },
  };

  const descParts: string[] = [];
  if (opts.machineId) descParts.push(`Machine: ${opts.machineId}`);
  if (opts.description) descParts.push(opts.description);
  descParts.push(`\n— Auto-created by AgileFlow Preventive Scheduler`);
  fields.description = textToAdf(descParts.join("\n\n"));

  if (opts.assigneeAccountId) {
    fields.assignee = { accountId: opts.assigneeAccountId };
  }

  const labels = ["preventive-systematic", ...(opts.labels ?? [])];
  if (opts.machineId) labels.push(opts.machineId);
  fields.labels = labels.map((l) => l.trim().replace(/\s+/g, "-"));

  const res = await fetch(`${BASE_URL}/issue`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ fields }),
  });
  if (!res.ok) {
    const text = await res.text();
    console.error("Jira create error", res.status, text);
    throw new Error(`Jira create failed (${res.status}): ${text.slice(0, 200)}`);
  }
  const data = (await res.json()) as { key: string };
  return { key: data.key };
}

/**
 * Approve AI/ML suggestions for a ticket: write priority, type, assignee, SLA target,
 * then transition the issue to "Scheduled".
 */
export async function approveJiraSuggestions(opts: {
  key: string;
  priorityName?: string | null;
  typeName?: string | null; // "Corrective" | "Preventive"
  assigneeAccountId?: string | null;
  slaTargetMinutes?: number | null;
}) {
  const fields: Record<string, unknown> = {};

  if (opts.priorityName) {
    fields.priority = { name: opts.priorityName };
  }
  if (opts.typeName) {
    fields.issuetype = { name: opts.typeName };
  }
  if (opts.assigneeAccountId) {
    fields.assignee = { accountId: opts.assigneeAccountId };
  }
  if (opts.slaTargetMinutes != null) {
    // Mirror to both SLA target fields used in the project
    fields.customfield_10376 = opts.slaTargetMinutes;
    fields.customfield_10453 = opts.slaTargetMinutes;
  }

  if (Object.keys(fields).length > 0) {
    const res = await fetch(`${BASE_URL}/issue/${opts.key}`, {
      method: "PUT",
      headers: {
        Authorization: authHeader(),
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ fields }),
    });
    if (!res.ok) {
      const text = await res.text();
      console.error("Jira approve fields error", res.status, text);
      throw new Error(`Jira update failed (${res.status}): ${text.slice(0, 200)}`);
    }
  }

  // Find a transition that lands on "Scheduled"
  const txRes = await fetch(`${BASE_URL}/issue/${opts.key}/transitions`, {
    headers: { Authorization: authHeader(), Accept: "application/json" },
  });
  if (!txRes.ok) {
    throw new Error(`Failed to read transitions (${txRes.status})`);
  }
  const txData = (await txRes.json()) as {
    transitions?: Array<{ id: string; name: string; to?: { name?: string } }>;
  };
  const target = (txData.transitions ?? []).find(
    (t) => (t.to?.name ?? "").toLowerCase() === "scheduled",
  );
  if (!target) {
    throw new Error('No transition to "Scheduled" available from current status');
  }

  const doTx = await fetch(`${BASE_URL}/issue/${opts.key}/transitions`, {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ transition: { id: target.id } }),
  });
  if (!doTx.ok) {
    const text = await doTx.text();
    throw new Error(`Transition failed (${doTx.status}): ${text.slice(0, 200)}`);
  }

  return { ok: true };
}
