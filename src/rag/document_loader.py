"""
Voice AI Assistant - Document Loader
Loads and chunks documents for RAG pipeline using LangChain
"""

import json
from pathlib import Path
from typing import List

from langchain.text_splitter import RecursiveCharacterTextSplitter
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
                }
            )
            documents.append(doc)
    
    return documents


def chunk_documents(documents: List[Document]) -> List[Document]:
    """
    Split documents into smaller chunks for better retrieval
    """
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


def load_and_chunk_documents(filepath: Path = None) -> List[Document]:
    """
    Load documents and split into chunks - main entry point
    """
    documents = load_sample_manual(filepath)
    
    if not documents:
        return []
    
    chunks = chunk_documents(documents)
    print(f"📄 Loaded {len(documents)} documents, split into {len(chunks)} chunks")
    
    return chunks
