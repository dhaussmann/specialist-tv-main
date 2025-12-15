'use client';

import { useState, useEffect, useCallback } from 'react';
import { Comment, Video } from '../types';
import { useSession } from 'next-auth/react';

// Helper function to format time ago
function formatTimeAgo(date: string): string {
  const now = new Date();
  const past = new Date(date);
  const diffMs = now.getTime() - past.getTime();
  const diffMins = Math.floor(diffMs / (1000 * 60));
  const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
  const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));
  
  if (diffMins < 1) return 'just now';
  if (diffMins < 60) return `${diffMins} minute${diffMins > 1 ? 's' : ''} ago`;
  if (diffHours < 24) return `${diffHours} hour${diffHours > 1 ? 's' : ''} ago`;
  return `${diffDays} day${diffDays > 1 ? 's' : ''} ago`;
}

interface VideoCommentsProps {
  video: Video;
}

interface CommentItemProps {
  comment: Comment;
  onReply: (parentId: string) => void;
  onEdit: (comment: Comment) => void;
  onDelete: (commentId: string) => void;
  currentUser?: string;
  level?: number;
}

export function VideoComments({ video }: VideoCommentsProps) {
  const { data: session, status } = useSession();
  const [comments, setComments] = useState<Comment[]>([]);
  const [newComment, setNewComment] = useState('');
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const [editingComment, setEditingComment] = useState<Comment | null>(null);
  const [editContent, setEditContent] = useState('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [commentCount, setCommentCount] = useState(0);

  const loadComments = useCallback(async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/videos/${video.id}/comments`);
      if (response.ok) {
        const data = await response.json() as { comments: Comment[]; count: number };
        setComments(data.comments || []);
        setCommentCount(data.count || 0);
      }
    } catch (error) {
      console.error('Failed to load comments:', error);
    } finally {
      setLoading(false);
    }
  }, [video.id]);

  // Load comments on mount
  useEffect(() => {
    loadComments();
  }, [loadComments]);

  const handleSubmitComment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newComment.trim() || status !== 'authenticated' || submitting || !session) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/videos/${video.id}/comments`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({
          content: newComment.trim(),
          parent_id: replyingTo,
        }),
      });

      if (response.ok) {
        setNewComment('');
        setReplyingTo(null);
        await loadComments(); // Reload comments
      } else {
        console.error('Failed to submit comment');
      }
    } catch (error) {
      console.error('Error submitting comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleEditComment = async (commentId: string, content: string) => {
    if (status !== 'authenticated' || submitting || !session) return;

    try {
      setSubmitting(true);
      const response = await fetch(`/api/videos/${video.id}/comments/${commentId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        credentials: 'same-origin',
        body: JSON.stringify({ content }),
      });

      if (response.ok) {
        setEditingComment(null);
        setEditContent('');
        await loadComments();
      } else {
        console.error('Failed to edit comment');
      }
    } catch (error) {
      console.error('Error editing comment:', error);
    } finally {
      setSubmitting(false);
    }
  };

  const handleDeleteComment = async (commentId: string) => {
    if (status !== 'authenticated' || !session || !confirm('Are you sure you want to delete this comment?')) return;

    try {
      const response = await fetch(`/api/videos/${video.id}/comments/${commentId}`, {
        method: 'DELETE',
        credentials: 'same-origin',
      });

      if (response.ok) {
        await loadComments();
      } else {
        console.error('Failed to delete comment');
      }
    } catch (error) {
      console.error('Error deleting comment:', error);
    }
  };

  const handleReply = (parentId: string) => {
    setReplyingTo(parentId);
    setEditingComment(null);
  };

  const handleEdit = (comment: Comment) => {
    setEditingComment(comment);
    setEditContent(comment.content);
    setReplyingTo(null);
  };

  const handleUpdateComment = async () => {
    if (editingComment) {
      await handleEditComment(editingComment.id, editContent);
    }
  };

  const cancelEdit = () => {
    setEditingComment(null);
    setEditContent('');
  };

  const cancelReply = () => {
    setReplyingTo(null);
    setNewComment('');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  return (
    <div className="bg-white rounded-lg shadow-sm border border-gray-200 p-6">
      {/* Comments Header */}
      <div className="flex items-center justify-between mb-6">
        <h3 className="text-lg font-semibold text-gray-900">
          Comments ({commentCount})
        </h3>
      </div>

      <div className="space-y-6">
        {/* New Comment Form */}
        {status === 'authenticated' ? (
          <form onSubmit={handleSubmitComment} className="space-y-3">
            <div>
              <label htmlFor="comment" className="sr-only">
                Add a comment
              </label>
              <textarea
                id="comment"
                rows={3}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm text-gray-900 placeholder-gray-500 px-3 py-2 resize-none"
                placeholder={replyingTo ? "Write a reply..." : "Add a comment..."}
                value={newComment}
                onChange={(e) => setNewComment(e.target.value)}
                disabled={submitting}
              />
            </div>
            <div className="flex items-center justify-between">
              {replyingTo && (
                <button
                  type="button"
                  onClick={cancelReply}
                  className="text-sm text-gray-500 hover:text-gray-700"
                >
                  Cancel Reply
                </button>
              )}
              <button
                type="submit"
                disabled={!newComment.trim() || submitting}
                className="ml-auto inline-flex items-center px-4 py-2 border border-transparent text-sm font-medium rounded-md shadow-sm text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {submitting ? 'Posting...' : replyingTo ? 'Reply' : 'Comment'}
              </button>
            </div>
          </form>
        ) : (
          <div className="text-center py-4 bg-gray-50 rounded-lg">
            <p className="text-gray-600">Please log in to leave a comment.</p>
          </div>
        )}

        {/* Comments List */}
        <div className="space-y-4">
          {comments.length === 0 ? (
            <div className="text-center py-8 text-gray-500">
              <div className="text-4xl mb-2">💬</div>
              <p>No comments yet. Be the first to comment!</p>
            </div>
          ) : (
            comments.map((comment) => (
              <CommentItem
                key={comment.id}
                comment={comment}
                onReply={handleReply}
                onEdit={handleEdit}
                onDelete={handleDeleteComment}
                currentUser={session?.user?.name || undefined}
                level={0}
              />
            ))
          )}
        </div>

        {/* Edit Comment Modal */}
        {editingComment && (
          <div className="fixed inset-0 bg-black bg-opacity-30 backdrop-blur-sm flex items-center justify-center z-50" onClick={cancelEdit}>
            <div className="bg-white rounded-lg shadow-xl p-6 w-full max-w-md mx-4 transform transition-all" onClick={(e) => e.stopPropagation()}>
              <h3 className="text-lg font-medium text-gray-900 mb-4">Edit Comment</h3>
              <textarea
                rows={3}
                className="block w-full rounded-md border-gray-300 shadow-sm focus:border-blue-500 focus:ring-blue-500 sm:text-sm mb-4 text-gray-900 placeholder-gray-500 px-3 py-2 resize-none"
                value={editContent}
                onChange={(e) => setEditContent(e.target.value)}
                disabled={submitting}
                placeholder="Edit your comment..."
              />
              <div className="flex justify-end space-x-3">
                <button
                  type="button"
                  onClick={cancelEdit}
                  className="px-4 py-2 text-sm font-medium text-gray-700 bg-gray-100 rounded-md hover:bg-gray-200"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleUpdateComment}
                  disabled={!editContent.trim() || submitting}
                  className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  {submitting ? 'Saving...' : 'Save'}
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function CommentItem({ comment, onReply, onEdit, onDelete, currentUser, level = 0 }: CommentItemProps) {
  const isOwner = currentUser === comment.created_by;
  const maxLevel = 3; // Maximum nesting level

  return (
    <div className={`${level > 0 ? 'ml-8 border-l-2 border-gray-200 pl-4' : ''}`}>
      <div className="bg-white border border-gray-200 rounded-lg p-4">
        {/* Comment Header */}
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center space-x-2">
            <div className="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center text-white text-sm font-medium">
              {comment.created_by.charAt(0).toUpperCase()}
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900">{comment.created_by}</p>
              <p className="text-xs text-gray-500">
                {formatTimeAgo(comment.created_at)}
                {comment.updated_at !== comment.created_at && (
                  <span className="ml-1">(edited)</span>
                )}
              </p>
            </div>
          </div>
          
          {/* Comment Actions */}
          {isOwner && (
            <div className="flex items-center space-x-2">
              <button
                onClick={() => onEdit(comment)}
                className="text-xs text-gray-500 hover:text-blue-600"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(comment.id)}
                className="text-xs text-gray-500 hover:text-red-600"
              >
                Delete
              </button>
            </div>
          )}
        </div>

        {/* Comment Content */}
        <div className="mb-3">
          <p className="text-gray-800 whitespace-pre-wrap">{comment.content}</p>
        </div>

        {/* Reply Button */}
        {level < maxLevel && (
          <button
            onClick={() => onReply(comment.id)}
            className="text-xs text-blue-600 hover:text-blue-800 font-medium"
          >
            Reply
          </button>
        )}
      </div>

      {/* Nested Replies */}
      {comment.replies && comment.replies.length > 0 && (
        <div className="mt-3 space-y-3">
          {comment.replies.map((reply) => (
            <CommentItem
              key={reply.id}
              comment={reply}
              onReply={onReply}
              onEdit={onEdit}
              onDelete={onDelete}
              currentUser={currentUser}
              level={level + 1}
            />
          ))}
        </div>
      )}
    </div>
  );
}
