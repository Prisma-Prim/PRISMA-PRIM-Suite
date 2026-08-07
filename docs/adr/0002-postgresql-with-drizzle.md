# Use PostgreSQL with Drizzle

PostgreSQL is the system of record. Drizzle keeps generated migrations visible and reviewable while preserving direct access to PostgreSQL capabilities such as JSONB, full-text search, and a possible later pgvector extension; production schema changes use reviewed migrations rather than direct schema push.
