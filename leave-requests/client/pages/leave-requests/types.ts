export const LEAVE_TYPES = ['annual', 'sick', 'unpaid'] as const;
export type LeaveType = (typeof LEAVE_TYPES)[number];

export const LEAVE_STATUSES = [
  'pending',
  'approved',
  'rejected',
  'cancelled',
] as const;
export type LeaveStatus = (typeof LEAVE_STATUSES)[number];

/** The longest single request the server accepts, in calendar days. */
export const MAX_LEAVE_DAYS = 60;

export interface LeaveRequest {
  readonly id: string;
  readonly requesterId: string;
  readonly requesterName: string | null;
  readonly leaveType: LeaveType;
  readonly startDate: string;
  readonly endDate: string;
  readonly days: number;
  readonly reason: string;
  readonly status: LeaveStatus;
  readonly statusChangedAt: string;
  readonly lifecycleVersion: number;
  readonly decidedById: string | null;
  readonly decidedByName: string | null;
  readonly decidedAt: string | null;
  readonly decisionNote: string | null;
  readonly createdAt: string;
  readonly updatedAt: string;
}

/** The body of `GET /api/leaveRequests`. */
export interface LeaveRequestList {
  readonly data: LeaveRequest[];
  readonly meta: {
    readonly page: number;
    readonly pageSize: number;
    readonly total: number;
  };
}

/** What the create dialog and the detail drawer read through `<Outlet context>` from the list. */
export interface LeaveRequestsOutletContext {
  /** Refreshes the list in the background. */
  readonly reload: () => void;
}

/** Inclusive calendar days between two `YYYY-MM-DD` dates, or `undefined` when either is missing. */
export function leaveDays(
  startDate: string,
  endDate: string,
): number | undefined {
  if (!startDate || !endDate) return undefined;
  const start = Date.parse(`${startDate}T00:00:00Z`);
  const end = Date.parse(`${endDate}T00:00:00Z`);
  if (Number.isNaN(start) || Number.isNaN(end)) return undefined;
  return Math.round((end - start) / 86_400_000) + 1;
}
