// @vitest-environment node
import { expect } from 'vitest';
import { createAppTest } from '@nocobase/app-testing/server';
import {
  signIn,
  DEFAULT_ADMIN_CREDENTIALS,
} from '@nocobase/app-plugin-authentication/testing';
import {
  findApiDocumentSchemaProblems,
  findUndeclaredApiRoutes,
} from '@nocobase/app-server/router';
import { createStandaloneServer } from '../../server/standalone.js';

const test = createAppTest({
  createServer: createStandaloneServer,
  config: {
    app: { publicOrigin: 'http://localhost' },
    auth: { secret: 'test-auth-secret-at-least-32-characters' },
  },
});

const PASSWORD = 'Leave-test-123!';
const json = (body: unknown, method = 'POST') => ({
  method,
  headers: { 'content-type': 'application/json', origin: 'http://localhost' },
  body: JSON.stringify(body),
});
const request = {
  leaveType: 'annual',
  startDate: '2026-11-02',
  endDate: '2026-11-04',
  reason: 'Family trip',
};

type Session = Awaited<ReturnType<typeof signIn>>;

async function errorOf(
  response: Response,
): Promise<{ code: number; reason: string }> {
  return (
    (await response.json()) as { error: { code: number; reason: string } }
  ).error;
}

test('leave requests follow roles, record scopes and the lifecycle', async ({
  testApp,
}) => {
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const createUser = async (
    username: string,
    roles: string[],
  ): Promise<Session> => {
    const response = await admin.fetch(
      '/users',
      json({
        name: username,
        username,
        email: `${username}@example.test`,
        password: PASSWORD,
        roleScopes: { app: roles },
      }),
    );
    expect(response.status).toBe(201);
    return signIn(testApp, { username, password: PASSWORD });
  };
  // The seeded jobs exist, and nobody holds them until an administrator assigns them.
  const employee = await createUser('employee', ['member', 'leave-employee']);
  const colleague = await createUser('colleague', ['member', 'leave-employee']);
  const approver = await createUser('approver', [
    'member',
    'leave-employee',
    'leave-approver',
  ]);
  const outsider = await createUser('outsider', ['member']);

  // Anonymous callers are refused before anything else.
  expect((await testApp.request('/leaveRequests')).status).toBe(401);

  // A person without a leave job can neither list nor request.
  expect((await outsider.fetch('/leaveRequests')).status).toBe(403);
  expect((await outsider.fetch('/leaveRequests', json(request))).status).toBe(
    403,
  );

  // Creating derives the day count and the requester from the session.
  const created = await employee.fetch('/leaveRequests', json(request));
  expect(created.status).toBe(201);
  const leave = (await created.json()).data;
  expect(leave).toMatchObject({
    status: 'pending',
    days: 3,
    requesterName: 'employee',
  });

  // Inconsistent dates are refused with a field violation.
  const backwards = await employee.fetch(
    '/leaveRequests',
    json({ ...request, endDate: '2026-11-01' }),
  );
  expect(backwards.status).toBe(400);
  expect((await errorOf(backwards)).reason).toBe('INVALID_INPUT');

  // An employee sees only their own requests; the approver sees everyone's.
  await colleague.fetch(
    '/leaveRequests',
    json({ ...request, leaveType: 'sick' }),
  );
  const own = (await (await employee.fetch('/leaveRequests')).json()).meta
    .total;
  const all = (await (await approver.fetch('/leaveRequests')).json()).meta
    .total;
  expect(own).toBe(1);
  expect(all).toBe(2);

  // A colleague's request is answered as missing, for reading and for cancelling alike.
  expect(
    (await colleague.fetch(`/lifecycles/leaveRequests/${leave.id}`)).status,
  ).toBe(404);
  const foreignCancel = await colleague.fetch(
    `/lifecycles/leaveRequests/${leave.id}/fire`,
    json({ transition: 'cancel', requestId: 'c1' }),
  );
  expect(foreignCancel.status).toBe(404);

  // Without the decide permission, approving is refused even on someone else's request the caller cannot see.
  const selfApprove = await employee.fetch(
    `/lifecycles/leaveRequests/${leave.id}/fire`,
    json({ transition: 'approve', requestId: 'a1' }),
  );
  expect(selfApprove.status).toBe(403);

  // The employee's view offers cancel only; approve is marked as a missing permission.
  const employeeView = (
    await (await employee.fetch(`/lifecycles/leaveRequests/${leave.id}`)).json()
  ).data;
  const allowed = Object.fromEntries(
    employeeView.available.map((item: { name: string; allowed: boolean }) => [
      item.name,
      item.allowed,
    ]),
  );
  expect(allowed).toEqual({ approve: false, reject: false, cancel: true });

  // Rejecting needs a reason; a stale version is a conflict; then the decision is recorded.
  const fire = (body: Record<string, unknown>) =>
    approver.fetch(`/lifecycles/leaveRequests/${leave.id}/fire`, json(body));
  const noReason = await fire({ transition: 'reject', requestId: 'r1' });
  expect(noReason.status).toBe(400);
  expect((await errorOf(noReason)).reason).toBe('INVALID_INPUT');
  const stale = await fire({
    transition: 'approve',
    requestId: 'r2',
    expectVersion: 0,
  });
  expect(stale.status).toBe(409);
  const approved = await fire({
    transition: 'approve',
    requestId: 'r3',
    expectVersion: 1,
    input: { decisionNote: 'Enjoy' },
  });
  expect(approved.status).toBe(200);
  const decided = (await approved.json()).data;
  expect(decided.record).toMatchObject({
    status: 'approved',
    decisionNote: 'Enjoy',
    decidedByName: 'approver',
    requesterName: 'employee',
  });

  // A decided request cannot be cancelled any more.
  const late = await employee.fetch(
    `/lifecycles/leaveRequests/${leave.id}/fire`,
    json({ transition: 'cancel', requestId: 'c2' }),
  );
  expect(late.status).toBe(400);
  expect((await errorOf(late)).reason).toBe('INVALID_STATE');

  // The approver cannot decide on their own request.
  const own2 = (
    await (await approver.fetch('/leaveRequests', json(request))).json()
  ).data;
  const ownDecision = await approver.fetch(
    `/lifecycles/leaveRequests/${own2.id}/fire`,
    json({ transition: 'approve', requestId: 'o1' }),
  );
  expect(ownDecision.status).toBe(403);
  expect((await errorOf(ownDecision)).reason).toBe('GUARD_REJECTED');
});

test('every leave request route is declared in the API document', async ({
  testApp,
  app,
}) => {
  expect(findUndeclaredApiRoutes(app)).toEqual([]);
  const admin = await signIn(testApp, DEFAULT_ADMIN_CREDENTIALS);
  const document = await (await admin.fetch('/swagger')).json();
  expect(findApiDocumentSchemaProblems(document)).toEqual([]);
  const operations = Object.values(
    document.paths as Record<string, Record<string, { operationId?: string }>>,
  ).flatMap((path) =>
    Object.values(path).map((operation) => operation.operationId),
  );
  expect(operations).toEqual(
    expect.arrayContaining([
      'leaveRequestsList',
      'leaveRequestsCreate',
      'leaveRequestsDescribeLifecycle',
      'leaveRequestsGetLifecycleView',
      'leaveRequestsFire',
    ]),
  );
});
