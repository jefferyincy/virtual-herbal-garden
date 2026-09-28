import type { ReactNode } from 'react';
import { useMemo, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { Icon } from '@/components/icons';
import { Breadcrumb } from '@/components/ui/Breadcrumb';
import { Button } from '@/components/ui/Button';
import { Chip } from '@/components/ui/Chip';
import { Dropdown } from '@/components/ui/Dropdown';
import { EmptyState } from '@/components/ui/EmptyState';
import { ErrorState } from '@/components/ui/ErrorState';
import { LoadingScreen } from '@/components/ui/LoadingScreen';
import { Modal } from '@/components/ui/Modal';
import { Textarea } from '@/components/ui/Textarea';
import { Tooltip } from '@/components/ui/Tooltip';
import { useToast } from '@/components/ui/Toast';
import { Avatar } from '@/components/ui/Avatar';
import { PlantReferenceCard } from '@/components/plant/PlantReferenceCard';
import {
  apiErrorMessage,
  useComment,
  useModeratePost,
  usePost,
  useUpvoteComment,
  useUpvotePost,
  type PostComment,
} from '@/features/community/hooks';
import { ApiError } from '@/lib/api';
import { cn } from '@/lib/cn';
import { formatNumber, formatRelative } from '@/lib/format';
import { useSession } from '@/stores/session';
import type { PostType } from '@/types/api';

const TYPE_LABEL: Record<PostType, string> = {
  remedy: 'Remedy',
  question: 'Question',
  note: 'Note',
};

const TYPE_TONE: Record<PostType, 'accent' | 'clay' | 'neutral'> = {
  remedy: 'accent',
  question: 'clay',
  note: 'neutral',
};

type ModerationAction = 'approve' | 'reject' | 'request_changes';

/** The composer is addressed by id because `Textarea` exposes no ref. */
const COMPOSER_ID = 'post-comment-composer';

const MODERATION_COPY: Record<ModerationAction, { title: string; description: string }> = {
  approve: {
    title: 'Approve this post?',
    description: 'It becomes visible in the public feed immediately.',
  },
  request_changes: {
    title: 'Request changes',
    description: 'The post returns to pending and the author is told what to revise.',
  },
  reject: {
    title: 'Reject this post',
    description: 'The post is hidden from the feed and the author is told why.',
  },
};

export default function PostPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const { push } = useToast();
  const currentUser = useSession((s) => s.user);

  const query = usePost(id);
  const post = query.data?.post;
  // The route sends the thread beside the post, not inside it.
  const comments = query.data?.comments ?? [];

  const comment = useComment(id);
  const upvotePost = useUpvotePost();
  const upvoteComment = useUpvoteComment();
  const moderate = useModeratePost();

  const [draft, setDraft] = useState('');
  const [replyTo, setReplyTo] = useState<{ id: string; name: string } | null>(null);
  const [reportOpen, setReportOpen] = useState(false);
  const [moderationAction, setModerationAction] = useState<ModerationAction | null>(null);
  const [reviewerNote, setReviewerNote] = useState('');

  // One level of nesting: a reply whose parent is itself a reply attaches to the reply's parent,
  // so the thread can never grow deeper than the two rows the prompt describes.
  const { roots, repliesByParent } = useMemo(() => {
    const byParent = new Map<string, PostComment[]>();
    const top: PostComment[] = [];
    const ids = new Set(comments.map((entry) => entry._id));

    for (const entry of comments) {
      const parent = entry.parentId;
      if (!parent || !ids.has(parent)) top.push(entry);
      else {
        const bucket = byParent.get(parent);
        if (bucket) bucket.push(entry);
        else byParent.set(parent, [entry]);
      }
    }
    return { roots: top, repliesByParent: byParent };
  }, [comments]);

  const backTarget = post?.type === 'question' ? '/community?type=question' : '/community';

  const focusComposer = (parent: { id: string; name: string } | null) => {
    setReplyTo(parent);
    // The design-system Textarea does not forward a ref, so the composer is focused by id.
    document.getElementById(COMPOSER_ID)?.focus();
  };

  const submitComment = () => {
    const body = draft.trim();
    if (body.length === 0 || !id) return;
    comment.mutate(
      { body, ...(replyTo ? { parentId: replyTo.id } : {}) },
      {
        onSuccess: () => {
          setDraft('');
          setReplyTo(null);
        },
        onError: (error) => {
          push({ variant: 'danger', title: "Couldn't post comment", description: apiErrorMessage(error) });
        },
      },
    );
  };

  const sharePost = async () => {
    if (!post) return;
    const url = window.location.href;
    try {
      await navigator.clipboard.writeText(url);
      push({ variant: 'success', title: 'Link copied', description: 'Share it wherever you like.' });
    } catch {
      // Clipboard access is denied outside a secure context; naming the URL lets the user copy it.
      push({ variant: 'warning', title: "Couldn't copy the link", description: url });
    }
  };

  const runModeration = (action: ModerationAction, note: string) => {
    if (!id) return;
    moderate.mutate(
      { id, action, ...(note ? { note } : {}) },
      {
        onSuccess: () => {
          setModerationAction(null);
          setReviewerNote('');
        },
        onError: (error) => {
          push({ variant: 'danger', title: 'Moderation failed', description: apiErrorMessage(error) });
        },
      },
    );
  };

  if (query.isPending) return <LoadingScreen label="Loading post" />;

  if (query.isError) {
    const notFound = isNotFound(query.error);
    return notFound ? (
      <PostNotFound onBack={() => navigate('/community')} />
    ) : (
      <ErrorState
        title="Couldn't load this post"
        message={apiErrorMessage(query.error)}
        onRetry={() => void query.refetch()}
      />
    );
  }

  if (!post || !id) {
    return <PostNotFound onBack={() => navigate('/community')} />;
  }

  const author = post.author;
  const canModerate = query.data?.canModerate ?? false;
  const isOwn = currentUser !== null && author !== null && author._id === currentUser._id;
  const noteRequired =
    moderationAction === 'reject' || moderationAction === 'request_changes';

  return (
    <div className="mx-auto flex w-full max-w-[720px] flex-col gap-6">
      <div className="flex items-center gap-3">
        <Link
          to={backTarget}
          aria-label="Back to the feed"
          className="grid size-11 shrink-0 place-items-center rounded-btn text-fg-secondary transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="arrow-left" size={20} />
        </Link>
        <Breadcrumb
          items={[
            { label: 'Community', to: '/community' },
            { label: post.title },
          ]}
        />
      </div>

      <article className="flex flex-col gap-4">
        <div className="flex items-center gap-3">
          {author ? (
            <Link
              to={`/u/${author.handle}`}
              className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
            >
              <Avatar name={author.name} level={author.level} size={40} />
            </Link>
          ) : (
            <Avatar name="Deleted user" size={40} />
          )}
          <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
            {author ? (
              <Link
                to={`/u/${author.handle}`}
                className="text-small font-medium text-fg transition-colors duration-100 ease-base hover:text-accent-400"
              >
                {author.name}
              </Link>
            ) : (
              <span className="text-small font-medium text-fg-muted">Deleted user</span>
            )}
            <span className="mono-label">{formatRelative(post.createdAt)}</span>
            <Chip tone={TYPE_TONE[post.type]}>{TYPE_LABEL[post.type]}</Chip>
            {post.expertApproved && (
              <span className="inline-flex items-center gap-1 text-micro text-accent-400">
                <Icon name="check-circle" size={14} />
                Expert approved
              </span>
            )}
            {post.status === 'pending' && isOwn && <Chip tone="warning">Awaiting review</Chip>}
            {post.status === 'rejected' && isOwn && <Chip tone="danger">Rejected</Chip>}
          </div>

          {canModerate && (
            <div className="ml-auto">
              <Dropdown
                trigger={
                  <span className="inline-flex h-11 items-center gap-2 rounded-btn border border-line-strong px-3 text-small text-fg transition-colors duration-100 ease-base hover:bg-bg-hover">
                    Moderate
                    <Icon name="chevron-down" size={14} />
                  </span>
                }
                items={[
                  { label: 'Approve', icon: 'check-circle', onSelect: () => setModerationAction('approve') },
                  {
                    label: 'Request changes',
                    icon: 'pencil',
                    onSelect: () => setModerationAction('request_changes'),
                  },
                  {
                    label: 'Reject',
                    icon: 'x-circle',
                    danger: true,
                    onSelect: () => setModerationAction('reject'),
                  },
                ]}
              />
            </div>
          )}
        </div>

        <h1 className="text-h1 text-fg">{post.title}</h1>

        <p className="reading-measure whitespace-pre-wrap text-body-lg text-fg">{post.body}</p>

        {post.plantIds.length > 0 && (
          <div className="flex flex-col gap-3">
            {post.plantIds.map((plant) => (
              // `PlantReferenceCard` requires an `images` array; the server omits the key for a
              // plant with no photograph, so the empty array is the honest normalisation.
              <PlantReferenceCard key={plant.slug} plant={{ ...plant, images: plant.images ?? [] }} />
            ))}
          </div>
        )}

        {/* Sources are the exact strings the server stored - no prettifying, no invention. */}
        {post.sources.length > 0 && (
          <div className="flex flex-col gap-2">
            <h2 className="mono-label">Sources</h2>
            <ul className="flex flex-col gap-1">
              {post.sources.map((source) => (
                <li key={source}>
                  <a
                    href={source}
                    target="_blank"
                    rel="noreferrer noopener"
                    className="inline-flex items-center gap-1.5 break-all rounded-micro text-small text-fg-secondary transition-colors duration-100 ease-base hover:text-accent-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
                  >
                    <Icon name="external-link" size={14} className="shrink-0" />
                    {source}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}

        {canModerate && post.reviewerNote && (
          <p className="rounded-card border border-line-subtle bg-bg-surface p-3 text-small text-fg-secondary">
            <span className="mono-label mr-2">Reviewer note</span>
            {post.reviewerNote}
          </p>
        )}

        <div className="flex flex-wrap items-center gap-1 border-y border-line-subtle py-1">
          <button
            type="button"
            aria-pressed={upvotePost.data?.upvoted ?? false}
            disabled={upvotePost.isPending || isOwn}
            onClick={() =>
              upvotePost.mutate(post._id, {
                onError: (error) =>
                  push({ variant: 'warning', title: "Couldn't upvote", description: apiErrorMessage(error) }),
              })
            }
            className={cn(
              'inline-flex h-11 items-center gap-2 rounded-btn px-3 text-small transition-colors duration-100 ease-base disabled:cursor-not-allowed disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow',
              upvotePost.data?.upvoted ? 'text-accent-400' : 'text-fg-secondary hover:bg-bg-hover hover:text-fg',
            )}
          >
            <Icon name="arrow-up" size={16} />
            <span className="font-mono">{formatNumber(post.upvoteCount)}</span>
            <span className="sr-only">Upvote this post</span>
          </button>

          <button
            type="button"
            onClick={() => void sharePost()}
            className="inline-flex h-11 items-center gap-2 rounded-btn px-3 text-small text-fg-secondary transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            <Icon name="share" size={16} />
            Share
          </button>

          {/* Bookmarking has no endpoint in this pass - disabled with a reason, never a silent
              no-op. */}
          <Tooltip content="Bookmarking is not available yet" side="top">
            <button
              type="button"
              disabled
              aria-label="Bookmark (not available yet)"
              className="inline-flex h-11 items-center rounded-btn px-3 text-fg-disabled"
            >
              <Icon name="bookmark" size={16} />
            </button>
          </Tooltip>

          <button
            type="button"
            onClick={() => setReportOpen(true)}
            className="ml-auto inline-flex h-11 items-center rounded-btn px-3 text-small text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            Report
          </button>
        </div>
      </article>

      <section className="flex flex-col gap-4" aria-label="Comments">
        <h2 className="text-h2 text-fg">
          Comments <span className="mono-label align-middle">{formatNumber(comments.length)}</span>
        </h2>

        <div className="flex flex-col gap-2">
          {replyTo && (
            <span className="inline-flex w-fit items-center gap-2 rounded-full bg-accent-tint px-3 py-1 text-small text-accent-400">
              Replying to {replyTo.name}
              <button
                type="button"
                aria-label="Clear reply target"
                onClick={() => setReplyTo(null)}
                className="rounded-full p-0.5 transition-colors duration-100 ease-base hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
              >
                <Icon name="close" size={14} />
              </button>
            </span>
          )}
          <Textarea
            id={COMPOSER_ID}
            label={replyTo ? `Reply to ${replyTo.name}` : 'Add a comment'}
            placeholder="Share what you know - cite a source if you can."
            rows={4}
            value={draft}
            maxLength={2000}
            counter={{ value: draft.length, max: 2000 }}
            onChange={(event) => setDraft(event.target.value)}
          />
          <div className="flex justify-end">
            <Button
              variant="primary"
              loading={comment.isPending}
              disabled={draft.trim().length === 0}
              onClick={submitComment}
            >
              Post comment
            </Button>
          </div>
        </div>

        {comments.length === 0 ? (
          <EmptyState
            title="No comments yet"
            description="Be the first to add context, a correction or a question."
            watermark="message"
          />
        ) : (
          <ul className="flex flex-col gap-5">
            {roots.map((root) => (
              <li key={root._id} className="flex flex-col gap-3">
                <CommentRow
                  comment={root}
                  onReply={() =>
                    focusComposer({ id: root._id, name: root.author?.name ?? 'this comment' })
                  }
                  onUpvote={(commentId) =>
                    upvoteComment.mutate(commentId, {
                      onError: (error) =>
                        push({
                          variant: 'warning',
                          title: "Couldn't upvote",
                          description: apiErrorMessage(error),
                        }),
                    })
                  }
                />
                {(repliesByParent.get(root._id) ?? []).map((reply) => (
                  <div key={reply._id} className="ml-6 border-l border-line-subtle pl-4">
                    <CommentRow
                      comment={reply}
                      onReply={() =>
                        focusComposer({ id: root._id, name: reply.author?.name ?? 'this comment' })
                      }
                      onUpvote={(commentId) =>
                        upvoteComment.mutate(commentId, {
                          onError: (error) =>
                            push({
                              variant: 'warning',
                              title: "Couldn't upvote",
                              description: apiErrorMessage(error),
                            }),
                        })
                      }
                    />
                  </div>
                ))}
              </li>
            ))}
          </ul>
        )}
      </section>

      <Modal
        open={reportOpen}
        onClose={() => setReportOpen(false)}
        title="Report this post"
        description="Reports are read by the moderator team."
        footer={
          <Button variant="secondary" onClick={() => setReportOpen(false)}>
            Close
          </Button>
        }
      >
        <p className="text-body text-fg-secondary">
          Reporting is not yet wired to a queue: this pass ships no report endpoint, so nothing is
          filed when you close this dialog. Use the moderation note on a review, or contact a
          moderator directly, if a post needs urgent attention.
        </p>
      </Modal>

      <Modal
        open={moderationAction !== null}
        onClose={() => {
          setModerationAction(null);
          setReviewerNote('');
        }}
        title={moderationAction ? MODERATION_COPY[moderationAction].title : ''}
        description={moderationAction ? MODERATION_COPY[moderationAction].description : undefined}
        footer={
          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              onClick={() => {
                setModerationAction(null);
                setReviewerNote('');
              }}
            >
              Cancel
            </Button>
            <Button
              variant={moderationAction === 'reject' ? 'danger' : 'primary'}
              loading={moderate.isPending}
              // The server rejects a missing note for reject/request_changes, so the buttons stay
              // disabled until one exists rather than failing on submit.
              disabled={noteRequired && reviewerNote.trim().length === 0}
              onClick={() =>
                moderationAction && runModeration(moderationAction, reviewerNote.trim())
              }
            >
              {moderationAction === 'approve' ? 'Approve' : 'Send decision'}
            </Button>
          </div>
        }
      >
        <div className="flex flex-col gap-2">
          <Textarea
            label={noteRequired ? 'Reviewer note (required)' : 'Reviewer note (optional)'}
            rows={4}
            value={reviewerNote}
            maxLength={1000}
            counter={{ value: reviewerNote.length, max: 1000 }}
            onChange={(event) => setReviewerNote(event.target.value)}
          />
          {noteRequired && reviewerNote.trim().length === 0 && (
            <p className="text-small text-fg-muted">
              A note is required so the author knows what to change.
            </p>
          )}
        </div>
      </Modal>
    </div>
  );
}

function CommentRow({
  comment,
  onReply,
  onUpvote,
}: {
  comment: PostComment;
  onReply: () => void;
  onUpvote: (commentId: string) => void;
}): ReactNode {
  const author = comment.author;

  return (
    <div
      className={cn(
        'relative flex flex-col gap-2 pl-3',
        // Marked-useful rows get the accent bar AND the mono label - colour is never the only cue.
        comment.markedUseful && 'pl-[calc(0.75rem+3px)]',
      )}
    >
      {comment.markedUseful && (
        <span aria-hidden="true" className="absolute inset-y-0 left-0 w-[3px] bg-accent-500" />
      )}

      <div className="flex items-center gap-2">
        {author ? (
          <Link
            to={`/u/${author.handle}`}
            className="rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
          >
            <Avatar name={author.name} level={author.level} size={24} />
          </Link>
        ) : (
          <Avatar name="Deleted user" size={24} />
        )}
        {author ? (
          <Link
            to={`/u/${author.handle}`}
            className="text-small font-medium text-fg transition-colors duration-100 ease-base hover:text-accent-400"
          >
            {author.name}
          </Link>
        ) : (
          <span className="text-small font-medium text-fg-muted">Deleted user</span>
        )}
        {comment.markedUseful && <span className="mono-label text-accent-400">Marked as useful</span>}
        {comment.parentId && <span className="mono-label">Reply</span>}
      </div>

      <p className="reading-measure whitespace-pre-wrap text-body text-fg-secondary">{comment.body}</p>

      <div className="flex items-center gap-1">
        <button
          type="button"
          onClick={onReply}
          className="inline-flex h-9 items-center gap-1.5 rounded-btn px-2 text-small text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="message" size={14} />
          Reply
        </button>
        <button
          type="button"
          onClick={() => onUpvote(comment._id)}
          className="inline-flex h-9 items-center gap-1.5 rounded-btn px-2 text-small text-fg-muted transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="arrow-up" size={14} />
          <span className="font-mono">{formatNumber(comment.upvoteCount)}</span>
          <span className="sr-only">Upvote this comment</span>
        </button>
        <span className="mono-label">{formatRelative(comment.createdAt)}</span>
      </div>
    </div>
  );
}

function PostNotFound({ onBack }: { onBack: () => void }): ReactNode {
  return (
    <div className="mx-auto w-full max-w-[720px]">
      <div className="mb-4 flex items-center gap-3">
        <Link
          to="/community"
          aria-label="Back to the feed"
          className="grid size-11 place-items-center rounded-btn text-fg-secondary transition-colors duration-100 ease-base hover:bg-bg-hover hover:text-fg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent-glow"
        >
          <Icon name="arrow-left" size={20} />
        </Link>
        <Breadcrumb items={[{ label: 'Community', to: '/community' }, { label: 'Post' }]} />
      </div>
      <EmptyState
        title="Post not found"
        description="It may have been removed, or it is still awaiting review and is not public yet."
        action={
          <Button variant="secondary" onClick={onBack}>
            Back to the feed
          </Button>
        }
      />
    </div>
  );
}

/**
 * The route answers 404 for a pending post the caller may not read, so that state renders as
 * "Post not found" rather than a retryable failure.
 */
function isNotFound(error: Error): boolean {
  return error instanceof ApiError && error.status === 404;
}
