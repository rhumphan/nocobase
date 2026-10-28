import { useApiClient } from '@nocobase/app-client';
import {
  createLifecycleHook,
  type UseRecordLifecycle,
} from '@nocobase/lifecycle/react';

/** Every lifecycle of this application is served below `/api/lifecycles/<lifecycle>` (`server/routes/`). */
export const useRecordLifecycle: UseRecordLifecycle = createLifecycleHook({
  useTransport: useApiClient,
  basePath: 'lifecycles',
});
