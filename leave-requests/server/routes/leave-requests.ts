import {
  authenticationToken,
  type AuthEnv,
} from '@nocobase/app-plugin-authentication';
import {
  authorizationToken,
  type AuthorizationEnv,
} from '@nocobase/app-plugin-authorization/server';
import type { Application } from '@nocobase/app-server/application';
import {
  ApiError,
  apiErrorHandler,
  apiErrorResponse,
  apiErrorResponses,
  apiValidator,
  dataResponse,
  defineApiRoutes,
  describeRoute,
  listResponse,
  type AppApiRouteContribution,
} from '@nocobase/app-server/router';
import type { RepositoryPolicy } from '@nocobase/db';
import {
  lifecycleDescriptionView,
  LifecycleError,
  lifecycleErrorFields,
  type AvailableTransition,
  type LifecycleActor,
  type RecordView,
} from '@nocobase/lifecycle';
import type { Context } from 'hono';
import { Hono } from 'hono';

import { LEAVE_REQUESTS_LIFECYCLE } from '../lifecycles/leave-requests.js';
import {
  LEAVE_COLLECTION,
  LEAVE_RESOURCE_ID,
  transitionPermissions,
  type LeaveRequestAction,
} from '../leave-requests/permissions.js';
import { leaveRequestsServiceToken } from '../providers/leave-requests.js';
import { lifecycleRuntimeToken } from '../providers/lifecycles.js';
import {
  CreateLeaveRequestInput,
  FireLeaveRequestInput,
  LeaveRequest,
  LeaveRequestLifecycleDescription,
  LeaveRequestLifecycleView,
  LeaveRequestParams,
  ListLeaveRequestsQuery,
} from './schemas.js';

/** The error domain and API document tag of every route this application owns. */
const DOMAIN = 'leaveRequests';
const tags = ['LeaveRequests'];

type Env = AuthEnv & AuthorizationEnv;

const notFound = (id: string) =>
  new ApiError({
    status: 'NOT_FOUND',
    reason: 'LEAVE_REQUEST_NOT_FOUND',
    domain: DOMAIN,
    message: `Leave request ${id} was not found.`,
  });

const denied = (action: LeaveRequestAction) =>
  new ApiError({
    status: 'PERMISSION_DENIED',
    reason: 'LEAVE_REQUEST_ACTION_DENIED',
    domain: DOMAIN,
    message: `The ${action} action on leave requests is not allowed.`,
  });

/** A lifecycle refusal as the standard error body; anything else rethrown as it is. */
function toApiError(error: unknown, inputField?: string): unknown {
  if (!(error instanceof LifecycleError)) return error;
  const fields = lifecycleErrorFields(error, inputField ? { inputField } : {});
  return fields ? new ApiError({ ...fields, domain: DOMAIN }) : error;
}

function actorOf(c: Context<Env>): LifecycleActor {
  // `auth.required()` runs first on every path below, so a session is present.
  return { id: String(c.get('auth')!.user.id) };
}

/**
 * Authorizes one leave request action and returns its policy, the records it may touch. Missing and out-of-scope
 * records answer the same way afterwards, so a policy never discloses which requests exist.
 */
async function authorizeAction(
  c: Context<Env>,
  action: LeaveRequestAction,
): Promise<RepositoryPolicy | undefined> {
  const decision = await c.get('authz').authorize({
    resource: { type: 'composite', id: LEAVE_RESOURCE_ID },
    action,
  });
  const policies = decision.conditions?.database as
    Readonly<Record<string, RepositoryPolicy | false>> | undefined;
  const policy = policies?.[LEAVE_COLLECTION];
  return decision.effect === 'deny' || !policy ? undefined : policy;
}

async function requirePolicy(
  c: Context<Env>,
  action: LeaveRequestAction,
): Promise<RepositoryPolicy> {
  const policy = await authorizeAction(c, action);
  if (!policy) throw denied(action);
  return policy;
}

export const leaveRequestRoutes: AppApiRouteContribution<Application> =
  defineApiRoutes((app) => {
    const router = new Hono();
    const records = new Hono<Env>();
    const lifecycle = new Hono<Env>();
    const auth = app.container.resolve(authenticationToken);
    const authz = app.container.resolve(authorizationToken);
    const service = app.container.resolve(leaveRequestsServiceToken);

    for (const routes of [records, lifecycle]) {
      routes.onError((error, c) => apiErrorHandler(toApiError(error), c));
      routes.use('*', auth.required(), authz.middleware());
    }

    records.get(
      '/',
      describeRoute({
        tags,
        summary: 'List leave requests',
        operationId: 'leaveRequestsList',
        description:
          'The requests the caller may view, newest first, optionally of one `status`, paged by `page` and `pageSize`.',
        responses: { 200: listResponse(LeaveRequest), ...apiErrorResponses },
      }),
      apiValidator('query', ListLeaveRequestsQuery),
      async (c) => {
        const policy = await requirePolicy(c, 'view');
        return c.json(await service.list(policy, c.req.valid('query')));
      },
    );

    records.post(
      '/',
      describeRoute({
        tags,
        summary: 'Request leave',
        operationId: 'leaveRequestsCreate',
        description:
          'Creates a pending request for the signed-in user. The day count is derived from the dates, both ends included.',
        responses: {
          201: dataResponse(LeaveRequest, 'The created request.'),
          ...apiErrorResponses,
        },
      }),
      apiValidator('json', CreateLeaveRequestInput),
      async (c) => {
        await requirePolicy(c, 'create');
        try {
          const created = await service.create(actorOf(c), c.req.valid('json'));
          return c.json({ data: created }, 201);
        } catch (error) {
          throw toApiError(error);
        }
      },
    );

    // The routes `@nocobase/lifecycle/react` calls below `lifecycles/<lifecycle>`. The fixed `lifecycle` segment is
    // registered before `:leaveRequestId`, whose ids are numeric and so never equal it.
    lifecycle.get(
      '/lifecycle',
      describeRoute({
        tags,
        summary: 'Describe the leave request lifecycle',
        operationId: 'leaveRequestsDescribeLifecycle',
        description:
          'States, transitions and their titles, for diagrams and buttons.',
        responses: {
          200: dataResponse(LeaveRequestLifecycleDescription),
          ...apiErrorResponses,
        },
      }),
      async (c) => {
        await requirePolicy(c, 'view');
        const runtime = app.container.resolve(lifecycleRuntimeToken);
        return c.json({
          data: lifecycleDescriptionView(runtime, LEAVE_REQUESTS_LIFECYCLE),
        });
      },
    );

    lifecycle.get(
      '/:leaveRequestId',
      describeRoute({
        tags,
        summary: 'Get a leave request with its lifecycle',
        operationId: 'leaveRequestsGetLifecycleView',
        description:
          'The request, its state, the transitions the caller may fire now (or why not) and its history.',
        responses: {
          200: dataResponse(LeaveRequestLifecycleView),
          ...apiErrorResponses,
          404: apiErrorResponse(
            404,
            'No visible request has this id (`LEAVE_REQUEST_NOT_FOUND`).',
          ),
        },
      }),
      apiValidator('param', LeaveRequestParams),
      async (c) => {
        const { leaveRequestId } = c.req.valid('param');
        const policy = await requirePolicy(c, 'view');
        if (!(await service.find(policy, leaveRequestId)))
          throw notFound(leaveRequestId);
        const view = await service.view(actorOf(c), leaveRequestId);
        return c.json({
          data: await service.present(
            await withPermissions(c, leaveRequestId, view),
          ),
        });
      },
    );

    lifecycle.post(
      '/:leaveRequestId/fire',
      describeRoute({
        tags,
        summary: 'Approve, reject or cancel a leave request',
        operationId: 'leaveRequestsFire',
        description:
          '`approve` and `reject` need the decide permission and are refused on your own request; `reject` needs a `decisionNote`. `cancel` needs the cancel permission and is the requester’s own. Pass the version shown as `expectVersion` so a stale screen is refused with `409`.',
        responses: {
          200: dataResponse(
            LeaveRequestLifecycleView,
            'The request as the transition left it.',
          ),
          ...apiErrorResponses,
          404: apiErrorResponse(
            404,
            'No visible request has this id (`LEAVE_REQUEST_NOT_FOUND`).',
          ),
          409: apiErrorResponse(
            409,
            'The request changed since it was shown (`CONFLICT`).',
          ),
        },
      }),
      apiValidator('param', LeaveRequestParams),
      apiValidator('json', FireLeaveRequestInput),
      async (c) => {
        const { leaveRequestId } = c.req.valid('param');
        const body = c.req.valid('json');
        const action = transitionPermissions[body.transition];
        if (!action)
          throw new ApiError({
            status: 'INVALID_ARGUMENT',
            reason: 'UNKNOWN_TRANSITION',
            domain: DOMAIN,
            message: `Leave requests have no transition ${body.transition}.`,
          });
        const policy = await requirePolicy(c, action);
        if (!(await service.find(policy, leaveRequestId)))
          throw notFound(leaveRequestId);
        try {
          const result = await service.fire(actorOf(c), leaveRequestId, {
            transition: body.transition,
            input: body.input,
            requestId: body.requestId,
            ...(body.expectVersion === undefined
              ? {}
              : { expectVersion: body.expectVersion }),
          });
          return c.json({
            data: await service.present(
              await withPermissions(c, leaveRequestId, result),
            ),
          });
        } catch (error) {
          throw toApiError(error, 'input');
        }
      },
    );

    /**
     * The runtime judges transitions by their guards only. A transition the caller holds no permission for, or whose
     * permission does not reach this record, is shown as not allowed with a `permissionDenied` blocker, so the page and
     * the fire route agree.
     */
    async function withPermissions<V extends RecordView>(
      c: Context<Env>,
      id: string,
      view: V,
    ): Promise<V> {
      const reachable = new Map<LeaveRequestAction, boolean>();
      const available: AvailableTransition[] = [];
      for (const transition of view.available) {
        const action = transitionPermissions[transition.name];
        if (action && !reachable.has(action)) {
          const policy = await authorizeAction(c, action);
          reachable.set(
            action,
            policy ? Boolean(await service.find(policy, id)) : false,
          );
        }
        available.push(
          action && reachable.get(action)
            ? transition
            : {
                ...transition,
                allowed: false,
                blockers: [
                  {
                    source: 'guard',
                    kind: 'permission',
                    code: 'permissionDenied',
                    message: 'You do not have permission to do this.',
                  },
                  ...transition.blockers,
                ],
              },
        );
      }
      return { ...view, available };
    }

    router.route('/leaveRequests', records);
    router.route(`/lifecycles/${LEAVE_REQUESTS_LIFECYCLE}`, lifecycle);
    return router;
  });
