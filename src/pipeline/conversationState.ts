import type { ConversationTurn, ConversationContext } from '../types/index.js';
import { config } from '../config/index.js';

/**
 * Manages conversation state and history
 */
class ConversationManager {
    private conversations: Map<string, ConversationContext> = new Map();

    /**
     * Get or create a conversation context
     */
    getContext(sessionId: string): ConversationContext {
        let context = this.conversations.get(sessionId);

        if (!context) {
            context = {
                sessionId,
                history: [],
            };
            this.conversations.set(sessionId, context);
        }

        return context;
    }

    /**
     * Add a turn to the conversation history
     */
    addTurn(sessionId: string, role: 'user' | 'assistant', content: string): void {
        const context = this.getContext(sessionId);

        context.history.push({
            role,
            content,
            timestamp: Date.now(),
        });

        // Keep only the last N turns
        const maxTurns = config.conversation.maxHistoryTurns * 2; // user + assistant pairs
        if (context.history.length > maxTurns) {
            context.history = context.history.slice(-maxTurns);
        }
    }

    /**
     * Get conversation history
     */
    getHistory(sessionId: string): ConversationTurn[] {
        return this.getContext(sessionId).history;
    }

    /**
     * Get the last user query (for context)
     */
    getLastUserQuery(sessionId: string): string | null {
        const history = this.getHistory(sessionId);
        const lastUserTurn = [...history].reverse().find(t => t.role === 'user');
        return lastUserTurn?.content || null;
    }

    /**
     * Get the last assistant response
     */
    getLastAssistantResponse(sessionId: string): string | null {
        const history = this.getHistory(sessionId);
        const lastAssistantTurn = [...history].reverse().find(t => t.role === 'assistant');
        return lastAssistantTurn?.content || null;
    }

    /**
     * Clear conversation history
     */
    clearHistory(sessionId: string): void {
        const context = this.getContext(sessionId);
        context.history = [];
    }

    /**
     * Delete a conversation entirely
     */
    deleteConversation(sessionId: string): void {
        this.conversations.delete(sessionId);
    }

    /**
     * Get all active session IDs
     */
    getActiveSessions(): string[] {
        return Array.from(this.conversations.keys());
    }

    /**
     * Format history for LLM context
     */
    formatForLLM(sessionId: string): Array<{ role: 'user' | 'assistant'; content: string }> {
        return this.getHistory(sessionId).map(turn => ({
            role: turn.role,
            content: turn.content,
        }));
    }
}

// Singleton instance
let conversationManager: ConversationManager | null = null;

/**
 * Get the conversation manager singleton
 */
export function getConversationManager(): ConversationManager {
    if (!conversationManager) {
        conversationManager = new ConversationManager();
    }
    return conversationManager;
}

/**
 * Shorthand methods
 */
export function getContext(sessionId: string): ConversationContext {
    return getConversationManager().getContext(sessionId);
}

export function addUserTurn(sessionId: string, content: string): void {
    getConversationManager().addTurn(sessionId, 'user', content);
}

export function addAssistantTurn(sessionId: string, content: string): void {
    getConversationManager().addTurn(sessionId, 'assistant', content);
}
