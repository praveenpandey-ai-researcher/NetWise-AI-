"""
Voice AI Assistant - Hybrid Retriever
Combines vector search (FAISS) and BM25 using LangChain's EnsembleRetriever
"""

from typing import List, Optional
import time

from langchain_core.documents import Document
from langchain_community.vectorstores import FAISS
from langchain_community.retrievers import BM25Retriever
from langchain.retrievers import EnsembleRetriever
from langchain_community.embeddings import HuggingFaceEmbeddings

from src.config import config


class HybridRetriever:
    """
    Hybrid retriever combining vector search and BM25
    Uses Reciprocal Rank Fusion (RRF) for result merging
    """
    
    def __init__(self, documents: List[Document] = None):
        self.documents = documents or []
        self.vector_store: Optional[FAISS] = None
        self.bm25_retriever: Optional[BM25Retriever] = None
        self.ensemble_retriever: Optional[EnsembleRetriever] = None
        self.embeddings = None
        
    def initialize(self, documents: List[Document] = None):
        """Initialize the retriever with documents"""
        if documents:
            self.documents = documents
        
        if not self.documents:
            print("⚠️ No documents to index")
            return
        
        print("📦 Loading embedding model...")
        self.embeddings = HuggingFaceEmbeddings(
            model_name=config.rag.embedding_model,
            model_kwargs={'device': 'cpu'},
            encode_kwargs={'normalize_embeddings': True}
        )
        
        print("🔍 Building vector index (FAISS)...")
        self.vector_store = FAISS.from_documents(
            self.documents,
            self.embeddings
        )
        
        print("🔍 Building BM25 index...")
        self.bm25_retriever = BM25Retriever.from_documents(
            self.documents,
            k=config.rag.top_k
        )
        
        # Create ensemble retriever with equal weights
        vector_retriever = self.vector_store.as_retriever(
            search_kwargs={"k": config.rag.top_k}
        )
        
        self.ensemble_retriever = EnsembleRetriever(
            retrievers=[vector_retriever, self.bm25_retriever],
            weights=[0.5, 0.5]  # Equal weight for vector and BM25
        )
        
        print(f"✅ Indexed {len(self.documents)} documents")
    
    def search(
        self,
        query: str,
        top_k: int = None
    ) -> tuple[List[Document], float]:
        """
        Perform hybrid search
        
        Returns:
            Tuple of (documents, latency_ms)
        """
        if not self.ensemble_retriever:
            return [], 0
        
        top_k = top_k or config.rag.top_k
        start_time = time.time()
        
        # Get results from ensemble retriever
        results = self.ensemble_retriever.invoke(query)
        
        # Limit to top_k
        results = results[:top_k]
        
        latency_ms = (time.time() - start_time) * 1000
        
        return results, latency_ms
    
    async def async_search(
        self,
        query: str,
        top_k: int = None
    ) -> tuple[List[Document], float]:
        """Async version of search"""
        if not self.ensemble_retriever:
            return [], 0
        
        top_k = top_k or config.rag.top_k
        start_time = time.time()
        
        # Get results from ensemble retriever
        results = await self.ensemble_retriever.ainvoke(query)
        
        # Limit to top_k
        results = results[:top_k]
        
        latency_ms = (time.time() - start_time) * 1000
        
        return results, latency_ms
    
    def vector_search(
        self,
        query: str,
        top_k: int = None
    ) -> List[Document]:
        """Perform vector-only search"""
        if not self.vector_store:
            return []
        
        top_k = top_k or config.rag.top_k
        return self.vector_store.similarity_search(query, k=top_k)
    
    def bm25_search(
        self,
        query: str,
        top_k: int = None
    ) -> List[Document]:
        """Perform BM25-only search"""
        if not self.bm25_retriever:
            return []
        
        top_k = top_k or config.rag.top_k
        self.bm25_retriever.k = top_k
        return self.bm25_retriever.invoke(query)


# Global retriever instance
_retriever: Optional[HybridRetriever] = None


def get_retriever() -> HybridRetriever:
    """Get or create the global retriever instance"""
    global _retriever
    if _retriever is None:
        _retriever = HybridRetriever()
    return _retriever


def initialize_retriever(documents: List[Document]) -> HybridRetriever:
    """Initialize the global retriever with documents"""
    retriever = get_retriever()
    retriever.initialize(documents)
    return retriever
