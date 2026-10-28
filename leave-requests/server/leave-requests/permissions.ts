import {
  defineCompositeResource,
  defineRecordAccess,
} from '@nocobase/authorization/core';
import {
  defineDatabasePermission,
  recordAccess,
} from '@nocobase/app-plugin-authorization/server';
import { APP_NS } from '@nocobase/i18n';
import { buildFilter } from '@nocobase/repository-input';

/**
 * Who does what with leave requests:
 *
 * | Job            | Action  | Records                    |
 * | -------------- | ------- | -------------------------- |
 * | Employee       | view    | Requests I made            |
 * | Employee       | create  | (a new request, for me)    |
 * | Employee       | cancel  | Requests I made            |
 * | Leave approver | view    | All requests               |
 * | Leave approver | decide  | All requests (not my own)  |
 *
 * "Not my own" is a lifecycle guard, a business rule that holds for every caller, not a permission. Approve and reject
 * are one `decide` permission because the same person makes the one decision either way.
 */

export const LEAVE_PAGE_ID = 'leaveRequests';
export const LEAVE_RESOURCE_ID = 'leaveRequests';
export const LEAVE_COLLECTION = 'leaveRequests';

const title = (key: string) => ({
  key: `leaveRequests.permissions.${key}`,
  ns: APP_NS,
});

interface LeaveRequestRow {
  id: number;
  requesterId: string;
  leaveType: string;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: string;
  statusChangedAt: string;
  lifecycleVersion: number;
  decidedById: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Requests whose requester is the signed-in user. */
export const myLeaveRequests = defineRecordAccess(
  'leaveRequests.mine',
  (access) =>
    access
      .title(title('mine'))
      .collections(LEAVE_COLLECTION)
      .resolver(({ principal }) =>
        principal.type === 'user'
          ? buildFilter((f) => f.string('requesterId').eq(principal.id))
          : false,
      ),
);

const readable = defineDatabasePermission((p) =>
  p
    .collection<LeaveRequestRow>(LEAVE_COLLECTION)
    .title(title('collection'))
    .read('*'),
);

const scopes = [myLeaveRequests.reference(), recordAccess.allRecords] as const;

export const leaveRequestsResource = defineCompositeResource(
  LEAVE_RESOURCE_ID,
  (r) =>
    r
      .title(title('resource'))
      .action('view', (a) =>
        a
          .title(title('view'))
          .grant(
            LEAVE_COLLECTION,
            readable.options(...scopes).default(myLeaveRequests.reference()),
          ),
      )
      .action('create', (a) =>
        a
          .title(title('create'))
          .grant(
            LEAVE_COLLECTION,
            readable
              .create([
                'requesterId',
                'leaveType',
                'startDate',
                'endDate',
                'days',
                'reason',
              ])
              .options(recordAccess.allRecords)
              .default(recordAccess.allRecords),
          ),
      )
      .action('cancel', (a) =>
        a.title(title('cancel')).grant(
          LEAVE_COLLECTION,
          readable
            .update([
              'status',
              'statusChangedAt',
              'lifecycleVersion',
              'updatedAt',
            ])
            .options(...scopes)
            .default(myLeaveRequests.reference()),
        ),
      )
      .action('decide', (a) =>
        a.title(title('decide')).grant(
          LEAVE_COLLECTION,
          readable
            .update([
              'status',
              'statusChangedAt',
              'lifecycleVersion',
              'decidedById',
              'decidedAt',
              'decisionNote',
              'updatedAt',
            ])
            .options(...scopes)
            .default(recordAccess.allRecords),
        ),
      ),
);

export type LeaveRequestAction = 'view' | 'create' | 'cancel' | 'decide';

/** The permission each lifecycle transition needs; a route refuses a transition this map does not name. */
export const transitionPermissions: Readonly<
  Record<string, LeaveRequestAction>
> = {
  approve: 'decide',
  reject: 'decide',
  cancel: 'cancel',
};
