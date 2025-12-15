import { Comment } from '../types';

export class CommentsAPI {
  constructor(private env: CloudflareEnv) {}

  // Generate unique comment ID
  private generateId(): string {
    return crypto.randomUUID();
  }

  // Create a new comment
  async createComment(
    videoId: string, 
    content: string, 
    createdBy: string, 
    parentId?: string
  ): Promise<{ success: boolean; message: string; comment?: Comment }> {
    try {
      const commentId = this.generateId();
      const now = new Date().toISOString();

      // Validate video exists
      const video = await this.env.DB.prepare(`
        SELECT id FROM videos WHERE id = ?
      `).bind(videoId).first();

      if (!video) {
        return { success: false, message: 'Video not found' };
      }

      // If parent_id is provided, validate parent comment exists
      if (parentId) {
        const parentComment = await this.env.DB.prepare(`
          SELECT id FROM comments WHERE id = ? AND video_id = ?
        `).bind(parentId, videoId).first();

        if (!parentComment) {
          return { success: false, message: 'Parent comment not found' };
        }
      }

      // Insert comment
      await this.env.DB.prepare(`
        INSERT INTO comments (id, video_id, parent_id, content, created_by, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).bind(commentId, videoId, parentId || null, content, createdBy, now, now).run();

      // Fetch the created comment
      const newComment = await this.getComment(commentId);

      return {
        success: true,
        message: 'Comment created successfully',
        comment: newComment!
      };

    } catch (error) {
      console.error('Failed to create comment:', error);
      return { success: false, message: 'Failed to create comment' };
    }
  }

  // Get a single comment by ID
  async getComment(commentId: string): Promise<Comment | null> {
    const result = await this.env.DB.prepare(`
      SELECT * FROM comments WHERE id = ?
    `).bind(commentId).first();

    if (!result) return null;

    return this.mapComment(result);
  }

  // Get comments for a video (with threading)
  async getVideoComments(videoId: string): Promise<Comment[]> {
    // Get all comments for the video
    const result = await this.env.DB.prepare(`
      SELECT * FROM comments 
      WHERE video_id = ? 
      ORDER BY created_at ASC
    `).bind(videoId).all();

    const comments = result.results.map(row => this.mapComment(row));
    
    // Build threaded structure
    return this.buildCommentTree(comments);
  }

  // Update a comment (only content and updated_at)
  async updateComment(
    commentId: string, 
    content: string, 
    userId: string
  ): Promise<{ success: boolean; message: string; comment?: Comment }> {
    try {
      // Check if comment exists and user owns it
      const existingComment = await this.env.DB.prepare(`
        SELECT created_by FROM comments WHERE id = ?
      `).bind(commentId).first();

      if (!existingComment) {
        return { success: false, message: 'Comment not found' };
      }

      if (existingComment.created_by !== userId) {
        return { success: false, message: 'Not authorized to edit this comment' };
      }

      // Update comment
      const now = new Date().toISOString();
      await this.env.DB.prepare(`
        UPDATE comments SET content = ?, updated_at = ? WHERE id = ?
      `).bind(content, now, commentId).run();

      // Fetch updated comment
      const updatedComment = await this.getComment(commentId);

      return {
        success: true,
        message: 'Comment updated successfully',
        comment: updatedComment!
      };

    } catch (error) {
      console.error('Failed to update comment:', error);
      return { success: false, message: 'Failed to update comment' };
    }
  }

  // Delete a comment
  async deleteComment(
    commentId: string, 
    userId: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Check if comment exists and user owns it
      const existingComment = await this.env.DB.prepare(`
        SELECT created_by FROM comments WHERE id = ?
      `).bind(commentId).first();

      if (!existingComment) {
        return { success: false, message: 'Comment not found' };
      }

      if (existingComment.created_by !== userId) {
        return { success: false, message: 'Not authorized to delete this comment' };
      }

      // Delete comment and all its replies (CASCADE should handle this)
      await this.env.DB.prepare(`
        DELETE FROM comments WHERE id = ?
      `).bind(commentId).run();

      return {
        success: true,
        message: 'Comment deleted successfully'
      };

    } catch (error) {
      console.error('Failed to delete comment:', error);
      return { success: false, message: 'Failed to delete comment' };
    }
  }

  // Get comment count for a video
  async getCommentCount(videoId: string): Promise<number> {
    const result = await this.env.DB.prepare(`
      SELECT COUNT(*) as count FROM comments WHERE video_id = ?
    `).bind(videoId).first();

    return result ? Number(result.count) : 0;
  }

  // Helper method to map database row to Comment interface
  private mapComment(row: Record<string, unknown>): Comment {
    return {
      id: row.id as string,
      video_id: row.video_id as string,
      parent_id: row.parent_id as string | undefined,
      content: row.content as string,
      created_by: row.created_by as string,
      created_at: row.created_at as string,
      updated_at: row.updated_at as string,
    };
  }

  // Helper method to build threaded comment structure
  private buildCommentTree(comments: Comment[]): Comment[] {
    const commentMap = new Map<string, Comment>();
    const rootComments: Comment[] = [];

    // First pass: create map and initialize replies arrays
    comments.forEach(comment => {
      comment.replies = [];
      commentMap.set(comment.id, comment);
    });

    // Second pass: build tree structure
    comments.forEach(comment => {
      if (comment.parent_id) {
        const parent = commentMap.get(comment.parent_id);
        if (parent) {
          parent.replies!.push(comment);
        }
      } else {
        rootComments.push(comment);
      }
    });

    return rootComments;
  }
}
