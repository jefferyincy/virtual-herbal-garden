import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';

const lessonSchema = new Schema(
  {
    plantId: { type: Schema.Types.ObjectId, ref: 'Plant', default: null, index: true },
    slug: { type: String, required: true, unique: true, lowercase: true },
    title: { type: String, required: true },
    body: { type: String, required: true },
    order: { type: Number, default: 0, index: true },
    estMinutes: { type: Number, default: 5 },
    published: { type: Boolean, default: true },
    // The lesson reader shows a section TOC rail with "3 of 7" progress, so lessons are
    // grouped into sections; null marks a standalone lesson that sits outside any track.
    section: { type: String, default: null },
  },
  { timestamps: true },
);

export type LessonDoc = ModelDoc<typeof lessonSchema>;
export const Lesson = model<LessonDoc>('Lesson', lessonSchema);
