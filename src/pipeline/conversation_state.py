"""
Voice AI Assistant - Conversation State Manager
Manages conversation history and context for query rewriting
"""

from typing import List, Dict, Optional
from dataclasses import dataclass, field
import time

from src.config import config


@dataclass
class ConversationTurn:
    """A single turn in the conversation"""
    role: str  # 'user' or 'assistant'
    content: str
    timestamp: float = field(default_factory=time.time)


@dataclass
class ConversationContext:
    """Context for a conversation session"""
    session_id: str
    history: List[ConversationTurn] = field(default_factory=list)


class ConversationManager:
    """Manages conversation state and history"""
    
    def __init__(self):
        self.conversations: Dict[str, ConversationContext] = {}
    
    def get_context(self, session_id: str) -> ConversationContext:
        """Get or create a conversation context"""
        if session_id not in self.conversations:
            self.conversations[session_id] = ConversationContext(session_id=session_id)
        return self.conversations[session_id]
    
    def add_turn(self, session_id: str, role: str, content: str) -> None:
        """Add a turn to the conversation history"""
        context = self.get_context(session_id)
        
        context.history.append(ConversationTurn(
            role=role,
            content=content,
            timestamp=time.time()
        ))
        
        # Keep only the last N turns
        max_turns = config.conversation.max_history_turns * 2  # user + assistant pairs
        if len(context.history) > max_turns:
            context.history = context.history[-max_turns:]
    
    def get_history(self, session_id: str) -> List[Dict]:
        """Get conversation history as list of dicts"""
        context = self.get_context(session_id)
        return [
            {"role": turn.role, "content": turn.content}
            for turn in context.history
        ]
    
    def get_last_user_query(self, session_id: str) -> Optional[str]:
        """Get the last user query"""
        context = self.get_context(session_id)
        for turn in reversed(context.history):
            if turn.role == "user":
                return turn.content
        return None
    
    def get_last_assistant_response(self, session_id: str) -> Optional[str]:
        """Get the last assistant response"""
        context = self.get_context(session_id)
        for turn in reversed(context.history):
            if turn.role == "assistant":
                return turn.content
        return None
    
    def clear_history(self, session_id: str) -> None:
        """Clear conversation history"""
        if session_id in self.conversations:
            self.conversations[session_id].history = []
    
    def delete_conversation(self, session_id: str) -> None:
        """Delete a conversation entirely"""
        if session_id in self.conversations:
            del self.conversations[session_id]
    
    def get_active_sessions(self) -> List[str]:
        """Get all active session IDs"""
        return list(self.conversations.keys())


# Global conversation manager instance
_conversation_manager: Optional[ConversationManager] = None


def get_conversation_manager() -> ConversationManager:
    """Get the global conversation manager instance"""
    global _conversation_manager
    if _conversation_manager is None:
        _conversation_manager = ConversationManager()
    return _conversation_manager


# Convenience functions
def get_context(session_id: str) -> ConversationContext:
    return get_conversation_manager().get_context(session_id)


def add_user_turn(session_id: str, content: str) -> None:
    get_conversation_manager().add_turn(session_id, "user", content)


def add_assistant_turn(session_id: str, content: str) -> None:
    get_conversation_manager().add_turn(session_id, "assistant", content)


def get_history(session_id: str) -> List[Dict]:
    return get_conversation_manager().get_history(session_id)
