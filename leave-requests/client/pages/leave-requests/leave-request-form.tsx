import { zodResolver } from '@hookform/resolvers/zod';
import { ApiClientError, useApiClient, useToaster } from '@nocobase/app-client';
import { useTranslation } from '@nocobase/i18n/client';
import { AlertCircleIcon } from 'lucide-react';
import { type ReactElement, useEffect, useMemo } from 'react';
import { Controller, useForm, useWatch } from 'react-hook-form';
import { z } from 'zod';

import { SessionExpiredAlert } from '#components/session-expired-alert';
import { Alert, AlertDescription } from '#components/ui/alert';
import {
  Field,
  FieldDescription,
  FieldError,
  FieldGroup,
  FieldLabel,
} from '#components/ui/field';
import { Input } from '#components/ui/input';
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '#components/ui/select';
import { Textarea } from '#components/ui/textarea';

import {
  LEAVE_TYPES,
  leaveDays,
  MAX_LEAVE_DAYS,
  type LeaveRequest,
} from './types.js';

export interface LeaveRequestFormProps {
  readonly formId: string;
  /** Called after the request was created; the form has already shown the success message. */
  readonly onSubmitted: (request: LeaveRequest) => void;
  readonly onSubmittingChange?: (submitting: boolean) => void;
  readonly onDirtyChange?: (dirty: boolean) => void;
}

/** Field problems the server reports, keyed by the field it names. */
interface FieldViolation {
  readonly field: string;
  readonly description: string;
}

const FIELDS = ['leaveType', 'startDate', 'endDate', 'reason'] as const;
type FormField = (typeof FIELDS)[number];

function isFormField(value: string): value is FormField {
  return FIELDS.some((field) => field === value);
}

export function LeaveRequestForm({
  formId,
  onSubmitted,
  onSubmittingChange,
  onDirtyChange,
}: LeaveRequestFormProps): ReactElement {
  const { t } = useTranslation();
  const api = useApiClient();
  const toaster = useToaster();

  const schema = useMemo(
    () =>
      z
        .object({
          leaveType: z.enum(LEAVE_TYPES),
          startDate: z.string().min(1, t('leaveRequests.form.startRequired')),
          endDate: z.string().min(1, t('leaveRequests.form.endRequired')),
          reason: z
            .string()
            .trim()
            .max(2000, t('leaveRequests.form.reasonTooLong', { max: 2000 })),
        })
        .superRefine((values, context) => {
          const days = leaveDays(values.startDate, values.endDate);
          if (days === undefined) return;
          if (days < 1)
            context.addIssue({
              code: 'custom',
              path: ['endDate'],
              message: t('leaveRequests.form.endBeforeStart'),
            });
          else if (days > MAX_LEAVE_DAYS)
            context.addIssue({
              code: 'custom',
              path: ['endDate'],
              message: t('leaveRequests.form.tooLong', { max: MAX_LEAVE_DAYS }),
            });
        }),
    [t],
  );

  const form = useForm({
    resolver: zodResolver(schema),
    defaultValues: {
      leaveType: 'annual' as const,
      startDate: '',
      endDate: '',
      reason: '',
    },
  });

  const { isDirty } = form.formState;
  useEffect(() => {
    onDirtyChange?.(isDirty);
  }, [isDirty, onDirtyChange]);

  const [startDate, endDate] = useWatch({
    control: form.control,
    name: ['startDate', 'endDate'],
  });
  const days = leaveDays(startDate, endDate);

  const typeItems = LEAVE_TYPES.map((value) => ({
    value,
    label: t(`leaveRequests.types.${value}`),
  }));

  const onSubmit = form.handleSubmit(async (values) => {
    let created: LeaveRequest;
    onSubmittingChange?.(true);
    try {
      const result = await api.request<{ data: LeaveRequest }>({
        path: 'leaveRequests',
        method: 'POST',
        json: values,
      });
      created = result.data;
    } catch (error: unknown) {
      const apiError = error instanceof ApiClientError ? error : undefined;
      const violations = (
        apiError?.payload as { error?: { fieldViolations?: FieldViolation[] } }
      )?.error?.fieldViolations;
      const fieldViolation = violations?.find((violation) =>
        isFormField(violation.field),
      );
      if (
        apiError?.status === 400 &&
        fieldViolation &&
        isFormField(fieldViolation.field)
      ) {
        form.setError(
          fieldViolation.field,
          { message: t('leaveRequests.form.invalid') },
          { shouldFocus: true },
        );
      } else if (apiError?.status === 401) {
        form.setError('root', { type: 'sessionExpired' });
      } else {
        form.setError('root', {
          message:
            apiError?.status === 403
              ? t('leaveRequests.error.forbidden')
              : t('leaveRequests.error.requestFailed'),
        });
      }
      return;
    } finally {
      onSubmittingChange?.(false);
    }
    toaster.show({ type: 'success', title: t('leaveRequests.create.success') });
    onSubmitted(created);
  });

  const rootError = form.formState.errors.root;

  return (
    <form id={formId} noValidate onSubmit={(event) => void onSubmit(event)}>
      <FieldGroup>
        {rootError?.type === 'sessionExpired' ? (
          <SessionExpiredAlert />
        ) : rootError ? (
          <Alert variant='destructive'>
            <AlertCircleIcon />
            <AlertDescription>{rootError.message}</AlertDescription>
          </Alert>
        ) : null}
        <Controller
          control={form.control}
          name='leaveType'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-leaveType`}>
                {t('leaveRequests.fields.leaveType')}
              </FieldLabel>
              <Select
                items={typeItems}
                value={field.value}
                onValueChange={(value) => {
                  if (value) field.onChange(value);
                }}
              >
                <SelectTrigger
                  ref={field.ref}
                  id={`${formId}-leaveType`}
                  className='w-full'
                  aria-invalid={fieldState.invalid}
                  onBlur={field.onBlur}
                >
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className='w-auto max-w-[min(var(--container-sm),var(--available-width))] min-w-(--anchor-width)'>
                  <SelectGroup>
                    {typeItems.map((item) => (
                      <SelectItem key={item.value} value={item.value}>
                        {item.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
        <div className='grid gap-4 sm:grid-cols-2'>
          {(['startDate', 'endDate'] as const).map((name) => (
            <Controller
              key={name}
              control={form.control}
              name={name}
              render={({ field, fieldState }) => (
                <Field data-invalid={fieldState.invalid}>
                  <FieldLabel htmlFor={`${formId}-${name}`}>
                    {t(`leaveRequests.fields.${name}`)}
                    <span aria-hidden='true' className='text-destructive'>
                      *
                    </span>
                  </FieldLabel>
                  <Input
                    {...field}
                    id={`${formId}-${name}`}
                    type='date'
                    aria-required='true'
                    aria-invalid={fieldState.invalid}
                  />
                  <FieldError errors={[fieldState.error]} />
                </Field>
              )}
            />
          ))}
        </div>
        {days !== undefined && days >= 1 ? (
          <p className='text-sm text-muted-foreground' aria-live='polite'>
            {t('leaveRequests.form.daysPreview', { count: days })}
          </p>
        ) : null}
        <Controller
          control={form.control}
          name='reason'
          render={({ field, fieldState }) => (
            <Field data-invalid={fieldState.invalid}>
              <FieldLabel htmlFor={`${formId}-reason`}>
                {t('leaveRequests.fields.reason')}
              </FieldLabel>
              <Textarea
                {...field}
                id={`${formId}-reason`}
                rows={3}
                aria-invalid={fieldState.invalid}
              />
              <FieldDescription>
                {t('leaveRequests.form.reasonHint')}
              </FieldDescription>
              <FieldError errors={[fieldState.error]} />
            </Field>
          )}
        />
      </FieldGroup>
    </form>
  );
}
