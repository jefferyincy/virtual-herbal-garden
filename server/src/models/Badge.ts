import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';
import { BADGE_ACTIONS } from './enums.ts';

const badgeSchema = new Schema(
  {
    key: { type: String, required: true, unique: true },
    name: { type: String, required: true },
    description: { type: String, default: '' },
    criteria: {
      _id: false,
      action: { type: String, enum: BADGE_ACTIONS, required: true },
      target: { type: Number, required: true },
      param: { type: String, default: null },
    },
    xpReward: { type: Number, default: 0 },
    // IconName from the client icon set.
    icon: { type: String, default: 'award' },
    active: { type: Boolean, default: true },
  },
  { timestamps: true },
);

export type BadgeDoc = ModelDoc<typeof badgeSchema>;
export const Badge = model<BadgeDoc>('Badge', badgeSchema);
