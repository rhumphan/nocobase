import { z } from 'zod';

import {
  leaveTypes,
  MAX_LEAVE_DAYS,
  type LeaveRequestState,
} from '../lifecycles/leave-requests.js';
import type { LeaveRequestView } from '../leave-requests/service.js';

export const leaveRequestStates = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
] as const satisfies readonly LeaveRequestState[];

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Expected a date as YYYY-MM-DD.');

export const LeaveRequestParams = z.object({
  // The column is an auto-increment integer; the API exchanges it as a string.
  leaveRequestId: z
    .string()
    .regex(/^[1-9]\d{0,15}$/, 'Expected a leave request id.'),
});

export const ListLeaveRequestsQuery = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(20),
  status: z.enum(leaveRequestStates).optional(),
});
export type ListLeaveRequestsQuery = z.infer<typeof ListLeaveRequestsQuery>;

export const CreateLeaveRequestInput = z.strictObject({
  leaveType: z.enum(leaveTypes),
  startDate: isoDate,
  endDate: isoDate,
  reason: z.string().trim().max(2000).default(''),
});
export type CreateLeaveRequestInput = z.infer<typeof CreateLeaveRequestInput>;

export const FireLeaveRequestInput = z.strictObject({
  transition: z.string().min(1).max(64),
  input: z
    .strictObject({
      decisionNote: z.string().trim().max(2000).optional(),
    })
    .default({}),
  requestId: z.string().min(1).max(128),
  expectVersion: z.number().int().nonnegative().nullable().optional(),
});

export const LeaveRequest: z.ZodType<LeaveRequestView> = z
  .object({
    id: z.string(),
    requesterId: z.string(),
    requesterName: z.string().nullable(),
    leaveType: z.enum(leaveTypes),
    startDate: z
      .string()
      .meta({ description: 'First day of leave, YYYY-MM-DD.' }),
    endDate: z.string().meta({ description: 'Last day of leave, YYYY-MM-DD.' }),
    days: z
      .number()
      .int()
      .min(1)
      .max(MAX_LEAVE_DAYS)
      .meta({ description: 'Calendar days, both ends included.' }),
    reason: z.string(),
    status: z.enum(leaveRequestStates),
    statusChangedAt: z.string(),
    lifecycleVersion: z.number().int(),
    decidedById: z.string().nullable(),
    decidedByName: z.string().nullable(),
    decidedAt: z.string().nullable(),
    decisionNote: z.string().nullable(),
    createdAt: z.string(),
    updatedAt: z.string(),
  })
  .meta({ ref: 'LeaveRequest' });

/** What the lifecycle runtime answers for one record: the record, its state, available transitions and history. */
export const LeaveRequestLifecycleView = z
  .looseObject({
    record: z.looseObject({}),
    state: z.string(),
    version: z.number().int().nullable(),
    available: z.array(z.looseObject({})),
    history: z.looseObject({}),
  })
  .meta({ ref: 'LeaveRequestLifecycleView' });

/** The lifecycle definition as a diagram reads it. */
export const LeaveRequestLifecycleDescription = z
  .looseObject({})
  .meta({ ref: 'LeaveRequestLifecycleDescription' });
