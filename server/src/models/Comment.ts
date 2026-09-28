import { Schema, model } from 'mongoose';
import type { ModelDoc } from './types.ts';

const commentSchema = new Schema(
  {
    postId: { type: Schema.Types.ObjectId, ref: 'Post', required: true, index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true },
    body: { type: String, required: true, maxlength: 2000 },
    upvotes: [{ type: Schema.Types.ObjectId, ref: 'User' }],
    markedUseful: { type: Boolean, default: false },
    // Threaded replies: the post view renders reply rows under their parent comment.
    parentId: { type: Schema.Types.ObjectId, ref: 'Comment', default: null },
  },
  { timestamps: true },
);

commentSchema.index({ postId: 1, createdAt: 1 });

export type CommentDoc = ModelDoc<typeof commentSchema>;
export const Comment = model<CommentDoc>('Comment', commentSchema);
