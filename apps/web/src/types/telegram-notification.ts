export type TelegramNotificationSettings = {
  enabled: boolean;
  hasBotToken: boolean;
  recipientChatIds: string[];
  bandwidthThresholdPercent: number;
  creditThresholdPercent: number;
  updatedAt: string;
};

export type TelegramNotificationLogStatus = 'PENDING' | 'SENT' | 'FAILED' | 'SKIPPED';

export type TelegramNotificationLog = {
  id: string;
  status: TelegramNotificationLogStatus;
  message: string;
  recipients: string[];
  linkedAccountId: string | null;
  accountLabel: string | null;
  teamSlug: string | null;
  quotaKind: string | null;
  usedPercent: number | null;
  errorMessage: string | null;
  sentAt: string | null;
  createdAt: string;
};
