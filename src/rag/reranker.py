"""
Voice AI Assistant - Cross-Encoder Reranker
Uses LLM to rerank retrieved documents for better relevance
"""

import json
import time
from typing import List, Tuple

from langchain_core.documents import Document
from langchain_groq import ChatGroq
from langchain_core.prompts import ChatPromptTemplate
from langchain_core.output_parsers import StrOutputParser

from src.config import config


async def cross_encoder_rerank(
    query: str,
    documents: List[Document],
    top_k: int = None,
    llm: ChatGroq = None
) -> Tuple[List[Document], float]:
    """
    Rerank documents using LLM-based cross-encoder approach
    
    Returns:
        Tuple of (reranked_documents, latency_ms)
    """
    if not documents:
        return [], 0
    
    top_k = top_k or config.rag.rerank_top_k
    start_time = time.time()
    
    # If we have fewer documents than needed, just return them
    if len(documents) <= top_k:
        return documents, (time.time() - start_time) * 1000
    
    # Initialize LLM if not provided
    if llm is None:
        llm = ChatGroq(
            api_key=config.groq.api_key,
            model=config.groq.model,
            temperature=0.1,
            max_tokens=100,
        )
    
    # Format passages for scoring
    passages = []
    for i, doc in enumerate(documents):
        content = doc.page_content[:300]  # Limit content length
        passages.append(f"[{i}] {content}...")
    
    passages_text = "\n\n".join(passages)
    
    prompt = ChatPromptTemplate.from_messages([
        ("system", """You are a relevance scoring system. Given a query and a list of document passages, rate each passage's relevance to the query on a scale of 0-10.

Output ONLY a JSON array of numbers representing the relevance scores for each passage in order.
Example output: [8, 3, 9, 2, 7]

Be precise:
- 9-10: Directly answers the query
- 7-8: Highly relevant information
- 5-6: Somewhat relevant
- 3-4: Tangentially related
- 0-2: Not relevant"""),
        ("user", """Query: "{query}"

Passages to rank:
{passages}

Return only the JSON array of relevance scores:""")
    ])
    
    chain = prompt | llm | StrOutputParser()
    
    try:
        response = await chain.ainvoke({
            "query": query,
            "passages": passages_text
        })
        
        # Parse scores from response
        import re
        scores_match = re.search(r'\[[\d,\s.]+\]', response)
        
        if not scores_match:
            print("⚠️ Failed to parse reranker scores, using original order")
            return documents[:top_k], (time.time() - start_time) * 1000
        
        scores = json.loads(scores_match.group(0))
        
        # Pair documents with scores and sort
        scored_docs = list(zip(documents, scores))
        scored_docs.sort(key=lambda x: x[1], reverse=True)
        
        # Return top K
        reranked = [doc for doc, score in scored_docs[:top_k]]
        
        return reranked, (time.time() - start_time) * 1000
        
    except Exception as e:
        print(f"⚠️ Reranking failed: {e}")
        return documents[:top_k], (time.time() - start_time) * 1000


def heuristic_rerank(
    query: str,
    documents: List[Document],
    top_k: int = None
) -> List[Document]:
    """
    Fast heuristic-based reranking (no LLM call)
    Used as fallback or when speed is critical
    """
    if not documents:
        return []
    
    top_k = top_k or config.rag.rerank_top_k
    query_terms = query.lower().split()
    
    scored_docs = []
    
    for doc in documents:
        content = doc.page_content.lower()
        score = 0
        
        # Boost for exact phrase match
        if query.lower() in content:
            score += 2
        
        # Boost for term matches
        for term in query_terms:
            if len(term) > 3 and term in content:
                score += 0.2
        
        # Boost for early mentions
        first_sentence = content.split('.')[0]
        first_sentence_matches = sum(1 for t in query_terms if t in first_sentence and len(t) > 3)
        score += first_sentence_matches * 0.3
        
        scored_docs.append((doc, score))
    
    # Sort by score descending
    scored_docs.sort(key=lambda x: x[1], reverse=True)
    
    return [doc for doc, score in scored_docs[:top_k]]
