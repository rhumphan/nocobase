import { useTranslation } from '@nocobase/i18n/client';
import type { ReactElement } from 'react';

import { StatusBadge } from '#components/status-badge';

import type { LeaveStatus } from './types.js';

const tones = {
  pending: 'warning',
  approved: 'success',
  rejected: 'neutral',
  cancelled: 'neutral',
} as const satisfies Record<LeaveStatus, string>;

export function LeaveStatusBadge({
  status,
  size,
}: {
  readonly status: LeaveStatus;
  readonly size?: 'sm';
}): ReactElement {
  const { t } = useTranslation();
  return (
    <StatusBadge tone={tones[status]} size={size}>
      {t(`leaveRequests.status.${status}`)}
    </StatusBadge>
  );
}
