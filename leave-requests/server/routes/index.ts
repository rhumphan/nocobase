import type { Application } from '@nocobase/app-server/application';
import type { AppRouteContribution } from '@nocobase/app-server/router';

import { leaveRequestRoutes } from './leave-requests.js';

const routes: readonly AppRouteContribution<Application>[] = [
  leaveRequestRoutes,
];

export default routes;
