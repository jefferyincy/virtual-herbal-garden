import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';

const attemptSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    quizId: { type: Schema.Types.ObjectId, ref: 'Quiz', required: true, index: true },
    score: { type: Number, required: true, min: 0 },
    total: { type: Number, required: true, min: 0 },
    answers: [
      {
        _id: false,
        questionId: { type: Schema.Types.ObjectId, required: true },
        chosenIndex: { type: Number, required: true },
        correct: { type: Boolean, required: true },
      },
    ],
    secondsTaken: { type: Number, default: 0 },
    xpAwarded: { type: Number, default: 0 },
  },
  { timestamps: true },
);

// Attempt history for one learner on one quiz, newest first.
attemptSchema.index({ userId: 1, quizId: 1, createdAt: -1 });

export type AttemptDoc = ModelDoc<typeof attemptSchema>;
export const Attempt = model<AttemptDoc>('Attempt', attemptSchema);
