import type { Application } from '@nocobase/app-server/application';
import { jobExecutorServiceToken } from '@nocobase/app-server/jobs';
import { loggingToken } from '@nocobase/app-server/logging';
import { databaseManagerToken } from '@nocobase/db';
import {
  createRepositoryLifecycleStore,
  LIFECYCLE_COLLECTIONS,
  LifecycleRuntime,
} from '@nocobase/lifecycle';
import {
  createLifecycleJobs,
  type LifecycleJobs,
} from '@nocobase/lifecycle/jobs';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import { leaveRequestLifecycle } from '../lifecycles/leave-requests.js';

/** The application's package name: the jobs scope every lifecycle effect and sweep runs under. */
const SCOPE = 'leave-requests';

export const lifecycleRuntimeToken: ServiceToken<LifecycleRuntime> =
  createServiceToken<LifecycleRuntime>('app/lifecycle-runtime');

/** The one `LifecycleRuntime` of this application; every lifecycle registers on it. */
export default class LifecycleProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/lifecycle-provider';
  private jobs: LifecycleJobs | undefined;
  private runtime: LifecycleRuntime | undefined;

  public override register(): void {
    this.app.container.singleton(lifecycleRuntimeToken, () =>
      this.lifecycleRuntime(),
    );
  }

  public override async start(): Promise<void> {
    // An application started without a database, or on one this application's migrations have not reached (an
    // embedding host's own root, a database not yet migrated), has no lifecycle log tables. The effect job and the
    // sweep would fail on every run there, so they start with the next start after `pnpm nocobase db apply`.
    if (
      !this.app.container.has(databaseManagerToken) ||
      !(await this.app.container
        .resolve(databaseManagerToken)
        .collections()
        .get(LIFECYCLE_COLLECTIONS.effectRuns))
    ) {
      this.app.container
        .resolve(loggingToken)
        .getLogger('lifecycle')
        .warn(
          'Lifecycle tables are missing; effects and triggers stay off until the migrations are applied.',
        );
      return;
    }
    // Registers the effect job, opens the executors, schedules the sweep and recovers runs an earlier process left.
    await this.effectJobs().start(this.lifecycleRuntime());
  }

  public override async shutdown(): Promise<void> {
    await this.jobs?.shutdown();
  }

  private effectJobs(): LifecycleJobs {
    if (this.jobs) return this.jobs;
    const executors = this.app.container.resolve(jobExecutorServiceToken);
    this.jobs = createLifecycleJobs({
      jobs: executors.getJobExecutor(SCOPE),
      schedule: executors.getScheduleExecutor(SCOPE),
      jobName: `${SCOPE}/lifecycle-effect`, // stored with every queued task: keep it stable
      sweepEveryMs: 60_000,
      onSweep: async () => {
        await this.lifecycleRuntime().prune({
          olderThan: new Date(Date.now() - 7 * 86_400_000),
        });
      },
    });
    return this.jobs;
  }

  private lifecycleRuntime(): LifecycleRuntime {
    if (this.runtime) return this.runtime;
    const logger = this.app.container
      .resolve(loggingToken)
      .getLogger('lifecycle');
    const runtime = new LifecycleRuntime({
      store: createRepositoryLifecycleStore(
        this.app.container.resolve(databaseManagerToken),
      ),
      dispatcher: this.effectJobs(),
      logger: {
        warn: (message, details) => logger.warn({ details }, message),
        error: (message, details) => logger.error({ details }, message),
      },
    });
    runtime.register(leaveRequestLifecycle, { services: {} });
    this.runtime = runtime;
    return runtime;
  }
}
