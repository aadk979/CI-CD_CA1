#!/usr/bin/env node
/**
 * Seed a Jira Cloud Scrum project with epics, stories/tasks and sprints from backlog.json.
 *
 *   npm run jira:seed -- --dry-run     # print the plan, no API calls
 *   npm run jira:seed                  # create everything
 *
 * Credentials come from .env.jira (git-ignored) or the environment:
 *   JIRA_BASE_URL=https://your-site.atlassian.net
 *   JIRA_EMAIL=you@example.com
 *   JIRA_API_TOKEN=...   (https://id.atlassian.com/manage-profile/security/api-tokens)
 *   JIRA_PROJECT_KEY=SCRUM
 *
 * Safe to re-run: it refuses to create duplicates if issues with the seed label exist
 * (pass --force to override), and reuses sprints that already exist by name.
 */
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const args = new Set(process.argv.slice(2));
const DRY_RUN = args.has('--dry-run');
const FORCE = args.has('--force');

const here = dirname(fileURLToPath(import.meta.url));
const backlog = JSON.parse(readFileSync(join(here, 'backlog.json'), 'utf8'));
const PRIORITY = { must: 'High', should: 'Medium', could: 'Low' };

// ── Plan summary ────────────────────────────────────────────────────────────
function printPlan() {
  const totals = {};
  for (const epic of backlog.epics) {
    console.log(`\nEPIC  ${epic.summary}`);
    for (const issue of epic.issues) {
      const where = issue.sprint ?? 'backlog';
      totals[where] = (totals[where] ?? 0) + issue.points;
      console.log(
        `  ${issue.type.padEnd(5)} [${where.padEnd(7)}] ${String(issue.points).padStart(2)}pt  ${issue.summary}`,
      );
    }
  }
  console.log('\nStory points per sprint:', totals);
}

if (DRY_RUN) {
  printPlan();
  console.log('\n(dry run — nothing was sent to Jira)');
  process.exit(0);
}

// ── Config ──────────────────────────────────────────────────────────────────
const envFile = join(process.cwd(), '.env.jira');
if (existsSync(envFile)) process.loadEnvFile(envFile);

const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY } = process.env;
const missing = Object.entries({ JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY })
  .filter(([, v]) => !v)
  .map(([k]) => k);
if (missing.length) {
  console.error(`Missing ${missing.join(', ')} — add them to .env.jira (see script header).`);
  process.exit(1);
}

const base = JIRA_BASE_URL.replace(/\/$/, '');
const auth = `Basic ${Buffer.from(`${JIRA_EMAIL}:${JIRA_API_TOKEN}`).toString('base64')}`;

// ── HTTP helper with 429 back-off ───────────────────────────────────────────
async function jira(method, path, body) {
  for (let attempt = 0; attempt < 5; attempt++) {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 2) * 1000;
      await new Promise((r) => setTimeout(r, wait));
      continue;
    }
    const text = await res.text();
    const data = text ? JSON.parse(text) : null;
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status}: ${text.slice(0, 500)}`);
      err.status = res.status;
      err.data = data;
      throw err;
    }
    return data;
  }
  throw new Error(`${method} ${path} → rate limited too many times`);
}

/** Atlassian Document Format (required for descriptions in REST API v3). */
function adf({ description, acceptance = [] }) {
  const content = [];
  if (description)
    content.push({ type: 'paragraph', content: [{ type: 'text', text: description }] });
  if (acceptance.length) {
    content.push({
      type: 'heading',
      attrs: { level: 3 },
      content: [{ type: 'text', text: 'Acceptance criteria' }],
    });
    content.push({
      type: 'bulletList',
      content: acceptance.map((text) => ({
        type: 'listItem',
        content: [{ type: 'paragraph', content: [{ type: 'text', text }] }],
      })),
    });
  }
  return { type: 'doc', version: 1, content };
}

// ── Discover project metadata ───────────────────────────────────────────────
const project = await jira('GET', `/rest/api/3/project/${JIRA_PROJECT_KEY}`);
console.log(`Project: ${project.name} (${project.key}, ${project.style ?? 'classic'})`);

const issueTypes = await jira('GET', `/rest/api/3/issue/createmeta/${project.key}/issuetypes`);
const typeList = issueTypes.issueTypes ?? issueTypes.values ?? [];
const typeId = (name) => {
  const t = typeList.find((x) => x.name.toLowerCase() === name.toLowerCase());
  if (!t)
    throw new Error(
      `Issue type "${name}" not found. Available: ${typeList.map((x) => x.name).join(', ')}`,
    );
  return t.id;
};

const fields = await jira('GET', '/rest/api/3/field');
const pointsField = (
  fields.find((f) => f.name === 'Story point estimate') ??
  fields.find((f) => f.name === 'Story Points')
)?.id;
console.log(`Story points field: ${pointsField ?? 'not found — points will be skipped'}`);

const boards = await jira('GET', `/rest/agile/1.0/board?projectKeyOrId=${project.key}&type=scrum`);
const board = boards.values?.[0];
if (!board)
  throw new Error('No Scrum board found for this project. Create a Scrum project/board first.');
console.log(`Board: ${board.name} (#${board.id})`);

// ── Duplicate guard ─────────────────────────────────────────────────────────
const existing = await jira('POST', '/rest/api/3/search/jql', {
  jql: `project = ${project.key} AND labels = "${backlog.label}"`,
  maxResults: 1,
  fields: ['summary'],
});
if (existing.issues?.length && !FORCE) {
  console.error(
    `Issues labelled "${backlog.label}" already exist — refusing to duplicate. Use --force to override.`,
  );
  process.exit(1);
}

// ── Create issues (dropping optional fields the project doesn't accept) ─────
async function createIssue(fieldsPayload) {
  const optional = ['priority', pointsField].filter(Boolean);
  let payload = { ...fieldsPayload };
  for (;;) {
    try {
      return await jira('POST', '/rest/api/3/issue', { fields: payload });
    } catch (err) {
      const rejected = Object.keys(err.data?.errors ?? {}).filter(
        (k) => optional.includes(k) && k in payload,
      );
      if (err.status !== 400 || rejected.length === 0) throw err;
      console.warn(`    (field(s) ${rejected.join(', ')} not on create screen — skipping)`);
      rejected.forEach((k) => delete payload[k]);
      payload = { ...payload };
    }
  }
}

const sprintIssueKeys = Object.fromEntries(backlog.sprints.map((s) => [s.id, []]));
let created = 0;

for (const epic of backlog.epics) {
  const epicRes = await createIssue({
    project: { key: project.key },
    issuetype: { id: typeId('Epic') },
    summary: epic.summary,
    description: adf({ description: epic.description }),
    labels: [backlog.label],
  });
  created++;
  console.log(`\n${epicRes.key}  EPIC  ${epic.summary}`);

  for (const issue of epic.issues) {
    const payload = {
      project: { key: project.key },
      issuetype: { id: typeId(issue.type) },
      parent: { key: epicRes.key },
      summary: issue.summary,
      description: adf(issue),
      labels: [backlog.label, issue.priority],
      priority: { name: PRIORITY[issue.priority] },
    };
    if (pointsField) payload[pointsField] = issue.points;

    const res = await createIssue(payload);
    created++;
    if (issue.sprint) sprintIssueKeys[issue.sprint].push(res.key);
    console.log(`  ${res.key}  ${issue.type.padEnd(5)} ${issue.points}pt  ${issue.summary}`);
  }
}

// ── Sprints ─────────────────────────────────────────────────────────────────
const existingSprints = await jira(
  'GET',
  `/rest/agile/1.0/board/${board.id}/sprint?state=future,active`,
);
for (const sprint of backlog.sprints) {
  let target = existingSprints.values?.find((s) => s.name === sprint.name);
  if (!target) {
    target = await jira('POST', '/rest/agile/1.0/sprint', {
      name: sprint.name,
      originBoardId: board.id,
      startDate: sprint.start,
      endDate: sprint.end,
      goal: sprint.goal,
    });
    console.log(`\nCreated sprint "${target.name}" (#${target.id})`);
  } else {
    console.log(`\nReusing sprint "${target.name}" (#${target.id})`);
  }
  const keys = sprintIssueKeys[sprint.id];
  for (let i = 0; i < keys.length; i += 50) {
    await jira('POST', `/rest/agile/1.0/sprint/${target.id}/issue`, {
      issues: keys.slice(i, i + 50),
    });
  }
  console.log(`  ${keys.length} issues added`);
}

console.log(
  `\nDone — ${created} issues created. Open the Backlog, review Sprint 1, then click "Start sprint".`,
);
