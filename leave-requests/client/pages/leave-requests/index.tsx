import { ApiClientError, useApiClient } from '@nocobase/app-client';
import { useCan } from '@nocobase/app-plugin-authorization/client';
import { useLocale, useTranslation } from '@nocobase/i18n/client';
import type { ColumnDef } from '@tanstack/react-table';
import { AlertCircleIcon, CalendarDaysIcon, PlusIcon } from 'lucide-react';
import {
  type ReactElement,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { Link, Outlet, useLocation, useSearchParams } from 'react-router';

import { DataTable } from '#components/data-table';
import { DataTableColumnHeader } from '#components/data-table/column-header';
import { PageContainer } from '#components/page-container';
import { PageHeader } from '#components/page-header';
import { SessionExpiredAlert } from '#components/session-expired-alert';
import {
  Alert,
  AlertAction,
  AlertDescription,
  AlertTitle,
} from '#components/ui/alert';
import { Button } from '#components/ui/button';
import {
  Empty,
  EmptyContent,
  EmptyDescription,
  EmptyHeader,
  EmptyMedia,
  EmptyTitle,
} from '#components/ui/empty';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Skeleton } from '#components/ui/skeleton';
import { Spinner } from '#components/ui/spinner';

import { LeaveStatusBadge } from './status-badge.js';
import {
  LEAVE_STATUSES,
  type LeaveRequest,
  type LeaveRequestList,
  type LeaveRequestsOutletContext,
  type LeaveStatus,
} from './types.js';

// The endpoint caps a page at 100 requests. This page sorts in the browser, so it asks for the largest page and says
// so when more requests match.
const PAGE_SIZE = 100;

const CREATE_PERMISSION = {
  resource: { type: 'composite', id: 'leaveRequests' },
  action: 'create',
} as const;

function isLeaveStatus(value: string | null): value is LeaveStatus {
  return LEAVE_STATUSES.some((status) => status === value);
}

export default function LeaveRequestsPage(): ReactElement {
  const { t } = useTranslation();
  const { locale } = useLocale();
  const api = useApiClient();
  const location = useLocation();
  const [searchParams, setSearchParams] = useSearchParams();
  const statusParam = searchParams.get('status');
  const status = isLeaveStatus(statusParam) ? statusParam : undefined;
  // Visibility only: the server checks the permission again when the request is submitted.
  const { can: canCreate } = useCan(CREATE_PERMISSION);

  function changeStatus(value: string | null): void {
    setSearchParams((params) => {
      if (value && value !== 'all') params.set('status', value);
      else params.delete('status');
      return params;
    });
  }

  const [reloadCount, reload] = useReducer((count: number) => count + 1, 0);
  const requestKey = JSON.stringify([status ?? null, reloadCount]);
  const [result, setResult] = useState<{
    readonly key: string;
    readonly rows?: LeaveRequest[];
    readonly filtered?: boolean;
    readonly error?: unknown;
    readonly total?: number;
  }>();

  useEffect(() => {
    const controller = new AbortController();
    const key = JSON.stringify([status ?? null, reloadCount]);
    api
      .request<LeaveRequestList>({
        path: 'leaveRequests',
        query: { status, pageSize: PAGE_SIZE },
        signal: controller.signal,
      })
      .then(
        ({ data, meta }) => {
          if (!controller.signal.aborted)
            setResult({
              key,
              rows: data,
              total: meta.total,
              filtered: status !== undefined,
            });
        },
        (error: unknown) => {
          if (!controller.signal.aborted)
            setResult((previous) => ({ ...previous, key, error }));
        },
      );
    return () => controller.abort();
  }, [api, status, reloadCount]);

  const loading = result?.key !== requestKey;
  const error = loading ? undefined : result?.error;
  const rows = result?.rows;
  const rowsFiltered = result?.filtered ?? false;

  const outletContext = useMemo<LeaveRequestsOutletContext>(
    () => ({ reload }),
    [reload],
  );

  const dateFormat = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeZone: 'UTC' }),
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
  const collator = useMemo(() => new Intl.Collator(locale), [locale]);

  const statusItems = [
    { value: 'all', label: t('leaveRequests.filters.allStatuses') },
    ...LEAVE_STATUSES.map((value) => ({
      value,
      label: t(`leaveRequests.status.${value}`),
    })),
  ];

  const columns = useMemo<ColumnDef<LeaveRequest>[]>(
    () => [
      {
        accessorKey: 'requesterName',
        enableHiding: false,
        sortingFn: (a, b) =>
          collator.compare(
            a.original.requesterName ?? '',
            b.original.requesterName ?? '',
          ),
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('leaveRequests.fields.requester')}
          />
        ),
        cell: ({ row }) => (
          <Link
            to={{ pathname: row.original.id, search: location.search }}
            className='font-medium hover:underline'
          >
            {row.original.requesterName ?? t('leaveRequests.unknownUser')}
          </Link>
        ),
      },
      {
        accessorKey: 'leaveType',
        header: t('leaveRequests.fields.leaveType'),
        cell: ({ row }) => t(`leaveRequests.types.${row.original.leaveType}`),
      },
      {
        accessorKey: 'startDate',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('leaveRequests.fields.period')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap'>
            {dateFormat.formatRange(
              new Date(`${row.original.startDate}T00:00:00Z`),
              new Date(`${row.original.endDate}T00:00:00Z`),
            )}
          </span>
        ),
      },
      {
        accessorKey: 'days',
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('leaveRequests.fields.days')}
          />
        ),
        cell: ({ row }) =>
          t('leaveRequests.daysValue', { count: row.original.days }),
      },
      {
        accessorKey: 'status',
        header: t('leaveRequests.fields.status'),
        cell: ({ row }) => <LeaveStatusBadge status={row.original.status} />,
      },
      {
        accessorKey: 'createdAt',
        enableHiding: false,
        header: ({ column }) => (
          <DataTableColumnHeader
            column={column}
            title={t('leaveRequests.fields.createdAt')}
          />
        ),
        cell: ({ row }) => (
          <span className='whitespace-nowrap text-muted-foreground'>
            {instantFormat.format(new Date(row.original.createdAt))}
          </span>
        ),
      },
    ],
    [collator, dateFormat, instantFormat, location.search, t],
  );

  const createButton = canCreate ? (
    <Button
      render={<Link to={{ pathname: 'new', search: location.search }} />}
      nativeButton={false}
    >
      <PlusIcon data-icon='inline-start' />
      {t('leaveRequests.create.action')}
    </Button>
  ) : null;

  let content: ReactElement;
  if (error instanceof ApiClientError && error.status === 401) {
    content = <SessionExpiredAlert />;
  } else if (error) {
    const forbidden = error instanceof ApiClientError && error.status === 403;
    content = (
      <Alert variant='destructive'>
        <AlertCircleIcon />
        <AlertTitle>{t('leaveRequests.error.title')}</AlertTitle>
        <AlertDescription>
          {forbidden
            ? t('leaveRequests.error.forbidden')
            : t('leaveRequests.error.requestFailed')}
        </AlertDescription>
        {forbidden ? null : (
          <AlertAction>
            <Button variant='outline' size='sm' onClick={reload}>
              {t('status.retry')}
            </Button>
          </AlertAction>
        )}
      </Alert>
    );
  } else if (rows === undefined) {
    content = <TableSkeleton label={t('status.loading')} />;
  } else if (rows.length === 0 && !rowsFiltered) {
    content = (
      <Empty className='min-h-48 border border-dashed'>
        <EmptyHeader>
          <EmptyMedia variant='icon'>
            <CalendarDaysIcon />
          </EmptyMedia>
          <EmptyTitle>{t('leaveRequests.empty.title')}</EmptyTitle>
          <EmptyDescription>
            {t('leaveRequests.empty.description')}
          </EmptyDescription>
        </EmptyHeader>
        {createButton ? <EmptyContent>{createButton}</EmptyContent> : null}
      </Empty>
    );
  } else {
    const capped = (result?.total ?? 0) > rows.length;
    content = (
      <>
        {capped ? (
          <p className='text-sm text-muted-foreground'>
            {t('leaveRequests.capNotice', { count: rows.length })}
          </p>
        ) : null}
        <DataTable
          columns={columns}
          data={rows}
          getRowId={(row) => row.id}
          showSelectedCount={false}
          emptyMessage={
            <div className='flex flex-col items-center gap-2'>
              <span>{t('leaveRequests.empty.noResults')}</span>
              <Button
                variant='link'
                size='sm'
                onClick={() => changeStatus(null)}
              >
                {t('leaveRequests.filters.clear')}
              </Button>
            </div>
          }
        />
      </>
    );
  }

  return (
    <PageContainer>
      <PageHeader
        title={t('leaveRequests.title')}
        description={t('leaveRequests.description')}
        actions={
          rows !== undefined && (rows.length > 0 || rowsFiltered)
            ? createButton
            : null
        }
      />
      <div className='flex flex-wrap items-center gap-2'>
        <Select
          items={statusItems}
          value={status ?? 'all'}
          onValueChange={changeStatus}
        >
          <SelectTrigger
            className='w-full sm:w-44'
            aria-label={t('leaveRequests.filters.status')}
          >
            <SelectValue />
          </SelectTrigger>
          <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width) [&_[data-slot=select-item]>:first-child]:whitespace-normal'>
            <SelectGroup>
              {statusItems.map((item) => (
                <SelectItem key={item.value} value={item.value}>
                  {item.label}
                </SelectItem>
              ))}
            </SelectGroup>
          </SelectContent>
        </Select>
        {status ? (
          <Button variant='ghost' onClick={() => changeStatus(null)}>
            {t('leaveRequests.filters.clear')}
          </Button>
        ) : null}
        {loading && rows !== undefined ? (
          <Spinner className='text-muted-foreground' />
        ) : null}
      </div>
      {content}
      <Outlet context={outletContext} />
    </PageContainer>
  );
}

function TableSkeleton({ label }: { readonly label: string }): ReactElement {
  return (
    <div
      role='status'
      aria-label={label}
      className='overflow-hidden rounded-lg border'
    >
      {Array.from({ length: 5 }, (_, index) => (
        <div
          key={index}
          className='flex items-center gap-4 border-b px-4 py-3 last:border-b-0'
        >
          <Skeleton className='h-4 w-32' />
          <Skeleton className='h-4 w-20' />
          <Skeleton className='h-4 w-40' />
          <Skeleton className='h-5 w-16 rounded-full' />
          <Skeleton className='ml-auto h-4 w-28' />
        </div>
      ))}
    </div>
  );
}
