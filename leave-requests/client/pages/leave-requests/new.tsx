import { useTranslation } from '@nocobase/i18n/client';
import { type ReactElement, useRef, useState } from 'react';
import { useOutletContext } from 'react-router';

import { RouteDialog } from '#components/route-dialog';
import { Button } from '#components/ui/button';
import { Spinner } from '#components/ui/spinner';
import { useRouteOverlay } from '#components/use-route-overlay';

import { LeaveRequestForm } from './leave-request-form.js';
import type { LeaveRequestsOutletContext } from './types.js';

const FORM_ID = 'leave-request-new-form';

/** Route `/leave-requests/new`: the request dialog over the list. */
export default function NewLeaveRequestPage(): ReactElement {
  const { t } = useTranslation();
  const [submitting, setSubmitting] = useState(false);
  // beforeClose reads the ref: right after a successful save, the new state value has not rendered yet.
  const submittingRef = useRef(false);
  const handleSubmittingChange = (value: boolean) => {
    submittingRef.current = value;
    setSubmitting(value);
  };

  return (
    <RouteDialog
      title={t('leaveRequests.create.title')}
      description={t('leaveRequests.create.description')}
      className='sm:max-w-lg'
      beforeClose={() => !submittingRef.current}
      footer={<NewLeaveRequestFooter submitting={submitting} />}
    >
      <NewLeaveRequestBody onSubmittingChange={handleSubmittingChange} />
    </RouteDialog>
  );
}

function NewLeaveRequestBody({
  onSubmittingChange,
}: {
  readonly onSubmittingChange: (submitting: boolean) => void;
}): ReactElement {
  const { close } = useRouteOverlay();
  const { reload } = useOutletContext<LeaveRequestsOutletContext>();
  return (
    <LeaveRequestForm
      formId={FORM_ID}
      onSubmittingChange={onSubmittingChange}
      onSubmitted={() => {
        reload();
        void close();
      }}
    />
  );
}

function NewLeaveRequestFooter({
  submitting,
}: {
  readonly submitting: boolean;
}): ReactElement {
  const { t } = useTranslation();
  const { close } = useRouteOverlay();
  return (
    <>
      <Button
        type='button'
        variant='outline'
        disabled={submitting}
        onClick={() => void close()}
      >
        {t('actions.cancel')}
      </Button>
      <Button type='submit' form={FORM_ID} disabled={submitting}>
        {submitting ? <Spinner data-icon='inline-start' /> : null}
        {submitting
          ? t('leaveRequests.create.submitting')
          : t('leaveRequests.create.submit')}
      </Button>
    </>
  );
}
