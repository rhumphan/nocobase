import fileUi from '../extensions/nocobase-file-component-ui/locales/en-US.js';
import type { LocaleResource } from '@nocobase/i18n';

import systemEnUS from './system/en-US.js';

const enUS = {
  // The template's own copy: the shell, the sign-in pages, shared components and the homepage. Keep it in
  // `./system/` so a template upgrade can replace it without touching the application's copy below.
  ...systemEnUS,
  ...fileUi,
  // The application's copy goes here, one group per feature. A shared group such as `navigation` is extended by
  // spreading the system one first, `navigation: { ...systemEnUS.navigation, orders: 'Orders' }`, since a group
  // written here replaces the system group of the same name rather than merging with it.
  navigation: { ...systemEnUS.navigation, leaveRequests: 'Leave requests' },
  actions: { ...systemEnUS.actions, signInAgain: 'Sign in again' },
  'status.sessionExpired': 'Your session has ended. Sign in again to continue.',
  leaveRequests: {
    title: 'Leave requests',
    description: 'Request time off and follow each decision.',
    unknownUser: 'Unknown user',
    capNotice: 'Showing the newest {{count}} requests.',
    daysValue_one: '{{count}} day',
    daysValue_other: '{{count}} days',
    types: {
      annual: 'Annual leave',
      sick: 'Sick leave',
      unpaid: 'Unpaid leave',
    },
    status: {
      pending: 'Pending',
      approved: 'Approved',
      rejected: 'Rejected',
      cancelled: 'Cancelled',
    },
    fields: {
      requester: 'Requester',
      leaveType: 'Leave type',
      period: 'Period',
      startDate: 'First day',
      endDate: 'Last day',
      days: 'Days',
      reason: 'Reason',
      status: 'Status',
      createdAt: 'Requested',
      decidedBy: 'Decided by',
      decidedAt: 'Decided',
      decisionNote: 'Decision note',
    },
    filters: {
      status: 'Filter by status',
      allStatuses: 'All statuses',
      clear: 'Clear filter',
    },
    create: {
      action: 'Request leave',
      title: 'Request leave',
      description: 'Your request waits for a leave approver to decide.',
      submit: 'Submit request',
      submitting: 'Submitting…',
      success: 'Leave request submitted.',
    },
    form: {
      startRequired: 'Choose the first day.',
      endRequired: 'Choose the last day.',
      endBeforeStart: 'The last day is before the first day.',
      tooLong: 'A request covers at most {{max}} days.',
      reasonTooLong: 'Keep the reason under {{max}} characters.',
      reasonHint: 'Optional. The approver sees it.',
      invalid: 'Check this field.',
      daysPreview_one: 'This request covers {{count}} calendar day.',
      daysPreview_other: 'This request covers {{count}} calendar days.',
    },
    empty: {
      title: 'No leave requests yet',
      description: 'Requests you can see appear here.',
      noResults: 'No requests have this status.',
    },
    error: {
      title: 'Unable to load leave requests',
      requestFailed: 'The request failed. Try again.',
      forbidden: 'You do not have permission to do this.',
      notFound: 'This leave request does not exist, or you cannot see it.',
    },
    detail: {
      page: 'Leave request details',
      title: 'Leave request #{{id}}',
      progress: 'Progress',
      history: 'History',
      diagramLabel: 'Leave request lifecycle',
      end: 'End',
      noteHint: 'Optional when approving, required when rejecting.',
      noteRequired: 'Give a reason for the rejection.',
    },
    transitions: {
      approve: 'Approve',
      reject: 'Reject',
      cancel: 'Cancel request',
    },
    transitionDone: {
      approve: 'Request approved.',
      reject: 'Request rejected.',
      cancel: 'Request cancelled.',
    },
    history: {
      create: 'Requested',
      approve: 'Approved',
      reject: 'Rejected',
      cancel: 'Cancelled',
    },
    blockers: {
      ownRequest: 'You cannot decide on your own request.',
      requesterOnly: 'Only the requester can cancel this request.',
      permissionDenied: 'You do not have permission to do this.',
      other: 'This action is not available.',
    },
    conflict:
      'This request changed since you opened it, so it was reloaded. Check it and decide again.',
    permissions: {
      section: 'Leave',
      resource: 'Leave requests',
      collection: 'Leave requests',
      mine: 'Requests I made',
      view: 'View requests',
      create: 'Request leave',
      cancel: 'Cancel own requests',
      decide: 'Approve or reject requests',
    },
    roles: { employee: 'Employee', approver: 'Leave approver' },
  },
};

/**
 * The shape every locale of this application follows, derived from the English wording above.
 *
 * Anything a plugin does not translate falls back to this namespace, so a term defined here is reused everywhere
 * without each plugin repeating it.
 */
export type AppResource = LocaleResource<typeof enUS>;

export default enUS;
