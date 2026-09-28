import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';

/**
 * Single-use password-reset tokens.
 *
 * The spec's collection list (build-pack section 2.3) predates the reset flow that the same
 * spec requires (`POST /api/auth/reset`). The `users` document is fixed by the contract and
 * must not grow unlisted fields, so reset state gets its own collection - it is also the only
 * correct modelling: multiple outstanding resets and a revocable, expiring record.
 */
const passwordResetSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // sha256 of the raw reset token; the raw value only ever exists in the emailed link.
    tokenHash: { type: String, required: true, unique: true },
    expiresAt: { type: Date, required: true },
    usedAt: { type: Date, default: null },
  },
  { timestamps: true },
);

// Expired resets are worthless; let Mongo reap them.
passwordResetSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type PasswordResetDoc = ModelDoc<typeof passwordResetSchema>;

export const PasswordReset = model<PasswordResetDoc>('PasswordReset', passwordResetSchema);
