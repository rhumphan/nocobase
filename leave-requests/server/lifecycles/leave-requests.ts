import {
  defineLifecycle,
  type InputProblem,
  type Lifecycle,
  type LifecycleRecord,
  type TransitionContext,
} from '@nocobase/lifecycle';

export const LEAVE_REQUESTS_LIFECYCLE = 'leaveRequests';

export const leaveTypes = ['annual', 'sick', 'unpaid'] as const;
export type LeaveType = (typeof leaveTypes)[number];

export type LeaveRequestState =
  'pending' | 'approved' | 'rejected' | 'cancelled';

/** The longest single request, in calendar days. Longer absences are split into several requests. */
export const MAX_LEAVE_DAYS = 60;

export interface LeaveRequest extends LifecycleRecord {
  readonly status: LeaveRequestState;
  readonly requesterId: string;
  readonly leaveType: LeaveType;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
  readonly reason: string;
  readonly decidedById: string | null;
  readonly decidedAt: string | null;
  readonly decisionNote: string | null;
}

export interface LeaveRequestTypes {
  record: LeaveRequest;
  state: LeaveRequestState;
  parameters: Record<string, never>;
  services: Record<string, never>;
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/;

/** Inclusive calendar days between two ISO dates, or `undefined` when either is not a real date. */
export function leaveDays(
  startDate: string,
  endDate: string,
): number | undefined {
  if (!ISO_DATE.test(startDate) || !ISO_DATE.test(endDate)) return undefined;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;
  return Math.round((end - start) / 86_400_000) + 1;
}

function validateCreation(
  values: Readonly<Record<string, unknown>>,
): readonly InputProblem[] {
  const problems: InputProblem[] = [];
  if (!leaveTypes.includes(values.leaveType as LeaveType))
    problems.push({ field: 'leaveType', message: 'Choose a leave type.' });
  const startDate =
    typeof values.startDate === 'string' ? values.startDate : '';
  const endDate = typeof values.endDate === 'string' ? values.endDate : '';
  const days = leaveDays(startDate, endDate);
  if (days === undefined) {
    problems.push({ field: 'startDate', message: 'Give valid dates.' });
  } else if (days < 1) {
    problems.push({
      field: 'endDate',
      message: 'The end date is before the start date.',
    });
  } else if (days > MAX_LEAVE_DAYS) {
    problems.push({
      field: 'endDate',
      message: `A request covers at most ${MAX_LEAVE_DAYS} days.`,
    });
  } else if (values.days !== days) {
    problems.push({
      field: 'days',
      message: 'The day count does not match the dates.',
    });
  }
  return problems;
}

const requesterOnly = ({
  record,
  actor,
}: TransitionContext<LeaveRequestTypes>) =>
  actor.id === record.requesterId || {
    code: 'requesterOnly',
    message: 'Only the person who requested the leave can cancel it.',
  };

const notOwnRequest = ({
  record,
  actor,
}: TransitionContext<LeaveRequestTypes>) =>
  actor.id !== record.requesterId || {
    code: 'ownRequest',
    message: 'Nobody decides on their own leave request.',
  };

const touched = ({ now }: TransitionContext<LeaveRequestTypes>) => ({
  updatedAt: now.toISOString(),
});

const decision = (context: TransitionContext<LeaveRequestTypes>) => ({
  ...touched(context),
  decidedById: context.actor.id,
  decidedAt: context.now.toISOString(),
});

/**
 * A leave request waits for one decision. Approving or rejecting is a single-person decision recorded on the request;
 * multi-step approval, countersigning or reassignment belongs to the commercial approval plugin, not this lifecycle.
 */
export const leaveRequestLifecycle: Lifecycle<LeaveRequestTypes> =
  defineLifecycle<LeaveRequestTypes>({
    name: LEAVE_REQUESTS_LIFECYCLE, // also the collection name; stored in the log: never rename
    initial: 'pending',
    states: [
      'pending',
      { name: 'approved', final: true },
      { name: 'rejected', final: true },
      { name: 'cancelled', final: true },
    ],
    create: {
      validate: validateCreation,
      guard: ({ values, actor }) =>
        actor.id === values.requesterId || {
          code: 'requestForYourself',
          message: 'Request leave for yourself only.',
        },
    },
    transitions: {
      approve: {
        title: 'Approve',
        from: 'pending',
        to: 'approved',
        guard: notOwnRequest,
        accept: ['decisionNote'],
        set: decision,
      },
      reject: {
        title: 'Reject',
        from: 'pending',
        to: 'rejected',
        guard: notOwnRequest,
        validate: (input) =>
          typeof input.decisionNote === 'string' && input.decisionNote.trim()
            ? []
            : [
                {
                  field: 'decisionNote',
                  message: 'Give a reason for the rejection.',
                },
              ],
        accept: ['decisionNote'],
        set: decision,
      },
      cancel: {
        title: 'Cancel',
        from: 'pending',
        to: 'cancelled',
        guard: requesterOnly,
        set: touched,
      },
    },
  });
