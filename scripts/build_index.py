"""
Build the NetWise AI knowledge-base index ahead of time.

Parsing the PDFs in data/ costs ~20s and peaks near 400 MB of RSS. Doing that on
every cold start is what makes a small cloud instance slow to boot and prone to
OOM, so this script does it once (at build time) and writes a compact cache that
the server loads in about a second.

Usage:
    python -m scripts.build_index            # chunk cache only (bm25 mode)
    python -m scripts.build_index --faiss    # also build+save the FAISS index
"""

import argparse
import sys
import time
from pathlib import Path

# Allow running as `python scripts/build_index.py` as well as `-m scripts.build_index`
sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from src.config import config  # noqa: E402
from src.rag.document_loader import (  # noqa: E402
    parse_and_chunk_documents,
    save_chunk_cache,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="Build the NetWise AI index")
    parser.add_argument(
        "--faiss",
        action="store_true",
        help="Also build and persist the FAISS vector index (requires requirements-hybrid.txt)",
    )
    args = parser.parse_args()

    start = time.time()

    print(f"Source documents: {config.data_dir}")
    chunks = parse_and_chunk_documents()

    if not chunks:
        print("ERROR: no documents were parsed - nothing to index.")
        return 1

    save_chunk_cache(chunks)

    if args.faiss:
        # Imported lazily: the dense extras are optional.
        from src.rag.hybrid_retriever import HybridRetriever

        retriever = HybridRetriever(chunks)
        retriever.mode = "hybrid"
        retriever.initialize()

        if not retriever.save_dense_index():
            print("ERROR: FAISS index was not built - install requirements-hybrid.txt")
            return 1

    print(f"Done in {time.time() - start:.1f}s")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
