import type {
  DatabaseManager,
  FilterBuilder,
  RepositoryPolicy,
  Row,
} from '@nocobase/db';
import type {
  LifecycleActor,
  LifecycleRuntime,
  RecordView,
} from '@nocobase/lifecycle';

import {
  LEAVE_REQUESTS_LIFECYCLE,
  leaveDays,
  type LeaveRequestState,
  type LeaveType,
} from '../lifecycles/leave-requests.js';
import { LEAVE_COLLECTION } from './permissions.js';

export interface LeaveRequestView {
  id: string;
  requesterId: string;
  requesterName: string | null;
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  days: number;
  reason: string;
  status: LeaveRequestState;
  statusChangedAt: string;
  lifecycleVersion: number;
  decidedById: string | null;
  decidedByName: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface LeaveRequestList {
  data: LeaveRequestView[];
  meta: { page: number; pageSize: number; total: number };
}

export interface ListLeaveRequestsOptions {
  page: number;
  pageSize: number;
  status?: LeaveRequestState;
}

export interface CreateLeaveRequestInput {
  leaveType: LeaveType;
  startDate: string;
  endDate: string;
  reason: string;
}

/**
 * Leave request business operations. Reads go through the caller's authorization policy; every state change goes
 * through the lifecycle runtime, which alone writes `status`, `statusChangedAt` and `lifecycleVersion`.
 */
export class LeaveRequestsService {
  constructor(
    private readonly database: DatabaseManager,
    private readonly runtime: LifecycleRuntime,
  ) {}

  async list(
    policy: RepositoryPolicy,
    options: ListLeaveRequestsOptions,
  ): Promise<LeaveRequestList> {
    const { page, pageSize, status } = options;
    const repository = this.database
      .repository(LEAVE_COLLECTION)
      .withPolicy(policy);
    const filter = status
      ? { filter: (f: FilterBuilder) => f.string('status').eq(status) }
      : {};
    const [total, rows] = await Promise.all([
      repository.count(filter),
      repository.findMany({
        ...filter,
        sort: (sort) => [
          sort.field('createdAt').desc(),
          sort.field('id').desc(),
        ],
        limit: pageSize,
        offset: (page - 1) * pageSize,
      }),
    ]);
    const names = await this.userNames(rows);
    return {
      data: rows.map((row) => serializeLeaveRequest(row, names)),
      meta: { page, pageSize, total },
    };
  }

  /** The request as the caller may see it, or `undefined` when it does not exist or lies outside the policy. */
  async find(
    policy: RepositoryPolicy,
    id: string,
  ): Promise<LeaveRequestView | undefined> {
    const row = await this.database
      .repository(LEAVE_COLLECTION)
      .withPolicy(policy)
      .findOne({ filter: { id: Number(id) } });
    if (!row) return undefined;
    return serializeLeaveRequest(row, await this.userNames([row]));
  }

  async create(
    actor: LifecycleActor,
    input: CreateLeaveRequestInput,
  ): Promise<LeaveRequestView> {
    const now = new Date();
    const result = await this.runtime.create(
      LEAVE_REQUESTS_LIFECYCLE,
      {
        requesterId: actor.id,
        leaveType: input.leaveType,
        startDate: input.startDate,
        endDate: input.endDate,
        days: leaveDays(input.startDate, input.endDate) ?? 0,
        reason: input.reason,
        createdAt: now,
        updatedAt: now,
      },
      { actor },
    );
    const row = result.record as Row;
    return serializeLeaveRequest(row, await this.userNames([row]));
  }

  /** The record of a lifecycle view as the API shows it, with display names; the caller has authorized it. */
  async present<V extends RecordView>(
    view: V,
  ): Promise<V & { record: LeaveRequestView }> {
    const row = view.record as Row;
    return {
      ...view,
      record: serializeLeaveRequest(row, await this.userNames([row])),
    };
  }

  view(actor: LifecycleActor, id: string): Promise<RecordView> {
    return this.runtime.view(LEAVE_REQUESTS_LIFECYCLE, id, actor);
  }

  async fire(
    actor: LifecycleActor,
    id: string,
    request: {
      transition: string;
      input: Record<string, unknown>;
      requestId: string;
      expectVersion?: number | null;
    },
  ): Promise<RecordView & { replayed: boolean }> {
    const result = await this.runtime.fire(
      LEAVE_REQUESTS_LIFECYCLE,
      id,
      request.transition,
      {
        actor,
        manual: true,
        input: request.input as never,
        requestId: request.requestId,
        ...(request.expectVersion === undefined
          ? {}
          : { expect: { version: request.expectVersion } }),
      },
    );
    const view = await this.runtime.view(LEAVE_REQUESTS_LIFECYCLE, id, actor);
    return { ...view, replayed: result.replayed === true };
  }

  /** Display names of the requesters and deciders on these rows; a name only, read on the server's own authority. */
  private async userNames(
    rows: readonly Row[],
  ): Promise<ReadonlyMap<string, string>> {
    const ids = [
      ...new Set(
        rows.flatMap((row) =>
          [row.requesterId, row.decidedById].filter(
            (value): value is string =>
              typeof value === 'string' && value !== '',
          ),
        ),
      ),
    ];
    if (!ids.length) return new Map();
    const users = await this.database.repository('user').findMany({
      filter: (f) => f.or(ids.map((id) => f.string('id').eq(id))),
      select: (select) => select.fields('id', 'name'),
    });
    return new Map(users.map((user) => [text(user.id), text(user.name)]));
  }
}

export function serializeLeaveRequest(
  row: Row,
  names: ReadonlyMap<string, string>,
): LeaveRequestView {
  const requesterId = text(row.requesterId);
  const decidedById = row.decidedById == null ? null : text(row.decidedById);
  return {
    id: text(row.id),
    requesterId,
    requesterName: names.get(requesterId) ?? null,
    leaveType: row.leaveType as LeaveType,
    startDate: dateOnly(row.startDate),
    endDate: dateOnly(row.endDate),
    days: Number(row.days),
    reason: text(row.reason),
    status: row.status as LeaveRequestState,
    statusChangedAt: instant(row.statusChangedAt) ?? '',
    lifecycleVersion: Number(row.lifecycleVersion ?? 0),
    decidedById,
    decidedByName: decidedById ? (names.get(decidedById) ?? null) : null,
    decidedAt: instant(row.decidedAt),
    decisionNote: row.decisionNote == null ? null : text(row.decisionNote),
    createdAt: instant(row.createdAt) ?? '',
    updatedAt: instant(row.updatedAt) ?? '',
  };
}

/** A scalar column as text; anything else, such as a missing value, as an empty string. */
function text(value: unknown): string {
  return typeof value === 'string'
    ? value
    : typeof value === 'number' || typeof value === 'bigint'
      ? String(value)
      : '';
}

function dateOnly(value: unknown): string {
  if (value instanceof Date) return value.toISOString().slice(0, 10);
  return text(value).slice(0, 10);
}

/** SQLite can return an instant as a millisecond number or numeric string; other drivers as a Date or ISO string. */
function instant(value: unknown): string | null {
  if (value == null || value === '') return null;
  const date =
    value instanceof Date
      ? value
      : new Date(
          typeof value === 'number' || /^\d+(\.\d+)?$/.test(text(value))
            ? Number(value)
            : text(value),
        );
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}
