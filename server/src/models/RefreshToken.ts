import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';

/**
 * Server-side refresh-token state.
 *
 * The spec's collection list (build-pack section 2.3) predates the auth design it also
 * requires: section 2.6 demands refresh rotation with reuse detection, and a replayed token
 * is only distinguishable from a fresh one against server-side state. This collection supplies
 * exactly that state - one document per issued refresh token - and nothing else.
 */
const refreshTokenSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    // sha256 of the raw JWT. A dump of this collection must not hand out usable sessions.
    tokenHash: { type: String, required: true, unique: true },
    // Rotation family: every token descended from one login. Reuse of any member revokes all.
    familyId: { type: String, required: true, index: true },
    expiresAt: { type: Date, required: true },
    revokedAt: { type: Date, default: null },
    // Set when this token was rotated, which makes a later presentation provably a replay.
    replacedByHash: { type: String, default: null },
    userAgent: { type: String, default: '' },
  },
  { timestamps: true },
);

// TTL index so expired rows do not accumulate. Mongo's sweeper runs about once a minute, so
// rotateRefreshToken still checks expiresAt itself rather than trusting the index.
refreshTokenSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

export type RefreshTokenDoc = ModelDoc<typeof refreshTokenSchema>;

export const RefreshToken = model<RefreshTokenDoc>('RefreshToken', refreshTokenSchema);
