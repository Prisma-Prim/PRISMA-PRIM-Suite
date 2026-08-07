# Future AI worker

No Python service is implemented in the MVP foundation.

This directory records the future deployment boundary. A worker belongs here only when a concrete issue requires Python-specific document extraction, NLP, retrieval, reranking, local inference, or another long-running ML task.

The worker must receive explicit jobs, return structured proposals with provenance, and remain independent from business workflow ownership. NestJS validates and persists accepted results.
