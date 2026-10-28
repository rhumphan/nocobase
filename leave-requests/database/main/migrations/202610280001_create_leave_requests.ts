import { defineMigration, type MigrationDefinition } from '@nocobase/db';

/**
 * Creates the leave request table and the two log tables every `@nocobase/lifecycle` lifecycle in this application
 * shares. The record keeps its own state in `status`; only the lifecycle runtime writes `status`, `statusChangedAt`
 * and `lifecycleVersion`. The log tables follow the column list documented by `@nocobase/lifecycle` 0.1.0-beta.3,
 * spelled out here so a later release cannot change what this migration did.
 */
const migration: MigrationDefinition = defineMigration({
  name: '202610280001_create_leave_requests',

  async up({ builder }) {
    await builder.createCollection('leaveRequests', (collection) => {
      collection.increments('id');
      collection.string('requesterId', { length: 64, nullable: false });
      collection.string('leaveType', { length: 32, nullable: false });
      collection.date('startDate', { nullable: false });
      collection.date('endDate', { nullable: false });
      collection.integer('days', { nullable: false });
      collection.text('reason', { nullable: false, defaultValue: '' });
      collection.string('status', { length: 32, nullable: false });
      collection.datetimeTz('statusChangedAt', { nullable: false });
      collection.integer('lifecycleVersion', {
        nullable: false,
        defaultValue: 0,
      });
      collection.string('decidedById', { length: 64, nullable: true });
      collection.datetimeTz('decidedAt', { nullable: true });
      collection.text('decisionNote', { nullable: true });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
      collection.index(['status', 'statusChangedAt'], {
        name: 'idx_leave_requests_status_changed',
      });
      collection.index(['requesterId', 'createdAt'], {
        name: 'idx_leave_requests_requester',
      });
      collection.index('createdAt', { name: 'idx_leave_requests_created' });
    });

    await builder.createCollection('lifecycleTransitions', (collection) => {
      collection.bigInt('id').notNull().autoIncrement();
      collection.string('lifecycle', { length: 128, nullable: false });
      collection.string('recordId', { length: 64, nullable: false });
      collection.string('transition', { length: 128, nullable: false });
      collection.string('from', { length: 64, nullable: true });
      collection.string('to', { length: 64, nullable: false });
      collection.string('actorId', { length: 64, nullable: false });
      collection.json('input', { nullable: true });
      collection.datetimeTz('at', { nullable: false });
      collection.integer('version', { nullable: false });
      collection.string('requestId', { length: 255, nullable: true });
      collection.string('requestKey', { length: 255, nullable: false });
      collection.primary('id', { name: 'pk_lifecycle_transitions' });
      collection.unique(['lifecycle', 'recordId', 'version'], {
        name: 'uq_lifecycle_transitions_version',
      });
      collection.unique(['lifecycle', 'recordId', 'requestKey'], {
        name: 'uq_lifecycle_transitions_request',
      });
      collection.index(['lifecycle', 'recordId', 'id'], {
        name: 'idx_lifecycle_transitions_record',
      });
    });

    await builder.createCollection('lifecycleEffectRuns', (collection) => {
      collection.bigInt('id').notNull().autoIncrement();
      collection.string('transitionId', { length: 64, nullable: false });
      collection.string('lifecycle', { length: 128, nullable: false });
      collection.string('recordId', { length: 64, nullable: false });
      collection.string('effect', { length: 128, nullable: false });
      collection.boolean('stayBound', { nullable: false });
      collection.string('status', { length: 32, nullable: false });
      collection.integer('attempts', { nullable: false, defaultValue: 0 });
      collection.integer('maxAttempts', { nullable: false, defaultValue: 1 });
      collection.json('result', { nullable: true });
      collection.text('error', { nullable: true });
      collection.datetimeTz('createdAt', { nullable: false });
      collection.datetimeTz('updatedAt', { nullable: false });
      collection.datetimeTz('claimedAt', { nullable: true });
      collection.datetimeTz('runAfter', { nullable: true });
      collection.json('continuation', { nullable: true });
      collection.datetimeTz('continuationDueAt', { nullable: true });
      collection.datetimeTz('continuationAbandonedAt', { nullable: true });
      collection.primary('id', { name: 'pk_lifecycle_effect_runs' });
      collection.index(['status', 'id'], {
        name: 'idx_lifecycle_effect_runs_status',
      });
      collection.index(['lifecycle', 'recordId', 'id'], {
        name: 'idx_lifecycle_effect_runs_record',
      });
      collection.index('continuationDueAt', {
        name: 'idx_lifecycle_effect_runs_continuation_due',
      });
      collection.index('continuationAbandonedAt', {
        name: 'idx_lifecycle_effect_runs_continuation_abandoned',
      });
    });
  },

  async down({ builder }) {
    await builder.dropCollection('lifecycleEffectRuns');
    await builder.dropCollection('lifecycleTransitions');
    await builder.dropCollection('leaveRequests');
  },
});

export default migration;
