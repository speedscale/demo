-- Schema for the tutorial orders service. Every language port uses this file
-- unchanged; docker compose loads it on first start.

CREATE TABLE IF NOT EXISTS orders (
    id          uuid        PRIMARY KEY,
    customer    text        NOT NULL,
    status      text        NOT NULL,
    total_cents integer     NOT NULL,
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS orders_created_at_idx ON orders (created_at DESC);

CREATE TABLE IF NOT EXISTS order_items (
    id               bigserial PRIMARY KEY,
    order_id         uuid      NOT NULL REFERENCES orders (id),
    project_id       text      NOT NULL,
    name             text      NOT NULL,
    quantity         integer   NOT NULL,
    unit_price_cents integer   NOT NULL
);

CREATE INDEX IF NOT EXISTS order_items_order_id_idx ON order_items (order_id);
