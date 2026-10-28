import path from 'node:path';
import type { MigrationSource } from '@nocobase/db';
import { describeMigration } from '@nocobase/app-testing/server';
import { expect } from 'vitest';

const sources: readonly MigrationSource[] = [
  {
    packageName: 'leave-requests-test',
    directory: path.resolve(
      import.meta.dirname,
      '../../database/main/migrations',
    ),
  },
];

describeMigration('202610280001_create_leave_requests', {
  sources,
  up: async ({ connection, expectCollection }) => {
    const leaveRequests = await expectCollection('leaveRequests').toExist();
    expect(leaveRequests.primaryKey).toEqual(['id']);
    expect(Object.keys(leaveRequests.fields)).toEqual([
      'id',
      'requesterId',
      'leaveType',
      'startDate',
      'endDate',
      'days',
      'reason',
      'status',
      'statusChangedAt',
      'lifecycleVersion',
      'decidedById',
      'decidedAt',
      'decisionNote',
      'createdAt',
      'updatedAt',
    ]);
    await expectCollection('leaveRequests').toHaveField('decidedById', {
      nullable: true,
    });
    await expectCollection('leaveRequests').toHaveField('status', {
      nullable: false,
    });

    const transitions = await expectCollection(
      'lifecycleTransitions',
    ).toExist();
    expect(transitions.primaryKey).toEqual(['id']);
    const effectRuns = await expectCollection('lifecycleEffectRuns').toExist();
    expect(effectRuns.primaryKey).toEqual(['id']);

    const now = new Date();
    const entry = {
      lifecycle: 'leaveRequests',
      recordId: '1',
      transition: '$create',
      to: 'pending',
      actorId: 'u1',
      at: now,
      version: 1,
      requestKey: 'r1',
    };
    await connection.query
      .insertInto('lifecycleTransitions')
      .values(entry)
      .execute();
    // One version per record, and one entry per request key.
    await expect(
      connection.query
        .insertInto('lifecycleTransitions')
        .values({ ...entry, requestKey: 'r2' })
        .execute(),
    ).rejects.toThrow();
    await expect(
      connection.query
        .insertInto('lifecycleTransitions')
        .values({ ...entry, version: 2 })
        .execute(),
    ).rejects.toThrow();
  },
  down: async ({ expectCollection }) => {
    await expectCollection('leaveRequests').not.toExist();
    await expectCollection('lifecycleTransitions').not.toExist();
    await expectCollection('lifecycleEffectRuns').not.toExist();
  },
});
