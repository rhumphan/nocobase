import { describe, expect, it } from 'vitest';
import { LifecycleError } from '@nocobase/lifecycle';
import { createLifecycleTestKit } from '@nocobase/lifecycle/testing';

import {
  leaveDays,
  leaveRequestLifecycle,
} from '../../server/lifecycles/leave-requests.js';

const request = {
  requesterId: 'an',
  leaveType: 'annual',
  startDate: '2026-11-02',
  endDate: '2026-11-04',
  days: 3,
  reason: 'Family trip',
};

async function refusal(promise: Promise<unknown>): Promise<LifecycleError> {
  const error = await promise.then(
    () => undefined,
    (caught: unknown) => caught,
  );
  expect(error).toBeInstanceOf(LifecycleError);
  return error as LifecycleError;
}

describe('leave request lifecycle', () => {
  it('counts calendar days inclusively', () => {
    expect(leaveDays('2026-11-02', '2026-11-02')).toBe(1);
    expect(leaveDays('2026-11-02', '2026-11-04')).toBe(3);
    expect(leaveDays('2026-11-04', '2026-11-02')).toBe(-1);
    expect(leaveDays('2026-02-30', 'nope')).toBeUndefined();
  });

  it('starts pending and is approved by someone else', async () => {
    const kit = createLifecycleTestKit(leaveRequestLifecycle);
    const leave = await kit.start(request, { actor: 'an' });
    expect(kit.get(leave).status).toBe('pending');

    await kit.fire(
      leave,
      'approve',
      { decisionNote: 'Enjoy' },
      { actor: 'binh' },
    );
    const approved = kit.get(leave);
    expect(approved.status).toBe('approved');
    expect(approved.decidedById).toBe('binh');
    expect(approved.decisionNote).toBe('Enjoy');
    expect(typeof approved.decidedAt).toBe('string');
    expect(await kit.history(leave)).toEqual(['$create', 'approve']);
  });

  it('refuses a request made for somebody else', async () => {
    const kit = createLifecycleTestKit(leaveRequestLifecycle);
    const error = await refusal(kit.start(request, { actor: 'binh' }));
    expect(error.code).toBe('GUARD_REJECTED');
    expect(error.blockers?.[0]?.code).toBe('requestForYourself');
  });

  it('refuses inconsistent dates and day counts', async () => {
    const kit = createLifecycleTestKit(leaveRequestLifecycle);
    const backwards = await refusal(
      kit.start(
        { ...request, endDate: '2026-11-01', days: 0 },
        { actor: 'an' },
      ),
    );
    expect(backwards.code).toBe('INVALID_INPUT');
    expect(backwards.problems?.[0]?.field).toBe('endDate');

    const miscounted = await refusal(
      kit.start({ ...request, days: 5 }, { actor: 'an' }),
    );
    expect(miscounted.problems?.[0]?.field).toBe('days');

    const unknownType = await refusal(
      kit.start({ ...request, leaveType: 'sabbatical' }, { actor: 'an' }),
    );
    expect(unknownType.problems?.[0]?.field).toBe('leaveType');
  });

  it('never lets the requester decide on their own request', async () => {
    const kit = createLifecycleTestKit(leaveRequestLifecycle);
    const leave = await kit.start(request, { actor: 'an' });
    const check = await kit.can(leave, 'approve', 'an');
    expect(check.allowed).toBe(false);
    expect(check.blockers[0]?.code).toBe('ownRequest');
    const error = await refusal(
      kit.fire(leave, 'approve', {}, { actor: 'an' }),
    );
    expect(error.code).toBe('GUARD_REJECTED');
  });

  it('requires a reason to reject', async () => {
    const kit = createLifecycleTestKit(leaveRequestLifecycle);
    const leave = await kit.start(request, { actor: 'an' });
    const error = await refusal(
      kit.fire(leave, 'reject', { decisionNote: '  ' }, { actor: 'binh' }),
    );
    expect(error.code).toBe('INVALID_INPUT');
    expect(error.problems?.[0]?.field).toBe('decisionNote');

    await kit.fire(
      leave,
      'reject',
      { decisionNote: 'Release week' },
      { actor: 'binh' },
    );
    expect(kit.get(leave).status).toBe('rejected');
  });

  it('lets only the requester cancel, and only while pending', async () => {
    const kit = createLifecycleTestKit(leaveRequestLifecycle);
    const leave = await kit.start(request, { actor: 'an' });
    const stranger = await refusal(
      kit.fire(leave, 'cancel', {}, { actor: 'binh' }),
    );
    expect(stranger.blockers?.[0]?.code).toBe('requesterOnly');

    await kit.fire(leave, 'cancel', {}, { actor: 'an' });
    expect(kit.get(leave).status).toBe('cancelled');
    const decided = await refusal(
      kit.fire(leave, 'approve', {}, { actor: 'binh' }),
    );
    expect(decided.code).toBe('INVALID_STATE');
  });
});
