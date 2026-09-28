import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';
import { NOTIFICATION_TYPES } from './enums.ts';

/**
 * In-app notification inbox. The build spec's collection list predates the screens that read it:
 * the notifications-inbox mockup shows grouped rows tinted by `type`, a badge-unlock row with an
 * inline badge link, and moderation outcomes, all of which need a per-user inbox document.
 */
const notificationSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    type: { type: String, enum: NOTIFICATION_TYPES, required: true },
    title: { type: String, required: true },
    body: { type: String, default: '' },
    read: { type: Boolean, default: false },
    href: { type: String, default: null },
    badgeKey: { type: String, default: null },
  },
  { timestamps: true },
);

// The inbox is always read newest-first for one user, unread filter first.
notificationSchema.index({ userId: 1, read: 1, createdAt: -1 });

export type NotificationDoc = ModelDoc<typeof notificationSchema>;
export const Notification = model<NotificationDoc>('Notification', notificationSchema);
