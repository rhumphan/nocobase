import type { Application } from '@nocobase/app-server/application';
import { authorizationToken } from '@nocobase/app-plugin-authorization/server';
import { databaseManagerToken } from '@nocobase/db';
import { APP_NS } from '@nocobase/i18n';
import {
  createServiceToken,
  ServiceProvider,
  type ServiceToken,
} from '@nocobase/service-provider';

import {
  LEAVE_COLLECTION,
  leaveRequestsResource,
  myLeaveRequests,
} from '../leave-requests/permissions.js';
import { LeaveRequestsService } from '../leave-requests/service.js';
import { lifecycleRuntimeToken } from './lifecycles.js';

export const leaveRequestsServiceToken: ServiceToken<LeaveRequestsService> =
  createServiceToken<LeaveRequestsService>('app/leave-requests');

/** Registers the leave request permission model and the service its routes call. */
export default class LeaveRequestsProvider extends ServiceProvider<Application> {
  public readonly name: string = 'app/leave-requests-provider';

  public override register(): void {
    this.app.container.singleton(
      leaveRequestsServiceToken,
      () =>
        new LeaveRequestsService(
          this.app.container.resolve(databaseManagerToken),
          this.app.container.resolve(lifecycleRuntimeToken),
        ),
    );
  }

  public override async boot(): Promise<void> {
    // Without the authorization plugin there is nothing to register the model with, and the leave request routes
    // refuse to start on their own (they resolve the same token). Skipping keeps an application composed without
    // them, such as a runtime test with no plugins, able to boot.
    if (!this.app.container.has(authorizationToken)) return;
    const authz = this.app.container.resolve(authorizationToken);
    authz.database.collections.add({
      name: LEAVE_COLLECTION,
      title: 'Leave requests',
    });
    authz.recordAccess.define(myLeaveRequests);
    const reference = authz.compositeResources.define(leaveRequestsResource);
    authz.ui.sections.add({
      name: 'leaveRequests',
      title: { key: 'leaveRequests.permissions.section', ns: APP_NS },
      parent: 'business',
    });
    authz.ui.place(reference, { section: 'leaveRequests' });
  }
}
