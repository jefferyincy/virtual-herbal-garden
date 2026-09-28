import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';
import { POST_STATUSES, POST_TYPES } from './enums.ts';

const postSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    type: { type: String, enum: POST_TYPES, required: true },
    title: { type: String, required: true, trim: true, maxlength: 160 },
    body: { type: String, required: true },
    plantIds: [{ type: Schema.Types.ObjectId, ref: 'Plant' }],
    sources: {
      type: [String],
      default: [],
      validate: {
        // The create-post form marks sources required for remedies ("Remedies must cite a
        // source"); the server refuses to store an uncited remedy even via the API.
        validator(this: { type: string }, value: string[]): boolean {
          return this.type !== 'remedy' || value.length > 0;
        },
        message: 'Remedies must cite at least one source',
      },
    },
    status: { type: String, enum: POST_STATUSES, default: 'pending' },
    reviewerId: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    reviewerNote: { type: String, default: null },
    upvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
  },
  { timestamps: true },
);

// Moderation queue: newest-first per status.
postSchema.index({ status: 1, createdAt: -1 });
// A learner's own posts, newest first.
postSchema.index({ userId: 1, createdAt: -1 });

export type PostDoc = ModelDoc<typeof postSchema>;
export const Post = model<PostDoc>('Post', postSchema);
