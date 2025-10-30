/**
 * Comments Module
 * Handles display, threading, and interaction with shader comments
 */

import { state } from './core.js';
import * as backend from './backend.js';

let currentShaderComments = [];
let commentsSubscription = null;

/**
 * Initialize the comments panel for a shader
 */
export async function loadCommentsForShader(shader) {
    const commentsPanel = document.getElementById('commentsPanel');
    if (!commentsPanel) return;

    // Clear existing
    commentsPanel.innerHTML = '';

    if (!shader || !shader.id) {
        showEmptyState('No shader selected');
        return;
    }

    // Show shader info at top
    const header = document.createElement('div');
    header.style.cssText = 'padding: 10px; border-bottom: 1px solid var(--border-color); background: var(--bg-secondary);';
    header.innerHTML = `
        <div style="font-size: 12px; color: var(--text-secondary); margin-bottom: 4px;">Comments for:</div>
        <div style="font-size: 14px; font-weight: 500; color: var(--text-primary);">${shader.title || 'Untitled'}</div>
    `;
    commentsPanel.appendChild(header);

    // Comments list container
    const listContainer = document.createElement('div');
    listContainer.id = 'commentsListContainer';
    listContainer.style.cssText = 'flex: 1; overflow-y: auto; padding: 10px;';
    commentsPanel.appendChild(listContainer);

    // Add comment form (if logged in)
    if (state.currentUser) {
        const form = createCommentForm(shader.id);
        commentsPanel.appendChild(form);
    } else {
        const loginPrompt = document.createElement('div');
        loginPrompt.style.cssText = 'padding: 10px; border-top: 1px solid var(--border-color); text-align: center; color: var(--text-secondary); font-size: 12px;';
        loginPrompt.textContent = 'Sign in to comment';
        commentsPanel.appendChild(loginPrompt);
    }

    // Load comments
    await refreshComments(shader.id);

    // Subscribe to real-time updates
    backend.subscribeToComments(shader.id, () => {
        refreshComments(shader.id);
    });
}

/**
 * Refresh the comments list
 */
async function refreshComments(shaderId) {
    const result = await backend.loadComments(shaderId);
    
    if (result.success) {
        currentShaderComments = result.comments || [];
        renderComments();
    } else {
        console.error('Failed to load comments:', result.error);
    }
}

/**
 * Render comments with threading
 */
function renderComments() {
    const container = document.getElementById('commentsListContainer');
    if (!container) return;

    container.innerHTML = '';

    if (currentShaderComments.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'text-align: center; padding: 40px 20px; color: var(--text-secondary); font-size: 14px;';
        empty.innerHTML = `
            <div style="font-size: 32px; margin-bottom: 10px;">💬</div>
            <div>No comments yet</div>
            <div style="font-size: 12px; margin-top: 5px;">Be the first to share your thoughts!</div>
        `;
        container.appendChild(empty);
        return;
    }

    // Build comment tree (top-level comments first)
    const topLevelComments = currentShaderComments.filter(c => !c.parent_comment_id);
    
    topLevelComments.forEach(comment => {
        const commentEl = renderComment(comment, 0);
        container.appendChild(commentEl);
        
        // Render replies recursively
        renderReplies(comment.id, container, 1);
    });
}

/**
 * Render a single comment
 */
function renderComment(comment, depth) {
    const commentDiv = document.createElement('div');
    commentDiv.className = 'comment-item';
    commentDiv.style.cssText = `
        margin-bottom: 12px;
        padding: 10px;
        background: var(--bg-secondary);
        border-radius: 6px;
        border-left: 3px solid ${depth > 0 ? 'var(--border-color)' : 'var(--accent-color)'};
        margin-left: ${depth * 20}px;
    `;
    commentDiv.dataset.commentId = comment.id;

    // Header (username, timestamp, actions)
    const header = document.createElement('div');
    header.style.cssText = 'display: flex; align-items: center; justify-content: space-between; margin-bottom: 6px;';
    
    const userInfo = document.createElement('div');
    userInfo.style.cssText = 'display: flex; align-items: center; gap: 8px; font-size: 11px; color: var(--text-secondary);';
    
    const username = document.createElement('span');
    username.style.cssText = 'font-weight: 500; color: var(--text-primary);';
    username.textContent = comment.user_display_name || 'Anonymous';
    
    const timestamp = document.createElement('span');
    timestamp.textContent = formatTimestamp(comment.created_at);
    
    userInfo.appendChild(username);
    userInfo.appendChild(timestamp);
    header.appendChild(userInfo);

    // Actions
    const actions = document.createElement('div');
    actions.style.cssText = 'display: flex; gap: 8px;';
    
    // Reply button (if logged in)
    if (state.currentUser) {
        const replyBtn = document.createElement('button');
        replyBtn.textContent = '↩️';
        replyBtn.title = 'Reply';
        replyBtn.style.cssText = 'background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.6; transition: opacity 0.2s;';
        replyBtn.onmouseover = () => replyBtn.style.opacity = '1';
        replyBtn.onmouseout = () => replyBtn.style.opacity = '0.6';
        replyBtn.onclick = () => showReplyForm(comment);
        actions.appendChild(replyBtn);
    }
    
    // Delete button (if owner)
    if (state.currentUser && comment.user_id === state.currentUser.id) {
        const deleteBtn = document.createElement('button');
        deleteBtn.textContent = '🗑️';
        deleteBtn.title = 'Delete';
        deleteBtn.style.cssText = 'background: none; border: none; cursor: pointer; font-size: 14px; opacity: 0.6; transition: opacity 0.2s;';
        deleteBtn.onmouseover = () => deleteBtn.style.opacity = '1';
        deleteBtn.onmouseout = () => deleteBtn.style.opacity = '0.6';
        deleteBtn.onclick = () => deleteComment(comment.id);
        actions.appendChild(deleteBtn);
    }
    
    header.appendChild(actions);
    commentDiv.appendChild(header);

    // Comment text (rendered as markdown)
    const textDiv = document.createElement('div');
    textDiv.className = 'comment-text';
    textDiv.style.cssText = 'font-size: 13px; line-height: 1.5; color: var(--text-primary); word-wrap: break-word;';
    
    // Render markdown if marked.js is available
    if (typeof marked !== 'undefined') {
        textDiv.innerHTML = marked.parse(comment.comment_text || '');
    } else {
        textDiv.textContent = comment.comment_text || '';
    }
    
    commentDiv.appendChild(textDiv);

    return commentDiv;
}

/**
 * Render replies recursively
 */
function renderReplies(parentId, container, depth) {
    const replies = currentShaderComments.filter(c => c.parent_comment_id === parentId);
    
    replies.forEach(reply => {
        const replyEl = renderComment(reply, depth);
        container.appendChild(replyEl);
        
        // Render nested replies
        renderReplies(reply.id, container, depth + 1);
    });
}

/**
 * Create the add comment form
 */
function createCommentForm(shaderId, parentCommentId = null) {
    const form = document.createElement('div');
    form.id = parentCommentId ? `replyForm-${parentCommentId}` : 'mainCommentForm';
    form.style.cssText = `
        padding: 10px;
        border-top: 1px solid var(--border-color);
        background: var(--bg-primary);
        ${parentCommentId ? 'margin-left: 20px; border-left: 3px solid var(--accent-color); margin-bottom: 10px;' : ''}
    `;

    if (parentCommentId) {
        const replyHeader = document.createElement('div');
        replyHeader.style.cssText = 'font-size: 11px; color: var(--text-secondary); margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center;';
        replyHeader.innerHTML = `
            <span>Replying...</span>
            <button onclick="this.closest('[id^=replyForm]').remove()" style="background: none; border: none; cursor: pointer; color: var(--text-secondary); font-size: 16px;">✕</button>
        `;
        form.appendChild(replyHeader);
    }

    const textarea = document.createElement('textarea');
    textarea.placeholder = parentCommentId ? 'Write a reply... (Markdown supported)' : 'Add a comment... (Markdown supported)';
    textarea.style.cssText = `
        width: 100%;
        min-height: 60px;
        padding: 8px;
        background: var(--bg-secondary);
        color: var(--text-primary);
        border: 1px solid var(--border-color);
        border-radius: 4px;
        font-size: 13px;
        font-family: inherit;
        resize: vertical;
        box-sizing: border-box;
    `;

    const buttonContainer = document.createElement('div');
    buttonContainer.style.cssText = 'display: flex; gap: 8px; margin-top: 6px; align-items: center;';

    const submitBtn = document.createElement('button');
    submitBtn.textContent = parentCommentId ? 'Reply' : 'Comment';
    submitBtn.style.cssText = `
        padding: 6px 12px;
        background: var(--accent-color);
        color: white;
        border: none;
        border-radius: 4px;
        font-size: 12px;
        cursor: pointer;
        transition: opacity 0.2s;
    `;
    submitBtn.onmouseover = () => submitBtn.style.opacity = '0.9';
    submitBtn.onmouseout = () => submitBtn.style.opacity = '1';
    submitBtn.onclick = async () => {
        const text = textarea.value.trim();
        if (!text) return;

        submitBtn.disabled = true;
        submitBtn.textContent = 'Posting...';

        const result = await backend.addComment(shaderId, text, parentCommentId);
        
        if (result.success) {
            textarea.value = '';
            if (parentCommentId) {
                form.remove(); // Remove reply form after successful reply
            }
        } else {
            alert('Failed to post comment: ' + result.error);
        }

        submitBtn.disabled = false;
        submitBtn.textContent = parentCommentId ? 'Reply' : 'Comment';
    };

    const markdownHint = document.createElement('span');
    markdownHint.style.cssText = 'font-size: 10px; color: var(--text-secondary); margin-left: auto;';
    markdownHint.textContent = 'Markdown supported: **bold** *italic* `code`';

    buttonContainer.appendChild(submitBtn);
    buttonContainer.appendChild(markdownHint);

    form.appendChild(textarea);
    form.appendChild(buttonContainer);

    return form;
}

/**
 * Show reply form below a comment
 */
function showReplyForm(comment) {
    // Remove any existing reply forms
    document.querySelectorAll('[id^=replyForm-]').forEach(f => f.remove());

    // Create reply form
    const form = createCommentForm(comment.shader_id, comment.id);
    
    // Insert after the comment
    const commentEl = document.querySelector(`[data-comment-id="${comment.id}"]`);
    if (commentEl) {
        commentEl.after(form);
        form.querySelector('textarea').focus();
    }
}

/**
 * Delete a comment
 */
async function deleteComment(commentId) {
    if (!confirm('Delete this comment?')) return;

    const result = await backend.deleteComment(commentId);
    
    if (!result.success) {
        alert('Failed to delete comment: ' + result.error);
    }
    // Real-time subscription will auto-refresh the list
}

/**
 * Format timestamp as relative time
 */
function formatTimestamp(timestamp) {
    const date = new Date(timestamp);
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return 'just now';
    if (diffMins < 60) return `${diffMins}m ago`;
    if (diffHours < 24) return `${diffHours}h ago`;
    if (diffDays < 7) return `${diffDays}d ago`;
    
    return date.toLocaleDateString();
}

/**
 * Show empty state
 */
function showEmptyState(message) {
    const commentsPanel = document.getElementById('commentsPanel');
    if (!commentsPanel) return;

    commentsPanel.innerHTML = `
        <div style="display: flex; flex-direction: column; align-items: center; justify-content: center; height: 100%; color: var(--text-secondary); text-align: center; padding: 20px;">
            <div style="font-size: 48px; margin-bottom: 10px;">💬</div>
            <div style="font-size: 14px;">${message}</div>
        </div>
    `;
}

/**
 * Cleanup when switching away from comments
 */
export function unloadComments() {
    backend.unsubscribeFromComments();
    currentShaderComments = [];
}

