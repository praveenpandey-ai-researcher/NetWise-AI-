"""
Voice AI Assistant - Hybrid Retriever
Combines vector search (FAISS) and BM25 using LangChain's EnsembleRetriever

Two retrieval modes (RETRIEVAL_MODE env var):
  bm25   - lexical only. No torch, ~90 MB RSS, indexes in ~1s. The default,
           because it fits a 512 MB Render instance.
  hybrid - FAISS + BM25 ensemble. Needs requirements-hybrid.txt and ~600 MB RSS.
"""

from typing import List, Optional
import time

from langchain_core.documents import Document
from langchain_community.retrievers import BM25Retriever

from src.config import config


class HybridRetriever:
    """
    Hybrid retriever combining vector search and BM25
    Uses Reciprocal Rank Fusion (RRF) for result merging
    """

    def __init__(self, documents: List[Document] = None):
        self.documents = documents or []
        self.vector_store = None
        self.bm25_retriever: Optional[BM25Retriever] = None
        self.ensemble_retriever = None
        self.embeddings = None
        self.mode: str = config.rag.retrieval_mode

    @property
    def is_ready(self) -> bool:
        """True once at least one retrieval backend is usable"""
        return self.ensemble_retriever is not None or self.bm25_retriever is not None

    def _active_retriever(self):
        """The retriever to query: ensemble when built, BM25 otherwise"""
        return self.ensemble_retriever or self.bm25_retriever

    def initialize(self, documents: List[Document] = None):
        """Initialize the retriever with documents"""
        if documents:
            self.documents = documents

        if not self.documents:
            print("⚠️ No documents to index")
            return

        # BM25 first: it is cheap and gives us a working retriever even if the
        # dense leg fails to build (missing extras, out of memory, ...).
        print("🔍 Building BM25 index...")
        self.bm25_retriever = BM25Retriever.from_documents(
            self.documents,
            k=config.rag.top_k
        )

        if self.mode == "hybrid":
            self._build_dense_index()
        else:
            print("ℹ️ RETRIEVAL_MODE=bm25 - skipping dense index (set RETRIEVAL_MODE=hybrid to enable)")

        print(f"✅ Indexed {len(self.documents)} documents (mode: {self.mode})")

    def _build_dense_index(self):
        """
        Build (or load) the FAISS index.

        Imports are local so that the bm25 mode never pulls torch into memory.
        Any failure degrades to BM25-only rather than taking the service down.
        """
        try:
            from langchain_community.vectorstores import FAISS
            from langchain_classic.retrievers import EnsembleRetriever
            try:
                from langchain_huggingface import HuggingFaceEmbeddings
            except ImportError:
                from langchain_community.embeddings import HuggingFaceEmbeddings
        except ImportError as e:
            print(f"⚠️ Dense retrieval extras missing ({e}). Staying on BM25 only.")
            print("   Install with: pip install -r requirements-hybrid.txt")
            return

        try:
            print("📦 Loading embedding model...")
            self.embeddings = HuggingFaceEmbeddings(
                model_name=config.rag.embedding_model,
                model_kwargs={'device': 'cpu'},
                encode_kwargs={'normalize_embeddings': True}
            )

            faiss_dir = config.faiss_dir
            if faiss_dir.exists():
                # Re-embedding 2600+ chunks takes ~100s; reuse the prebuilt index.
                print(f"⚡ Loading prebuilt FAISS index from {faiss_dir}...")
                self.vector_store = FAISS.load_local(
                    str(faiss_dir),
                    self.embeddings,
                    allow_dangerous_deserialization=True,
                )
            else:
                print("🔍 Building vector index (FAISS)...")
                self.vector_store = FAISS.from_documents(self.documents, self.embeddings)

            vector_retriever = self.vector_store.as_retriever(
                search_kwargs={"k": config.rag.top_k}
            )

            self.ensemble_retriever = EnsembleRetriever(
                retrievers=[vector_retriever, self.bm25_retriever],
                weights=[0.5, 0.5]  # Equal weight for vector and BM25
            )
        except Exception as e:
            print(f"⚠️ Failed to build dense index ({e}). Falling back to BM25 only.")
            self.vector_store = None
            self.ensemble_retriever = None

    def save_dense_index(self) -> bool:
        """Persist the FAISS index so later boots can skip re-embedding"""
        if not self.vector_store:
            return False

        config.faiss_dir.parent.mkdir(parents=True, exist_ok=True)
        self.vector_store.save_local(str(config.faiss_dir))
        print(f"💾 Saved FAISS index to {config.faiss_dir}")
        return True

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
        retriever = self._active_retriever()
        if not retriever:
            return [], 0

        top_k = top_k or config.rag.top_k
        start_time = time.time()

        results = retriever.invoke(query)

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
        retriever = self._active_retriever()
        if not retriever:
            return [], 0

        top_k = top_k or config.rag.top_k
        start_time = time.time()

        results = await retriever.ainvoke(query)

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
