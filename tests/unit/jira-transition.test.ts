import { describe, expect, it, vi } from 'vitest';
import {
  extractIssueKeys,
  isForwardMove,
  transitionIssue,
} from '../../scripts/jira/transition.mjs';

describe('extractIssueKeys', () => {
  it('finds keys in PR titles, branch names and commit messages', () => {
    expect(
      extractIssueKeys(
        ['SCRUM-29 Seat map (#6)', 'feature/scrum-31-holds', 'Fixes [SCRUM-7] and SCRUM-29'],
        'SCRUM',
      ),
    ).toEqual(['SCRUM-29', 'SCRUM-31', 'SCRUM-7']);
  });

  it('ignores other projects, embedded prefixes and empty input', () => {
    expect(
      extractIssueKeys(['TIX-1 XSCRUM-2 SCRUM- SCRUMMY-3', '', undefined as never], 'SCRUM'),
    ).toEqual([]);
  });

  it('normalises leading zeros so SCRUM-07 and SCRUM-7 are one issue', () => {
    expect(extractIssueKeys(['SCRUM-07', 'SCRUM-7'], 'SCRUM')).toEqual(['SCRUM-7']);
  });

  it('does not treat a longer number as a match for a shorter key', () => {
    expect(extractIssueKeys(['SCRUM-123'], 'SCRUM')).toEqual(['SCRUM-123']);
  });
});

describe('isForwardMove', () => {
  it.each([
    ['To Do', 'In Review', true],
    ['In Progress', 'In Review', true],
    ['In Review', 'Done', true],
    ['Done', 'In Review', false],
    ['In Review', 'In Review', false],
    ['in review', 'In Review', false],
    ['Blocked', 'Done', true],
  ])('%s → %s is %s', (from, to, expected) => {
    expect(isForwardMove(from, to)).toBe(expected);
  });
});

describe('transitionIssue', () => {
  const transitions = {
    transitions: [
      { id: '31', to: { name: 'In Review' } },
      { id: '41', to: { name: 'Done' } },
    ],
  };

  function fakeJira(status: string | null) {
    return vi.fn(async (method: string, path: string) => {
      if (path.endsWith('?fields=status')) {
        if (status === null) throw Object.assign(new Error('404'), { status: 404 });
        return { fields: { status: { name: status } } };
      }
      if (method === 'GET') return transitions;
      return null;
    });
  }

  it('moves an issue forward using the transition that leads to the target', async () => {
    const jira = fakeJira('In Progress');
    expect(await transitionIssue(jira, 'SCRUM-1', 'In Review')).toEqual({
      key: 'SCRUM-1',
      result: 'moved',
      from: 'In Progress',
    });
    expect(jira).toHaveBeenLastCalledWith('POST', '/rest/api/3/issue/SCRUM-1/transitions', {
      transition: { id: '31' },
    });
  });

  it('never moves a finished issue backwards', async () => {
    const jira = fakeJira('Done');
    expect(await transitionIssue(jira, 'SCRUM-1', 'In Review')).toMatchObject({
      result: 'skipped',
    });
    expect(jira).toHaveBeenCalledTimes(1);
  });

  it('reports unknown issues instead of failing', async () => {
    expect(await transitionIssue(fakeJira(null), 'SCRUM-999', 'Done')).toEqual({
      key: 'SCRUM-999',
      result: 'missing',
    });
  });

  it('reports when the workflow has no route to the target', async () => {
    expect(await transitionIssue(fakeJira('To Do'), 'SCRUM-1', 'Released')).toMatchObject({
      result: 'no-transition',
      detail: 'available: In Review, Done',
    });
  });

  it('rethrows other API errors (e.g. a bad token)', async () => {
    const jira = vi.fn(async () => {
      throw Object.assign(new Error('401'), { status: 401 });
    });
    await expect(transitionIssue(jira, 'SCRUM-1', 'Done')).rejects.toThrow('401');
  });
});
