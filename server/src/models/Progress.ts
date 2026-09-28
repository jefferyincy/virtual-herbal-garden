import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';

const srsSchema = new Schema(
  {
    ease: { type: Number, default: 2.5 },
    intervalDays: { type: Number, default: 0 },
    // A freshly created card is due immediately.
    dueAt: { type: Date, default: () => new Date() },
    reps: { type: Number, default: 0 },
    lapses: { type: Number, default: 0 },
  },
  { _id: false },
);

const progressSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    plantId: { type: Schema.Types.ObjectId, ref: 'Plant', required: true },
    read: { type: Boolean, default: false },
    mastery: { type: Number, default: 0, min: 0, max: 5 },
    srs: { type: srsSchema, default: () => ({}) },
  },
  { timestamps: true },
);

// One progress row per (learner, plant) - the upsert key for every read/flashcard write.
progressSchema.index({ userId: 1, plantId: 1 }, { unique: true });
// The due-flashcard query: dueAt ordered for one learner.
progressSchema.index({ userId: 1, 'srs.dueAt': 1 });

export type ProgressDoc = ModelDoc<typeof progressSchema>;
export const Progress = model<ProgressDoc>('Progress', progressSchema);
