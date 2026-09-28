import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';
import { EXPERIENCE_LEVELS, USER_ROLES } from './enums.ts';

const streakSchema = new Schema(
  {
    current: { type: Number, default: 0 },
    longest: { type: Number, default: 0 },
    lastActiveAt: { type: Date, default: null },
  },
  { _id: false },
);

const badgeAwardSchema = new Schema(
  {
    key: { type: String, required: true },
    earnedAt: { type: Date, required: true },
  },
  { _id: false },
);

const userSchema = new Schema(
  {
    name: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    passwordHash: { type: String, required: true, select: false },
    role: { type: String, enum: USER_ROLES, default: 'student' },
    xp: { type: Number, default: 0, min: 0 },
    level: { type: Number, default: 1, min: 1 },
    streak: { type: streakSchema, default: () => ({}) },
    badges: { type: [badgeAwardSchema], default: [] },
    followedPlants: [{ type: Schema.Types.ObjectId, ref: 'Plant' }],
    interests: [String],
    experience: { type: String, enum: EXPERIENCE_LEVELS, default: 'beginner' },
    // Derived from `name` at registration. Its unique index is what makes the public
    // profile route `/u/:handle` stable: one account per handle, forever.
    handle: { type: String, required: true, unique: true, lowercase: true, trim: true },
    bio: { type: String, default: '', maxlength: 280 },
    banned: { type: Boolean, default: false },
  },
  { timestamps: true },
);

export type UserDoc = ModelDoc<typeof userSchema>;
export const User = model<UserDoc>('User', userSchema);
