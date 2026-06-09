"""ChromaDB Semantic Search Setup + API.

Initializes vector store with sentence-transformers embeddings.
Seeds with known optimization pairs and provides search API.
Falls back to TF-IDF similarity when ChromaDB/sentence-transformers unavailable.
"""

import os
import json
import hashlib
import logging
from pathlib import Path
from typing import Optional

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

CHROMA_PATH = os.environ.get("CHROMA_DB_PATH", "./data/chroma")
COLLECTION_NAME = "query_optimizations"

SEED_ENTRIES = [
    {
        "sql": "SELECT * FROM orders WHERE status = $1 ORDER BY created_at DESC LIMIT $1",
        "fix": "CREATE INDEX CONCURRENTLY idx_orders_status_created ON orders(status, created_at DESC) WHERE deleted_at IS NULL;",
        "improvement_pct": 95.7,
        "date": "2025-06-01",
        "tags": ["index", "oltp", "soft-delete"],
    },
    {
        "sql": "SELECT o.*, oi.* FROM orders o JOIN order_items oi ON oi.order_id = o.id WHERE o.user_id = $1",
        "fix": "CREATE INDEX CONCURRENTLY idx_order_items_order_id ON order_items(order_id);\nCREATE INDEX CONCURRENTLY idx_orders_user_id ON orders(user_id) WHERE deleted_at IS NULL;",
        "improvement_pct": 98.2,
        "date": "2025-06-01",
        "tags": ["index", "join", "fk"],
    },
    {
        "sql": "SELECT * FROM products WHERE category = $1 ORDER BY price ASC",
        "fix": "CREATE INDEX CONCURRENTLY idx_products_category_price ON products(category, price);",
        "improvement_pct": 88.0,
        "date": "2025-06-01",
        "tags": ["index", "composite", "ordering"],
    },
    {
        "sql": "SELECT p.*, SUM(oi.quantity) as total_sold FROM products p JOIN order_items oi ON oi.product_id = p.id GROUP BY p.id ORDER BY total_sold DESC LIMIT $1",
        "fix": "CREATE INDEX CONCURRENTLY idx_order_items_product_quantity ON order_items(product_id, quantity);",
        "improvement_pct": 72.4,
        "date": "2025-06-01",
        "tags": ["index", "aggregation", "join"],
    },
    {
        "sql": "SELECT * FROM orders WHERE created_at BETWEEN $1 AND $1",
        "fix": "CREATE INDEX CONCURRENTLY idx_orders_created_at ON orders(created_at DESC) WHERE deleted_at IS NULL;\n-- For tables >10M rows, consider BRIN instead:\n-- CREATE INDEX CONCURRENTLY idx_orders_created_brin ON orders USING BRIN(created_at) WITH (pages_per_range = 32);",
        "improvement_pct": 91.5,
        "date": "2025-06-01",
        "tags": ["index", "time-series", "brin"],
    },
    {
        "sql": "SELECT * FROM users WHERE email = $1 LIMIT $1",
        "fix": "B-Tree unique index on email already covers this (PK or UNIQUE constraint). Ensure index exists.",
        "improvement_pct": 99.0,
        "date": "2025-06-01",
        "tags": ["index", "point-lookup", "unique"],
    },
    {
        "sql": "SELECT * FROM events WHERE event_type = $1 AND created_at > $1 ORDER BY created_at DESC LIMIT $1",
        "fix": "CREATE INDEX CONCURRENTLY idx_events_type_created ON events(event_type, created_at DESC);",
        "improvement_pct": 93.3,
        "date": "2025-06-01",
        "tags": ["index", "time-series", "composite"],
    },
    {
        "sql": "DELETE FROM sessions WHERE expired_at < $1",
        "fix": "CREATE INDEX CONCURRENTLY idx_sessions_expired ON sessions(expired_at);\n-- Also consider partial index if most sessions are active:\n-- CREATE INDEX CONCURRENTLY idx_sessions_expired_partial ON sessions(expired_at) WHERE expired_at IS NOT NULL;",
        "improvement_pct": 85.0,
        "date": "2025-06-01",
        "tags": ["index", "cleanup", "partial"],
    },
]

_encoder = None
_collection = None
_tfidf_index = None


class QueryVectorizer:
    """Fallback TF-IDF vectorizer when sentence-transformers unavailable."""

    def __init__(self):
        self.vocab: dict[str, int] = {}
        self.idf: dict[str, float] = {}

    def build(self, documents: list[str]):
        from collections import Counter
        doc_count = len(documents)
        doc_freq: dict[str, int] = {}
        term_freqs: list[Counter] = []

        for doc in documents:
            tokens = self._tokenize(doc)
            tf = Counter(tokens)
            term_freqs.append(tf)
            for token in set(tokens):
                doc_freq[token] = doc_freq.get(token, 0) + 1

        self.vocab = {}
        idx = 0
        for token in sorted(doc_freq.keys()):
            self.vocab[token] = idx
            idf = doc_count / max(doc_freq[token], 1)
            self.idf[token] = idf
            idx += 1

    def encode(self, text: str) -> list[float]:
        tokens = self._tokenize(text)
        from collections import Counter
        tf = Counter(tokens)
        vec = [0.0] * len(self.vocab)
        for token, count in tf.items():
            if token in self.vocab:
                vec[self.vocab[token]] = count * self.idf.get(token, 1.0)

        norm = sum(v * v for v in vec) ** 0.5
        if norm > 0:
            vec = [v / norm for v in vec]
        return vec

    def _tokenize(self, text: str) -> list[str]:
        return re.findall(r"[a-z_]+", text.lower())


def _normalize_sql(sql: str) -> str:
    import re
    sql = re.sub(r"'[^']*'", "$1", sql)
    sql = re.sub(r"\b\d+\b", "$1", sql)
    sql = re.sub(r"\s+", " ", sql)
    return sql.strip().lower()


def setup_chroma():
    global _encoder, _collection, _tfidf_index

    os.makedirs(CHROMA_PATH, exist_ok=True)
    logger.info(f"Initializing semantic search at: {CHROMA_PATH}")

    try:
        from sentence_transformers import SentenceTransformer
        _encoder = SentenceTransformer("sentence-transformers/all-MiniLM-L6-v2")
        logger.info("Loaded sentence-transformers model")
    except Exception as e:
        logger.warning(f"sentence-transformers not available: {e}")
        _encoder = None

    if _encoder is None:
        documents = [e["sql"] for e in SEED_ENTRIES]
        _tfidf_index = QueryVectorizer()
        _tfidf_index.build(documents)
        logger.info("Using TF-IDF fallback vectorizer")

    try:
        import chromadb
        client = chromadb.PersistentClient(path=CHROMA_PATH)

        existing = [c.name for c in client.list_collections()]
        if COLLECTION_NAME in existing:
            client.delete_collection(COLLECTION_NAME)

        _collection = client.create_collection(
            name=COLLECTION_NAME,
            metadata={"hnsw:space": "cosine"},
        )
        logger.info("ChromaDB collection created")

        embeddings = []
        metadatas = []
        documents = []
        ids = []

        for i, entry in enumerate(SEED_ENTRIES):
            norm_sql = _normalize_sql(entry["sql"])
            doc_id = hashlib.sha256(norm_sql.encode()).hexdigest()[:16]

            if _encoder is not None:
                embeddings.append(_encoder.encode(norm_sql).tolist())
            else:
                embeddings.append(_tfidf_index.encode(norm_sql) if _tfidf_index else [])

            metadatas.append({
                "fix": entry["fix"],
                "improvement_pct": entry["improvement_pct"],
                "date": entry["date"],
                "tags": ",".join(entry.get("tags", [])),
            })
            documents.append(norm_sql)
            ids.append(doc_id)

        if embeddings and len(embeddings[0]) > 0:
            _collection.add(embeddings=embeddings, metadatas=metadatas, documents=documents, ids=ids)
            logger.info(f"Seeded {len(SEED_ENTRIES)} entries into ChromaDB")
        else:
            logger.info(f"Embeddings empty; stored {len(SEED_ENTRIES)} documents as metadata only")
    except ImportError:
        logger.warning("ChromaDB not installed. Searches will use TF-IDF fallback.")
    except Exception as e:
        logger.error(f"ChromaDB setup failed: {e}")


def search_similar(sql: str, n_results: int = 3, min_score: float = 0.5) -> list[dict]:
    global _encoder, _collection, _tfidf_index

    norm_sql = _normalize_sql(sql)

    if _collection is not None:
        try:
            if _encoder is not None:
                embedding = _encoder.encode(norm_sql).tolist()
                results = _collection.query(query_embeddings=[embedding], n_results=n_results)
            else:
                results = _collection.query(query_texts=[norm_sql], n_results=n_results)

            if results and results.get("ids") and results["ids"][0]:
                output = []
                for i, doc_id in enumerate(results["ids"][0]):
                    score = 1.0 - (results.get("distances", [[0.0] * n_results])[0][i])
                    if score < min_score:
                        continue
                    output.append({
                        "id": doc_id,
                        "sql": results["documents"][0][i] if results.get("documents") and results["documents"][0] else "",
                        "fix": results["metadatas"][0][i].get("fix", "") if results.get("metadatas") and results["metadatas"][0] else "",
                        "improvement_pct": results["metadatas"][0][i].get("improvement_pct", 0) if results.get("metadatas") and results["metadatas"][0] else 0,
                        "score": round(score, 4),
                        "tags": results["metadatas"][0][i].get("tags", "").split(",") if results.get("metadatas") and results["metadatas"][0] else [],
                    })
                return output
        except Exception as e:
            logger.warning(f"ChromaDB search failed: {e}")

    if _tfidf_index is not None:
        query_vec = _tfidf_index.encode(norm_sql)
        results = []
        for i, entry in enumerate(SEED_ENTRIES):
            doc_vec = _tfidf_index.encode(_normalize_sql(entry["sql"]))
            score = _cosine_similarity(query_vec, doc_vec)
            if score >= min_score:
                results.append((score, i))
        results.sort(key=lambda x: -x[0])
        return [
            {
                "id": hashlib.sha256(entry["sql"].encode()).hexdigest()[:16],
                "sql": entry["sql"],
                "fix": entry["fix"],
                "improvement_pct": entry["improvement_pct"],
                "score": round(score, 4),
                "tags": entry.get("tags", []),
            }
            for score, idx in results[:n_results]
            for entry in [SEED_ENTRIES[idx]]
        ]

    return []


def _cosine_similarity(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = sum(x * y for x, y in zip(a, b))
    na = sum(x * x for x in a) ** 0.5
    nb = sum(x * x for x in b) ** 0.5
    return dot / max(na * nb, 0.001)


if __name__ == "__main__":
    import re
    setup_chroma()
    print(f"\nSemantic search initialized with {len(SEED_ENTRIES)} seed entries.")

    test_queries = [
        "SELECT * FROM orders WHERE status = 'shipped' ORDER BY created_at DESC LIMIT 10",
        "SELECT * FROM products WHERE category = 'books' ORDER BY price",
        "SELECT u.*, o.* FROM users u JOIN orders o ON o.user_id = u.id WHERE u.id = 42",
    ]

    for q in test_queries:
        print(f"\nQuery: {q}")
        results = search_similar(q, n_results=2)
        for r in results:
            print(f"  [{r['score']:.2f}] {r['fix'][:80]}... (+{r['improvement_pct']}%)")
