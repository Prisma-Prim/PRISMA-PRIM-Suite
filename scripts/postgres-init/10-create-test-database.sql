-- Runs once when the compose PostgreSQL volume is initialized.
-- Creates the isolated database that TEST_DATABASE_URL and the destructive
-- PostgreSQL test suites require, next to the development database that
-- POSTGRES_DB creates.
CREATE DATABASE prisma_prim_test OWNER prisma_prim TEMPLATE template0;
