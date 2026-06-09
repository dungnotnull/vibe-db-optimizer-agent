-- vibe-db-optimizer-agent: PostgreSQL initialization
-- Creates read-only optimizer user + enables pg_stat_statements

-- Enable extensions
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- Create read-only role for the optimizer agent
DO $$
BEGIN
    IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = 'optimizer_readonly') THEN
        CREATE ROLE optimizer_readonly LOGIN PASSWORD 'optimizer_readonly';
    END IF;
END
$$;

-- Grant connect + schema usage
GRANT CONNECT ON DATABASE vibe_db TO optimizer_readonly;
GRANT USAGE ON SCHEMA public TO optimizer_readonly;

-- Grant read-only access to all existing tables
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO optimizer_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO optimizer_readonly;

-- Grant access to pg_stat_statements for query analysis
GRANT SELECT ON pg_stat_statements TO optimizer_readonly;

-- Create sample e-commerce schema for testing
CREATE TABLE IF NOT EXISTS users (
    id BIGSERIAL PRIMARY KEY,
    email VARCHAR(255) NOT NULL UNIQUE,
    name VARCHAR(255) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS products (
    id BIGSERIAL PRIMARY KEY,
    sku VARCHAR(50) NOT NULL UNIQUE,
    name VARCHAR(500) NOT NULL,
    description TEXT,
    price DECIMAL(10,2) NOT NULL,
    category VARCHAR(100),
    inventory_count INT DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS orders (
    id BIGSERIAL PRIMARY KEY,
    user_id BIGINT NOT NULL REFERENCES users(id),
    status VARCHAR(20) NOT NULL DEFAULT 'pending',
    total_amount DECIMAL(12,2) NOT NULL,
    shipping_address TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    deleted_at TIMESTAMPTZ
);

CREATE TABLE IF NOT EXISTS order_items (
    id BIGSERIAL PRIMARY KEY,
    order_id BIGINT NOT NULL REFERENCES orders(id),
    product_id BIGINT NOT NULL REFERENCES products(id),
    quantity INT NOT NULL,
    unit_price DECIMAL(10,2) NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- NOTE: Intentionally missing indexes on FK columns to provide
-- optimization targets for the agent to detect.
-- Indexes that SHOULD exist but don't:
--   - orders.user_id (FK, frequently filtered)
--   - orders.status (frequently filtered in WHERE)
--   - order_items.order_id (FK, used in JOINs)
--   - order_items.product_id (FK, used in JOINs)
--   - products.category (frequently filtered)
--   - users.email (unique constraint already covers this)
--   - orders.created_at (time-series queries)
