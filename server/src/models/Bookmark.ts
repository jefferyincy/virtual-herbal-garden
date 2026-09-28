import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';

const bookmarkSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    plantId: { type: Schema.Types.ObjectId, ref: 'Plant', required: true },
    note: { type: String, default: '' },
  },
  { timestamps: true },
);

// A learner bookmarks a plant once; re-bookmarking overwrites the note.
bookmarkSchema.index({ userId: 1, plantId: 1 }, { unique: true });

export type BookmarkDoc = ModelDoc<typeof bookmarkSchema>;
export const Bookmark = model<BookmarkDoc>('Bookmark', bookmarkSchema);
