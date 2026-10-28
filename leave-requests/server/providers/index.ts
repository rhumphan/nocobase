import type { ApplicationServiceProviderConstructor } from '@nocobase/app-server/application';

import LeaveRequestsProvider from './leave-requests.js';
import LifecycleProvider from './lifecycles.js';

const serviceProviders: readonly ApplicationServiceProviderConstructor[] = [
  LifecycleProvider,
  LeaveRequestsProvider,
];

export default serviceProviders;
