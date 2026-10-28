# Leave requests

The application's one business feature: employees request leave, a leave approver approves or rejects it, and the requester may cancel while it is pending.

## Where it lives

| Concern                                        | File                                                             |
| ---------------------------------------------- | ---------------------------------------------------------------- |
| States, transitions, guards                    | `server/lifecycles/leave-requests.ts`                            |
| The application's one `LifecycleRuntime`       | `server/providers/lifecycles.ts`                                 |
| Composite resource, record access              | `server/leave-requests/permissions.ts`                           |
| Reads through policies, writes via the runtime | `server/leave-requests/service.ts`                               |
| HTTP routes                                    | `server/routes/leave-requests.ts`, `server/routes/schemas.ts`    |
| Table and lifecycle log tables                 | `database/main/migrations/202610280001_create_leave_requests.ts` |
| Initial jobs (Employee, Leave approver)        | `database/main/seeds/202610280002_leave_permission_sets.ts`      |
| Pages                                          | `client/pages/leave-requests/`                                   |

## Conventions

- Lifecycle record routes are served below `/api/lifecycles/<lifecycle>` (`lifecycle`, `:id`, `:id/fire`), the `basePath` that `client/lib/lifecycle.ts` gives `@nocobase/lifecycle/react`. A new lifecycle registers on the runtime in `server/providers/lifecycles.ts` and serves its routes under the same prefix.
- Every transition maps to one composite action in `transitionPermissions`; the fire route refuses a transition that map does not name. Approve and reject share `decide`, cancel is `cancel`.
- The record view marks a transition the caller holds no permission for as not allowed with a `permissionDenied` blocker, so buttons rendered from `view.available` match what the fire route accepts.
- "Nobody decides on their own request" is a lifecycle guard (`ownRequest`), not a permission: it holds for root too.
- The permission set seed spells out its stored grants instead of importing `server/leave-requests/permissions.ts`. The seed loader imports seeds without the application's `.js` → `.ts` resolution, so an import of an application module fails under `pnpm test`; keep seeds self-contained, as migrations are.
- Single-person approval is deliberately a lifecycle decision. Multi-step approval, countersigning or reassignment needs the commercial `@nocobase/app-plugin-approval`.

## Not built yet

- Workflow management pages (definitions, executions) under System settings.
- Notifying the requester when a decision is made (an `onEnter` effect through the notification plugin).
- Leave balances, public holidays and working-day counting: `days` counts calendar days.
