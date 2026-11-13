#!/usr/bin/env node
/**
 * Move the Jira issues mentioned in some text (PR title, branch name, commit message)
 * to a target status. Used by .github/workflows/jira.yml:
 *
 *   node scripts/jira/transition.mjs "In Review" "SCRUM-12 Add seat holds" "feature/SCRUM-12-holds"
 *
 * Only ever moves issues forward (To Do → In Progress → In Review → Done), so a late
 * "PR opened" event can never drag a finished issue back to In Review.
 *
 * Env: JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY. If credentials are
 * missing (e.g. Dependabot or fork PRs, which get no secrets) it logs a warning and exits 0.
 */
import { appendFileSync } from 'node:fs';
import { pathToFileURL } from 'node:url';

/** Workflow order of this project's board columns (lower-case). */
export const STATUS_ORDER = ['to do', 'in progress', 'in review', 'done'];

/**
 * Unique issue keys for `projectKey` found anywhere in `texts`, in order of appearance.
 * Matches "SCRUM-12", "scrum-12" (branch names), "[SCRUM-12]"; ignores "XSCRUM-12".
 * @param {string[]} texts
 * @param {string} projectKey
 * @returns {string[]}
 */
export function extractIssueKeys(texts, projectKey) {
  const escaped = projectKey.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`(?<![A-Za-z0-9])${escaped}-(\\d+)(?!\\d)`, 'gi');
  const keys = new Set();
  for (const text of texts) {
    for (const match of (text ?? '').matchAll(pattern)) {
      keys.add(`${projectKey.toUpperCase()}-${Number(match[1])}`);
    }
  }
  return [...keys];
}

/**
 * True if moving from `current` to `target` goes forward on the board. Unknown statuses
 * are allowed (we can't rank them), but a move to the same status is not.
 * @param {string} current
 * @param {string} target
 */
export function isForwardMove(current, target) {
  const from = STATUS_ORDER.indexOf(current.toLowerCase());
  const to = STATUS_ORDER.indexOf(target.toLowerCase());
  if (current.toLowerCase() === target.toLowerCase()) return false;
  if (from === -1 || to === -1) return true;
  return to > from;
}

/**
 * @param {{ baseUrl: string, email: string, token: string }} config
 * @returns {(method: string, path: string, body?: unknown) => Promise<any>}
 */
export function createJiraClient({ baseUrl, email, token }) {
  const auth = `Basic ${Buffer.from(`${email}:${token}`).toString('base64')}`;
  const base = baseUrl.replace(/\/$/, '');
  return async (method, path, body) => {
    const res = await fetch(`${base}${path}`, {
      method,
      headers: {
        Authorization: auth,
        Accept: 'application/json',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) {
      const err = new Error(`${method} ${path} → ${res.status} ${text.slice(0, 300)}`);
      Object.assign(err, { status: res.status });
      throw err;
    }
    return text ? JSON.parse(text) : null;
  };
}

/**
 * Transition one issue to `target` if that's a forward move. Returns what happened.
 * @param {(method: string, path: string, body?: unknown) => Promise<any>} jira
 * @param {string} key
 * @param {string} target
 * @returns {Promise<{ key: string, result: 'moved' | 'skipped' | 'missing' | 'no-transition', from?: string, detail?: string }>}
 */
export async function transitionIssue(jira, key, target) {
  let issue;
  try {
    issue = await jira('GET', `/rest/api/3/issue/${key}?fields=status`);
  } catch (err) {
    if (/** @type {{status?: number}} */ (err).status === 404) return { key, result: 'missing' };
    throw err;
  }
  const from = issue.fields.status.name;
  if (!isForwardMove(from, target)) return { key, result: 'skipped', from };

  const { transitions } = await jira('GET', `/rest/api/3/issue/${key}/transitions`);
  const transition = transitions.find((t) => t.to.name.toLowerCase() === target.toLowerCase());
  if (!transition) {
    const options = transitions.map((t) => t.to.name).join(', ');
    return { key, result: 'no-transition', from, detail: `available: ${options}` };
  }
  await jira('POST', `/rest/api/3/issue/${key}/transitions`, { transition: { id: transition.id } });
  return { key, result: 'moved', from };
}

async function main() {
  const [target, ...texts] = process.argv.slice(2);
  if (!target) {
    console.error('Usage: transition.mjs "<Target status>" <text>...');
    process.exit(2);
  }
  const { JIRA_BASE_URL, JIRA_EMAIL, JIRA_API_TOKEN, JIRA_PROJECT_KEY = 'SCRUM' } = process.env;
  if (!JIRA_BASE_URL || !JIRA_EMAIL || !JIRA_API_TOKEN) {
    console.warn('::warning::Jira credentials not available — skipping Jira sync.');
    return;
  }

  const keys = extractIssueKeys(texts, JIRA_PROJECT_KEY);
  if (keys.length === 0) {
    console.log(`No ${JIRA_PROJECT_KEY}-<n> issue keys found — nothing to move.`);
    return;
  }

  const jira = createJiraClient({
    baseUrl: JIRA_BASE_URL,
    email: JIRA_EMAIL,
    token: JIRA_API_TOKEN,
  });
  const lines = [`### Jira → ${target}`];
  for (const key of keys) {
    const r = await transitionIssue(jira, key, target);
    const link = `[${key}](${JIRA_BASE_URL.replace(/\/$/, '')}/browse/${key})`;
    const message = {
      moved: `${link}: ${r.from} → **${target}**`,
      skipped: `${link}: already ${r.from}, left as is`,
      missing: `${link}: not found`,
      'no-transition': `${link}: no transition from ${r.from} to ${target} (${r.detail})`,
    }[r.result];
    console.log(message.replace(/\[|\]\([^)]*\)|\*\*/g, ''));
    lines.push(`- ${message}`);
    if (r.result === 'missing' || r.result === 'no-transition') {
      console.warn(`::warning::${key}: ${r.result}`);
    }
  }
  if (process.env.GITHUB_STEP_SUMMARY) {
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${lines.join('\n')}\n`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((err) => {
    console.error(`::error::Jira sync failed: ${err.message}`);
    process.exit(1);
  });
}
