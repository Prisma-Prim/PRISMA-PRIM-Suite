import type { PaymentPosition } from '../payment/payment.cursor.js';

import type { InvoicePosition } from '../invoice-record/invoice-record.cursor.js';

import type { FollowUpPosition } from '../opportunity-follow-up/opportunity-follow-up.cursor.js';

/** Synthetic token bytes verified with the original codecs at main1795044. */

export const BASELINE_KEY =
  '01234567-89ab-4cde-8fab-0123456789abfedcba98-7654-4321-8abc-fedcba987654';

export const BASELINE_BINDING = {
  workspaceId: '00000000-0000-4000-8000-000000000001',
  companyId: '00000000-0000-4000-8000-000000000002',
  actorMembershipId: '00000000-0000-4000-8000-000000000003',
  readCapture: 'read-capture.synthetic.v1',
};

export const BASELINE_PAYMENT_CURSORS = [
  {
    position: {
      kind: 'history',
      paymentId: '00000000-0000-4000-8000-000000000004',
      headRevision: 28,
      before: 4,
    },
    token:
      'eyJmb3JtYXQiOiJQQVlNRU5UX0NVUlNPUi8xIiwiYmluZGluZyI6eyJ3b3Jrc3BhY2VJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSIsImNvbXBhbnlJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMiIsImFjdG9yTWVtYmVyc2hpcElkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAzIiwicmVhZENhcHR1cmUiOiJyZWFkLWNhcHR1cmUuc3ludGhldGljLnYxIn0sInBvc2l0aW9uIjp7ImtpbmQiOiJoaXN0b3J5IiwicGF5bWVudElkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA0IiwiaGVhZFJldmlzaW9uIjoyOCwiYmVmb3JlIjo0fX0.Toys9Cm5EqN7fj8zxypI8LNOKENy148ci69SWeduBLg',
  },
  {
    position: {
      kind: 'inventory',
      createdAt: '2026-11-07T12:34:56.789Z',
      id: '00000000-0000-4000-8000-000000000004',
    },
    token:
      'eyJmb3JtYXQiOiJQQVlNRU5UX0NVUlNPUi8xIiwiYmluZGluZyI6eyJ3b3Jrc3BhY2VJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSIsImNvbXBhbnlJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMiIsImFjdG9yTWVtYmVyc2hpcElkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAzIiwicmVhZENhcHR1cmUiOiJyZWFkLWNhcHR1cmUuc3ludGhldGljLnYxIn0sInBvc2l0aW9uIjp7ImtpbmQiOiJpbnZlbnRvcnkiLCJjcmVhdGVkQXQiOiIyMDI2LTExLTA3VDEyOjM0OjU2Ljc4OVoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwNCJ9fQ.f5gI6ihuW0XcHEU2aqQlR5PSLrUsdXTVLznNO6UD1R0',
  },
  {
    position: {
      kind: 'source',
      source: {
        documentId: '00000000-0000-4000-8000-000000000007',
        documentVersionId: '00000000-0000-4000-8000-000000000008',
        representationId: '00000000-0000-4000-8000-000000000009',
      },
    },
    token:
      'eyJmb3JtYXQiOiJQQVlNRU5UX0NVUlNPUi8xIiwiYmluZGluZyI6eyJ3b3Jrc3BhY2VJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSIsImNvbXBhbnlJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMiIsImFjdG9yTWVtYmVyc2hpcElkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAzIiwicmVhZENhcHR1cmUiOiJyZWFkLWNhcHR1cmUuc3ludGhldGljLnYxIn0sInBvc2l0aW9uIjp7ImtpbmQiOiJzb3VyY2UiLCJzb3VyY2UiOnsiZG9jdW1lbnRJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwNyIsImRvY3VtZW50VmVyc2lvbklkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA4IiwicmVwcmVzZW50YXRpb25JZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwOSJ9fX0.DIqeq5iY1i_ewznQQRx5QqW4xQHZsvTGjvBVxmQr8hM',
  },
] satisfies { position: PaymentPosition; token: string }[];

export const BASELINE_INVOICE_CURSORS = [
  {
    position: {
      kind: 'history',
      recordId: '00000000-0000-4000-8000-000000000005',
      headRevision: 27,
      before: 3,
    },
    token:
      'eyJmb3JtYXQiOiJFWFRFUk5BTF9JTlZPSUNFX0NVUlNPUi8xIiwiYmluZGluZyI6eyJ3b3Jrc3BhY2VJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSIsImNvbXBhbnlJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMiIsImFjdG9yTWVtYmVyc2hpcElkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAzIiwicmVhZENhcHR1cmUiOiJyZWFkLWNhcHR1cmUuc3ludGhldGljLnYxIn0sInBvc2l0aW9uIjp7ImtpbmQiOiJoaXN0b3J5IiwicmVjb3JkSWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDUiLCJoZWFkUmV2aXNpb24iOjI3LCJiZWZvcmUiOjN9fQ.zhnCRP7a6KkN6jVEuGNAekgOys1v4IEQSatVMmlanNk',
  },
  {
    position: {
      kind: 'inventory',
      createdAt: '2026-11-07T12:34:56.789Z',
      id: '00000000-0000-4000-8000-000000000005',
    },
    token:
      'eyJmb3JtYXQiOiJFWFRFUk5BTF9JTlZPSUNFX0NVUlNPUi8xIiwiYmluZGluZyI6eyJ3b3Jrc3BhY2VJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSIsImNvbXBhbnlJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMiIsImFjdG9yTWVtYmVyc2hpcElkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAzIiwicmVhZENhcHR1cmUiOiJyZWFkLWNhcHR1cmUuc3ludGhldGljLnYxIn0sInBvc2l0aW9uIjp7ImtpbmQiOiJpbnZlbnRvcnkiLCJjcmVhdGVkQXQiOiIyMDI2LTExLTA3VDEyOjM0OjU2Ljc4OVoiLCJpZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwNSJ9fQ.NNNNS-wQCC6jwIUm0kwWJxX8wu1W4Aa1igKbuUns_VQ',
  },
  {
    position: {
      kind: 'source',
      source: {
        documentId: '00000000-0000-4000-8000-000000000007',
        documentVersionId: '00000000-0000-4000-8000-000000000008',
        representationId: '00000000-0000-4000-8000-000000000009',
      },
    },
    token:
      'eyJmb3JtYXQiOiJFWFRFUk5BTF9JTlZPSUNFX0NVUlNPUi8xIiwiYmluZGluZyI6eyJ3b3Jrc3BhY2VJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMSIsImNvbXBhbnlJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMiIsImFjdG9yTWVtYmVyc2hpcElkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDAzIiwicmVhZENhcHR1cmUiOiJyZWFkLWNhcHR1cmUuc3ludGhldGljLnYxIn0sInBvc2l0aW9uIjp7ImtpbmQiOiJzb3VyY2UiLCJzb3VyY2UiOnsiZG9jdW1lbnRJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwNyIsImRvY3VtZW50VmVyc2lvbklkIjoiMDAwMDAwMDAtMDAwMC00MDAwLTgwMDAtMDAwMDAwMDAwMDA4IiwicmVwcmVzZW50YXRpb25JZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwOSJ9fX0.ixI7pEnD53w3kRUVTyhR3iMqgDwpsLc7FNYmaJF6WwQ',
  },
] satisfies { position: InvoicePosition; token: string }[];

export const BASELINE_FOLLOW_UP_CURSORS = [
  {
    position: {
      kind: 'history',
      opportunityId: '00000000-0000-4000-8000-000000000006',
      headRevision: 28,
      before: 4,
    },
    token:
      'eyJmb3JtYXQiOiJvcHBvcnR1bml0eS1mb2xsb3ctdXAtY3Vyc29yLnYxIiwid29ya3NwYWNlSWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJjb21wYW55SWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDIiLCJhY3Rvck1lbWJlcnNoaXBJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMyIsInJlYWRDYXB0dXJlIjoicmVhZC1jYXB0dXJlLnN5bnRoZXRpYy52MSIsImtpbmQiOiJoaXN0b3J5Iiwib3Bwb3J0dW5pdHlJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwNiIsImhlYWRSZXZpc2lvbiI6MjgsImJlZm9yZSI6NH0.akFOss5N6qzhzpFS3V2kzzATMaLb1mosXw8YCY2qc7s',
  },
  {
    position: {
      kind: 'discovery',
      through: '2026-11-15',
      date: '2026-11-14',
      opportunityId: '00000000-0000-4000-8000-000000000006',
    },
    token:
      'eyJmb3JtYXQiOiJvcHBvcnR1bml0eS1mb2xsb3ctdXAtY3Vyc29yLnYxIiwid29ya3NwYWNlSWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDEiLCJjb21wYW55SWQiOiIwMDAwMDAwMC0wMDAwLTQwMDAtODAwMC0wMDAwMDAwMDAwMDIiLCJhY3Rvck1lbWJlcnNoaXBJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwMyIsInJlYWRDYXB0dXJlIjoicmVhZC1jYXB0dXJlLnN5bnRoZXRpYy52MSIsImtpbmQiOiJkaXNjb3ZlcnkiLCJ0aHJvdWdoIjoiMjAyNi0xMS0xNSIsImRhdGUiOiIyMDI2LTExLTE0Iiwib3Bwb3J0dW5pdHlJZCI6IjAwMDAwMDAwLTAwMDAtNDAwMC04MDAwLTAwMDAwMDAwMDAwNiJ9.sB_T7V3YkVMwsoNK6y7n-yoWoPLdJu56FigaF2UcXxE',
  },
] satisfies { position: FollowUpPosition; token: string }[];
