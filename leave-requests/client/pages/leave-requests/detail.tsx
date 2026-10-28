import { useToaster } from '@nocobase/app-client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import {
  LifecycleRequestError,
  type AvailableTransition,
  type TransitionEntry,
} from '@nocobase/lifecycle/react';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useId, useMemo, useState } from 'react';
import { useOutletContext, useParams } from 'react-router';

import { LifecycleDiagram } from '#components/lifecycle-diagram';
import { RouteDrawer } from '#components/route-drawer';
import { Alert, AlertAction, AlertDescription } from '#components/ui/alert';
import { Button } from '#components/ui/button';
import { Field, FieldDescription, FieldLabel } from '#components/ui/field';
import { Separator } from '#components/ui/separator';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';
import { Textarea } from '#components/ui/textarea';
import { useRecordLifecycle } from '#lib/lifecycle';

import { LeaveStatusBadge } from './status-badge.js';
import type { LeaveRequest, LeaveRequestsOutletContext } from './types.js';

const LIFECYCLE = 'leaveRequests';

/** Route `/leave-requests/:leaveRequestId`: one request, what can happen to it next, and how it got here. */
export default function LeaveRequestDetailPage(): ReactElement {
  const { leaveRequestId = '' } = useParams();
  // Keyed by id, so switching records starts over.
  return <LeaveRequestDetail key={leaveRequestId} id={leaveRequestId} />;
}

function LeaveRequestDetail({ id }: { readonly id: string }): ReactElement {
  const { t } = useTranslation();
  const { reload: reloadList } = useOutletContext<LeaveRequestsOutletContext>();
  const { view, description, error, busy, fire, reload } = useRecordLifecycle(
    LIFECYCLE,
    id,
  );
  const record = view?.record as LeaveRequest | undefined;

  let body: ReactElement;
  if (error && !view) {
    const status =
      error instanceof LifecycleRequestError ? error.status : undefined;
    body = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertDescription>
          {status === 404
            ? t('leaveRequests.error.notFound')
            : status === 403
              ? t('leaveRequests.error.forbidden')
              : t('leaveRequests.error.requestFailed')}
        </AlertDescription>
        {status === 404 || status === 403 ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={() => void reload()}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (!view || !record) {
    body = (
      <div
        role='status'
        aria-label={t('status.loading')}
        className='flex flex-col gap-3'
      >
        <Skeleton className='h-5 w-48' />
        <Skeleton className='h-4 w-64' />
        <Skeleton className='h-4 w-40' />
        <Skeleton className='h-40 w-full' />
      </div>
    );
  } else {
    body = (
      <div className='flex flex-col gap-6'>
        <RequestSummary record={record} />
        <TransitionActions
          available={view.available}
          busy={busy}
          onFire={async (transition, input) => {
            await fire(transition, input);
            reloadList();
          }}
          onConflict={() => void reload()}
        />
        <Separator />
        <section className='flex flex-col gap-3'>
          <h3 className='text-sm font-medium'>
            {t('leaveRequests.detail.progress')}
          </h3>
          {description ? (
            <LifecycleDiagram
              description={description.description}
              ariaLabel={t('leaveRequests.detail.diagramLabel')}
              currentState={record.status}
              history={view.history.transitions}
              availableTransitions={view.available
                .filter((item) => item.allowed)
                .map((item) => item.name)}
              stateLabel={(state) => t(`leaveRequests.status.${state.name}`)}
              transitionLabel={(transition) =>
                t(`leaveRequests.transitions.${transition.name}`)
              }
              endLabel={t('leaveRequests.detail.end')}
              initialMinZoom={0.8}
            />
          ) : (
            <Skeleton className='h-64 w-full' />
          )}
        </section>
        <Separator />
        <History entries={view.history.transitions} />
      </div>
    );
  }

  return (
    <RouteDrawer
      title={t('leaveRequests.detail.title', { id })}
      description={
        record ? t(`leaveRequests.types.${record.leaveType}`) : undefined
      }
      className='sm:max-w-xl'
    >
      {body}
    </RouteDrawer>
  );
}

function RequestSummary({
  record,
}: {
  readonly record: LeaveRequest;
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'long', timeZone: 'UTC' }),
    [locale],
  );
  const instantFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const rows: {
    readonly label: string;
    readonly value: ReactElement | string;
  }[] = [
    {
      label: t('leaveRequests.fields.status'),
      value: <LeaveStatusBadge status={record.status} />,
    },
    {
      label: t('leaveRequests.fields.requester'),
      value: record.requesterName ?? t('leaveRequests.unknownUser'),
    },
    {
      label: t('leaveRequests.fields.period'),
      value: dateFormat.formatRange(
        new Date(`${record.startDate}T00:00:00Z`),
        new Date(`${record.endDate}T00:00:00Z`),
      ),
    },
    {
      label: t('leaveRequests.fields.days'),
      value: t('leaveRequests.daysValue', { count: record.days }),
    },
    { label: t('leaveRequests.fields.reason'), value: record.reason || '—' },
    {
      label: t('leaveRequests.fields.createdAt'),
      value: instantFormat.format(new Date(record.createdAt)),
    },
  ];
  if (record.decidedAt)
    rows.push(
      {
        label: t('leaveRequests.fields.decidedBy'),
        value: record.decidedByName ?? t('leaveRequests.unknownUser'),
      },
      {
        label: t('leaveRequests.fields.decidedAt'),
        value: instantFormat.format(new Date(record.decidedAt)),
      },
      {
        label: t('leaveRequests.fields.decisionNote'),
        value: record.decisionNote || '—',
      },
    );
  return (
    <dl className='grid grid-cols-[minmax(7rem,auto)_1fr] gap-x-4 gap-y-2 text-sm'>
      {rows.map((row) => (
        <div key={row.label} className='contents'>
          <dt className='text-muted-foreground'>{row.label}</dt>
          <dd className='min-w-0 break-words whitespace-pre-wrap'>
            {row.value}
          </dd>
        </div>
      ))}
    </dl>
  );
}

/**
 * Buttons come from `view.available`, the server's judgement for this person and this record, never from a state
 * check written here. A transition the person may not fire stays visible, disabled, with the reason beside it.
 */
function TransitionActions({
  available,
  busy,
  onFire,
  onConflict,
}: {
  readonly available: readonly AvailableTransition[];
  readonly busy: boolean;
  readonly onFire: (
    transition: string,
    input?: Record<string, string>,
  ) => Promise<void>;
  readonly onConflict: () => void;
}): ReactElement | null {
  const { t } = useTranslation();
  const toaster = useToaster();
  const noteId = useId();
  const [note, setNote] = useState('');
  const [noteError, setNoteError] = useState<string>();
  const [failure, setFailure] = useState<string>();

  const allowed = available.filter((item) => item.allowed);
  if (available.length === 0) return null;
  const decides = allowed.some(
    (item) => item.name === 'approve' || item.name === 'reject',
  );

  async function run(transition: string): Promise<void> {
    setFailure(undefined);
    setNoteError(undefined);
    const decisionNote = note.trim();
    const input: Record<string, string> | undefined =
      transition === 'cancel'
        ? undefined
        : decisionNote
          ? { decisionNote }
          : {};
    try {
      await onFire(transition, input);
      toaster.show({
        type: 'success',
        title: t(`leaveRequests.transitionDone.${transition}`),
      });
      setNote('');
    } catch (error: unknown) {
      if (!(error instanceof LifecycleRequestError)) {
        setFailure(t('leaveRequests.error.requestFailed'));
      } else if (error.reason === 'CONFLICT') {
        setFailure(t('leaveRequests.conflict'));
        onConflict();
      } else if (
        error.problems.some((problem) =>
          problem.field?.endsWith('decisionNote'),
        )
      ) {
        setNoteError(t('leaveRequests.detail.noteRequired'));
      } else if (error.blockers[0]) {
        setFailure(blockerText(t, error.blockers[0].code));
      } else {
        setFailure(t('leaveRequests.error.requestFailed'));
      }
    }
  }

  // Explain only what this person could otherwise do: a transition they hold no permission for is not theirs to
  // wonder about, such as an approver looking at somebody else's cancel button.
  const reasons = [
    ...new Set(
      available.flatMap((item) => {
        const blocker = item.allowed ? undefined : item.blockers[0];
        return blocker && blocker.code !== 'permissionDenied'
          ? [blockerText(t, blocker.code)]
          : [];
      }),
    ),
  ];

  return (
    <section className='flex flex-col gap-3'>
      {failure ? (
        <Alert variant='destructive'>
          <AlertCircleIcon />
          <AlertDescription>{failure}</AlertDescription>
        </Alert>
      ) : null}
      {decides ? (
        <Field data-invalid={noteError !== undefined}>
          <FieldLabel htmlFor={noteId}>
            {t('leaveRequests.fields.decisionNote')}
          </FieldLabel>
          <Textarea
            id={noteId}
            rows={2}
            value={note}
            maxLength={2000}
            aria-invalid={noteError !== undefined}
            onChange={(event) => setNote(event.target.value)}
          />
          <FieldDescription>
            {noteError ?? t('leaveRequests.detail.noteHint')}
          </FieldDescription>
        </Field>
      ) : null}
      {allowed.length ? (
        <div className='flex flex-wrap gap-2'>
          {allowed.map((transition) => (
            <Button
              key={transition.name}
              variant={transition.name === 'approve' ? 'default' : 'outline'}
              disabled={busy}
              onClick={() => void run(transition.name)}
            >
              {busy ? <Spinner data-icon='inline-start' /> : null}
              {t(`leaveRequests.transitions.${transition.name}`)}
            </Button>
          ))}
        </div>
      ) : null}
      {reasons.length ? (
        <ul className='text-sm text-muted-foreground'>
          {reasons.map((reason) => (
            <li key={reason}>{reason}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}

function blockerText(t: (key: string) => string, code: string): string {
  return ['ownRequest', 'requesterOnly', 'permissionDenied'].includes(code)
    ? t(`leaveRequests.blockers.${code}`)
    : t('leaveRequests.blockers.other');
}

function History({
  entries,
}: {
  readonly entries: readonly TransitionEntry[];
}): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const instantFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        dateStyle: 'medium',
        timeStyle: 'short',
      }),
    [locale],
  );
  const ordered = [...entries].sort((a, b) => a.version - b.version);
  return (
    <section className='flex flex-col gap-3'>
      <h3 className='text-sm font-medium'>
        {t('leaveRequests.detail.history')}
      </h3>
      <ol className='flex flex-col gap-2 text-sm'>
        {ordered.map((entry) => (
          <li
            key={entry.id}
            className='flex flex-wrap items-baseline justify-between gap-x-4'
          >
            <span>
              {t(
                `leaveRequests.history.${entry.transition === '$create' ? 'create' : entry.transition}`,
              )}
            </span>
            <span className='text-muted-foreground'>
              {instantFormat.format(new Date(entry.at))}
            </span>
          </li>
        ))}
      </ol>
    </section>
  );
}
