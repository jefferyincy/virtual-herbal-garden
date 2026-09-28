import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';
import { QUIZ_DIFFICULTIES } from './enums.ts';

const quizSchema = new Schema(
  {
    family: { type: String, required: true, index: true },
    title: { type: String, required: true },
    difficulty: { type: String, enum: QUIZ_DIFFICULTIES, required: true, index: true },
    plantIds: [{ type: Schema.Types.ObjectId, ref: 'Plant' }],
    // 0 means untimed.
    timeLimitSec: { type: Number, default: 0 },
    questions: [
      {
        stem: { type: String, required: true },
        options: {
          type: [String],
          validate: {
            validator(options: string[]): boolean {
              return options.length >= 2;
            },
            message: 'a quiz question needs at least two options',
          },
        },
        answerIndex: {
          type: Number,
          required: true,
          validate: {
            validator(this: { options: string[] }, value: number): boolean {
              return Array.isArray(this.options) && value >= 0 && value < this.options.length;
            },
            message: 'answerIndex must point at one of the question options',
          },
        },
        explanation: { type: String, default: '' },
        plantId: { type: Schema.Types.ObjectId, ref: 'Plant', default: null },
      },
    ],
    published: { type: Boolean, default: false, index: true },
  },
  { timestamps: true },
);

export type QuizDoc = ModelDoc<typeof quizSchema>;
export const Quiz = model<QuizDoc>('Quiz', quizSchema);
