import { encodeAuthorizationTitle } from '@nocobase/authorization/core';
import { defineSeed } from '@nocobase/db';
import { APP_NS } from '@nocobase/i18n';

/**
 * The two leave jobs a fresh installation starts with, as stored permission set rows. Like a migration, the seed
 * spells its data out rather than importing `server/leave-requests/permissions.ts`: it records what a fresh
 * installation received at this point, and the seed loader imports it without the application's TypeScript paths.
 *
 * They are ordinary permission sets: administrators edit them and assign them to people under System settings →
 * Users and Permission management. Nobody is assigned here, and an existing set with the same key is left exactly as
 * an administrator saved it.
 */
const page = {
  resource: { type: 'page', id: 'leaveRequests' },
  actions: [{ action: 'access' }],
};
const scoped = (action: string, scope: string) => ({
  action,
  policy: { type: 'composite', scopes: { leaveRequests: scope } },
});

const permissionSets = [
  {
    key: 'leave-employee',
    title: { key: 'leaveRequests.roles.employee', ns: APP_NS },
    grants: [
      page,
      {
        resource: { type: 'composite', id: 'leaveRequests' },
        actions: [
          scoped('view', 'leaveRequests.mine'),
          scoped('create', 'allRecords'),
          scoped('cancel', 'leaveRequests.mine'),
        ],
      },
    ],
  },
  {
    key: 'leave-approver',
    title: { key: 'leaveRequests.roles.approver', ns: APP_NS },
    grants: [
      page,
      {
        resource: { type: 'composite', id: 'leaveRequests' },
        actions: [scoped('view', 'allRecords'), scoped('decide', 'allRecords')],
      },
    ],
  },
];

export default defineSeed({
  name: '202610280002_leave_permission_sets',
  transaction: true,
  async run({ query }) {
    for (const set of permissionSets) {
      const existing = await query
        .selectFrom('authorizationPermissionSets')
        .select('id')
        .where('key', '=', set.key)
        .executeTakeFirst();
      if (existing) continue;
      const now = new Date();
      await query
        .insertInto('authorizationPermissionSets')
        .values({
          id: set.key,
          key: set.key,
          title: encodeAuthorizationTitle(set.title),
          grants: JSON.stringify(set.grants),
          createdAt: now,
          updatedAt: now,
        })
        .execute();
    }
  },
});
