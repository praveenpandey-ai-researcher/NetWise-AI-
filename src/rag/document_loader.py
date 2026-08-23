"""
Voice AI Assistant - Document Loader
Loads and chunks documents for RAG pipeline using LangChain
Supports JSON manuals and PDF files
"""

import sys
if hasattr(sys.stdout, 'reconfigure'):
    sys.stdout.reconfigure(encoding='utf-8')


import json
from pathlib import Path
from typing import List

from langchain_core.documents import Document

from src.config import config


def load_sample_manual(filepath: Path = None) -> List[Document]:
    """
    Load the sample manual JSON and convert to LangChain Documents
    """
    if filepath is None:
        filepath = config.data_dir / "sample_manual.json"
    
    if not filepath.exists():
        print(f"⚠️ Sample manual not found at {filepath}")
        return []
    
    with open(filepath, 'r', encoding='utf-8') as f:
        manual = json.load(f)
    
    documents = []
    
    for chapter in manual.get("chapters", []):
        chapter_title = chapter.get("title", "")
        
        for section in chapter.get("sections", []):
            content = f"{chapter_title} - {section.get('title', '')}: {section.get('content', '')}"
            
            doc = Document(
                page_content=content,
                metadata={
                    "source": manual.get("manual_name", "Unknown"),
                    "chapter": chapter_title,
                    "section": section.get("title", ""),
                    "section_id": section.get("id", ""),
                    "format": "json",
                }
            )
            documents.append(doc)
    
    return documents


def load_pdf_documents(data_dir: Path = None) -> List[Document]:
    """
    Load all PDF files from the data directory and convert to LangChain Documents.
    Each PDF page becomes a separate Document with vendor/source metadata.
    """
    if data_dir is None:
        data_dir = config.data_dir

    pdf_files = list(data_dir.glob("**/*.pdf"))

    if not pdf_files:
        print("ℹ️ No PDF files found in data directory")
        return []

    try:
        from pypdf import PdfReader
    except ImportError as e:
        # Previously this returned [] and the pipeline carried on with only the
        # 6-section sample JSON, so the assistant answered from an essentially
        # empty knowledge base with no visible error. Fail loudly instead.
        raise RuntimeError(
            f"pypdf is required to index the {len(pdf_files)} PDF manual(s) in "
            f"{data_dir}, but it is not installed. Run: pip install pypdf"
        ) from e

    documents = []

    for pdf_path in pdf_files:
        print(f"   📄 Loading: {pdf_path.name}")
        try:
            reader = PdfReader(str(pdf_path))
            filename = pdf_path.stem.lower()

            # Auto-detect vendor from filename
            vendor = _detect_vendor(filename)

            for page_num, page in enumerate(reader.pages, 1):
                text = page.extract_text()
                if text and text.strip():
                    # Clean up extracted text
                    text = _clean_pdf_text(text)

                    doc = Document(
                        page_content=text,
                        metadata={
                            "source": pdf_path.name,
                            "vendor": vendor,
                            "page": page_num,
                            "total_pages": len(reader.pages),
                            "format": "pdf",
                        }
                    )
                    documents.append(doc)

        except Exception as e:
            print(f"   ⚠️ Failed to load {pdf_path.name}: {e}")

    print(f"   📚 Loaded {len(documents)} pages from {len(pdf_files)} PDF(s)")
    return documents


def _detect_vendor(filename: str) -> str:
    """Auto-detect vendor from PDF filename"""
    filename = filename.lower()
    if "cisco" in filename or "catalyst" in filename or "ios" in filename:
        return "Cisco"
    elif "netgear" in filename or "r7000" in filename or "rax" in filename:
        return "NETGEAR"
    elif "tp-link" in filename or "tplink" in filename or "archer" in filename:
        return "TP-Link"
    elif "asus" in filename or "rt-" in filename:
        return "ASUS"
    elif "juniper" in filename or "junos" in filename:
        return "Juniper"
    elif "aruba" in filename:
        return "Aruba"
    elif "routconf" in filename or "cf-" in filename:
        return "Cisco"
    else:
        return "Generic"


def _clean_pdf_text(text: str) -> str:
    """Clean up text extracted from PDFs"""
    import re
    # Collapse multiple whitespace/newlines into single spaces
    text = re.sub(r'\s+', ' ', text)
    # Remove very short lines that are likely headers/footers/page numbers
    lines = text.split('. ')
    cleaned = '. '.join(line.strip() for line in lines if len(line.strip()) > 10)
    return cleaned.strip()


def chunk_documents(documents: List[Document]) -> List[Document]:
    """
    Split documents into smaller chunks for better retrieval
    """
    # Imported here, not at module scope: langchain_text_splitters' package
    # __init__ eagerly imports every splitter, which drags in torch and
    # sentence-transformers (~370 MB RSS). The server loads the prebuilt chunk
    # cache and never calls this, so it must not pay that cost just to import
    # this module.
    from langchain_text_splitters import RecursiveCharacterTextSplitter

    text_splitter = RecursiveCharacterTextSplitter(
        chunk_size=config.rag.chunk_size,
        chunk_overlap=config.rag.chunk_overlap,
        length_function=len,
        separators=["\n\n", "\n", ". ", " ", ""],
    )
    
    chunks = text_splitter.split_documents(documents)
    
    # Add chunk index to metadata
    for i, chunk in enumerate(chunks):
        chunk.metadata["chunk_id"] = f"chunk-{i}"
    
    return chunks


def save_chunk_cache(chunks: List[Document], path: Path = None) -> Path:
    """
    Persist parsed chunks to a compact JSON file.

    Parsing the PDFs costs ~20s and peaks near 400MB of RSS. Doing that on every
    cold start is what made the deployed service both slow to bind its port and
    prone to OOM, so the parse is done once at build time and cached here.
    """
    path = path or config.chunk_cache_path
    path.parent.mkdir(parents=True, exist_ok=True)

    payload = {
        "version": 1,
        "chunk_size": config.rag.chunk_size,
        "chunk_overlap": config.rag.chunk_overlap,
        "chunks": [
            {"page_content": c.page_content, "metadata": c.metadata}
            for c in chunks
        ],
    }

    with open(path, "w", encoding="utf-8") as f:
        json.dump(payload, f, ensure_ascii=False)

    size_mb = path.stat().st_size / 1_000_000
    print(f"💾 Wrote chunk cache: {path} ({len(chunks)} chunks, {size_mb:.1f} MB)")
    return path


def load_chunk_cache(path: Path = None) -> List[Document]:
    """
    Load pre-parsed chunks written by save_chunk_cache.

    Returns an empty list if the cache is missing or was built with a different
    chunking configuration, so the caller can fall back to a full parse.
    """
    path = path or config.chunk_cache_path

    if not path.exists():
        return []

    try:
        with open(path, "r", encoding="utf-8") as f:
            payload = json.load(f)
    except (OSError, json.JSONDecodeError) as e:
        print(f"⚠️ Chunk cache unreadable ({e}), falling back to full parse")
        return []

    if (payload.get("chunk_size") != config.rag.chunk_size
            or payload.get("chunk_overlap") != config.rag.chunk_overlap):
        print("ℹ️ Chunk cache was built with different chunk settings, re-parsing")
        return []

    documents = [
        Document(page_content=c["page_content"], metadata=c.get("metadata", {}))
        for c in payload.get("chunks", [])
    ]

    if documents:
        print(f"⚡ Loaded {len(documents)} chunks from cache ({path.name})")

    return documents


def parse_and_chunk_documents(filepath: Path = None) -> List[Document]:
    """
    Parse ALL source documents (JSON + PDFs) from disk and split into chunks.

    This is the slow path. Prefer load_and_chunk_documents, which uses the cache.
    """
    all_documents = []

    # 1. Load JSON manual
    json_docs = load_sample_manual(filepath)
    if json_docs:
        print(f"📋 Loaded {len(json_docs)} sections from JSON manual")
        all_documents.extend(json_docs)

    # 2. Load all PDFs from data directory
    pdf_docs = load_pdf_documents()
    if pdf_docs:
        all_documents.extend(pdf_docs)

    if not all_documents:
        print("⚠️ No documents loaded from any source")
        return []

    chunks = chunk_documents(all_documents)
    print(f"📄 Total: {len(all_documents)} documents -> {len(chunks)} chunks")

    return chunks


def load_and_chunk_documents(filepath: Path = None, use_cache: bool = True) -> List[Document]:
    """
    Load ALL documents and split into chunks - main entry point

    Uses the pre-built chunk cache when available (fast, low memory) and falls
    back to parsing the raw PDFs when it is not.
    """
    if use_cache and filepath is None:
        cached = load_chunk_cache()
        if cached:
            return cached

    return parse_and_chunk_documents(filepath)
