-- =====================================================
-- ALTYCOON DATABASE SCHEMA
-- Combined (Phase 1 + Phase 2 + Phase 3)
-- PostgreSQL 16+
-- Fixes applied: vehicle_id UNIQUE bugs, missing CHECKs
-- =====================================================

-- =====================================================
-- EXTENSIONS
-- =====================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- =====================================================
-- ENUMS
-- =====================================================

CREATE TYPE member_role AS ENUM (
    'OWNER',
    'CEO',
    'MANAGER',
    'EMPLOYEE'
);

CREATE TYPE building_type AS ENUM (
    'MINE',
    'FARM',
    'WAREHOUSE',
    'FACTORY',
    'MARKETPLACE'
);

CREATE TYPE building_status AS ENUM (
    'ACTIVE',
    'UNDER_CONSTRUCTION',
    'DISABLED',
    'DESTROYED'
);

CREATE TYPE road_type AS ENUM (
    'DIRT',
    'GRAVEL',
    'PAVED',
    'HIGHWAY'
);

CREATE TYPE road_condition AS ENUM (
    'GOOD',
    'DAMAGED',
    'BROKEN'
);

CREATE TYPE inventory_owner_type AS ENUM (
    'PLAYER',
    'BUILDING',
    'VEHICLE'
);

CREATE TYPE item_category AS ENUM (
    'RAW_RESOURCE',
    'MATERIAL',
    'PRODUCT',
    'FOOD',
    'FUEL',
    'TOOL'
);

CREATE TYPE recipe_status AS ENUM (
    'QUEUED',
    'RUNNING',
    'COMPLETED',
    'CANCELLED'
);

CREATE TYPE vehicle_status AS ENUM (
    'IDLE',
    'CALCULATING_ROUTE',
    'LOADING',
    'MOVING',
    'UNLOADING',
    'WAITING',
    'BROKEN',
    'OUT_OF_FUEL'
);

CREATE TYPE vehicle_route_status AS ENUM (
    'ACTIVE',
    'COMPLETED',
    'FAILED',
    'CANCELLED'
);

CREATE TYPE movement_status AS ENUM (
    'IN_PROGRESS',
    'ARRIVED'
);

CREATE TYPE order_type AS ENUM (
    'BUY',
    'SELL'
);

CREATE TYPE transport_order_status AS ENUM (
    'PENDING',
    'ASSIGNED',
    'PICKING_UP',
    'IN_TRANSIT',
    'DELIVERED',
    'FAILED',
    'CANCELLED'
);

CREATE TYPE road_upgrade_status AS ENUM (
    'QUEUED',
    'IN_PROGRESS',
    'COMPLETED',
    'CANCELLED'
);

-- =====================================================
-- PHASE 1: FOUNDATION
-- =====================================================

CREATE TABLE players (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(32) NOT NULL UNIQUE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE companies (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    balance NUMERIC(18,2) NOT NULL DEFAULT 0,
    max_concurrent_road_upgrades INTEGER NOT NULL DEFAULT 1,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    -- NOTE: no floor on balance -- allowed to go negative (debt/overdraft).
    -- Add CHECK(balance >= 0) here if that's not intended.

    CHECK (max_concurrent_road_upgrades >= 1)
);

CREATE TABLE company_members (
    company_id UUID NOT NULL,
    player_id UUID NOT NULL,
    role member_role NOT NULL,
    joined_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    PRIMARY KEY (company_id, player_id),

    FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE CASCADE,

    FOREIGN KEY (player_id)
        REFERENCES players(id)
        ON DELETE CASCADE
);

CREATE TABLE regions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE
);

CREATE TABLE nodes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    region_id UUID,
    name VARCHAR(100) NOT NULL,
    x INTEGER NOT NULL,
    y INTEGER NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (region_id)
        REFERENCES regions(id)
        ON DELETE SET NULL,

    UNIQUE (x, y)
);

-- NOTE: roads are directional (from -> to). A<->B bidirectional travel
-- requires inserting both rows at the app level, unless you intend
-- one-way roads as a game mechanic.
CREATE TABLE roads (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    from_node_id UUID NOT NULL,
    to_node_id UUID NOT NULL,
    distance NUMERIC(10,2) NOT NULL,
    speed_limit NUMERIC(10,2) NOT NULL,
    road_type road_type NOT NULL,
    condition road_condition NOT NULL DEFAULT 'GOOD',
    is_blocked BOOLEAN NOT NULL DEFAULT FALSE,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (from_node_id)
        REFERENCES nodes(id)
        ON DELETE CASCADE,

    FOREIGN KEY (to_node_id)
        REFERENCES nodes(id)
        ON DELETE CASCADE,

    level INTEGER NOT NULL DEFAULT 1,

    CHECK (from_node_id <> to_node_id),
    CHECK (distance > 0),
    CHECK (speed_limit > 0),
    CHECK (level >= 1),

    UNIQUE (from_node_id, to_node_id)
);

-- Data-driven upgrade tiers: defines what each level of each road_type gives,
-- and how much it costs. Tune balance here without touching game logic.
CREATE TABLE road_upgrade_tiers (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    road_type road_type NOT NULL,
    level INTEGER NOT NULL,

    speed_limit_bonus NUMERIC(10,2) NOT NULL DEFAULT 0,
    upgrade_cost NUMERIC(18,2) NOT NULL,
    upgrade_time INTEGER NOT NULL, -- seconds

    CHECK (level >= 1),
    CHECK (speed_limit_bonus >= 0),
    CHECK (upgrade_cost >= 0),
    CHECK (upgrade_time > 0),

    UNIQUE (road_type, level)
);

-- Upgrade queue/history for a road, mirrors the factory_jobs pattern.
CREATE TABLE road_upgrades (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),

    road_id UUID NOT NULL,
    company_id UUID NOT NULL,

    from_level INTEGER NOT NULL,
    to_level INTEGER NOT NULL,

    status road_upgrade_status NOT NULL DEFAULT 'QUEUED',

    started_at TIMESTAMPTZ,
    finishes_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (road_id)
        REFERENCES roads(id)
        ON DELETE CASCADE,

    FOREIGN KEY (company_id)
        REFERENCES companies(id),

    CHECK (from_level >= 1),
    CHECK (to_level = from_level + 1),
    CHECK (finishes_at IS NULL OR started_at IS NULL OR finishes_at > started_at)
);

-- Only one QUEUED or IN_PROGRESS upgrade per road at a time.
CREATE UNIQUE INDEX idx_one_active_upgrade_per_road
ON road_upgrades(road_id)
WHERE status IN ('QUEUED', 'IN_PROGRESS');

CREATE TABLE buildings (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    node_id UUID NOT NULL UNIQUE,
    company_id UUID NOT NULL,
    building_type building_type NOT NULL,
    name VARCHAR(100) NOT NULL,
    level INTEGER NOT NULL DEFAULT 1,
    status building_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (node_id)
        REFERENCES nodes(id)
        ON DELETE CASCADE,

    FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE CASCADE,

    CHECK (level >= 1)
);

-- =====================================================
-- PHASE 2: ITEMS, INVENTORY, PRODUCTION
-- =====================================================

CREATE TABLE items (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    category item_category NOT NULL,
    weight NUMERIC(12,3) NOT NULL,
    volume NUMERIC(12,3) NOT NULL,
    stack_size INTEGER NOT NULL DEFAULT 100,
    base_price NUMERIC(18,2) NOT NULL DEFAULT 0,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    CHECK (weight >= 0),
    CHECK (volume >= 0),
    CHECK (stack_size > 0),
    CHECK (base_price >= 0)
);

CREATE TABLE inventories (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    owner_type inventory_owner_type NOT NULL,
    owner_id UUID NOT NULL,
    max_weight NUMERIC(18,2),
    max_volume NUMERIC(18,2),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    UNIQUE(owner_type, owner_id),

    CHECK (max_weight IS NULL OR max_weight >= 0),
    CHECK (max_volume IS NULL OR max_volume >= 0)
);

CREATE TABLE inventory_items (
    inventory_id UUID NOT NULL,
    item_id UUID NOT NULL,
    quantity BIGINT NOT NULL DEFAULT 0,

    PRIMARY KEY (inventory_id, item_id),

    FOREIGN KEY (inventory_id)
        REFERENCES inventories(id)
        ON DELETE CASCADE,

    FOREIGN KEY (item_id)
        REFERENCES items(id)
        ON DELETE RESTRICT,

    CHECK (quantity >= 0)
);

CREATE TABLE mine_data (
    building_id UUID PRIMARY KEY,
    resource_item_id UUID NOT NULL,
    production_rate NUMERIC(18,2) NOT NULL,
    remaining_resource BIGINT NOT NULL,

    FOREIGN KEY (building_id)
        REFERENCES buildings(id)
        ON DELETE CASCADE,

    FOREIGN KEY (resource_item_id)
        REFERENCES items(id),

    CHECK (production_rate >= 0),
    CHECK (remaining_resource >= 0)
);

CREATE TABLE farm_data (
    building_id UUID PRIMARY KEY,
    crop_item_id UUID NOT NULL,
    growth_time INTEGER NOT NULL,

    FOREIGN KEY (building_id)
        REFERENCES buildings(id)
        ON DELETE CASCADE,

    FOREIGN KEY (crop_item_id)
        REFERENCES items(id),

    CHECK (growth_time > 0)
);

CREATE TABLE recipes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    production_time INTEGER NOT NULL,

    CHECK (production_time > 0)
);

CREATE TABLE recipe_inputs (
    recipe_id UUID NOT NULL,
    item_id UUID NOT NULL,
    quantity BIGINT NOT NULL,

    PRIMARY KEY (recipe_id, item_id),

    FOREIGN KEY (recipe_id)
        REFERENCES recipes(id)
        ON DELETE CASCADE,

    FOREIGN KEY (item_id)
        REFERENCES items(id),

    CHECK (quantity > 0)
);

CREATE TABLE recipe_outputs (
    recipe_id UUID NOT NULL,
    item_id UUID NOT NULL,
    quantity BIGINT NOT NULL,

    PRIMARY KEY (recipe_id, item_id),

    FOREIGN KEY (recipe_id)
        REFERENCES recipes(id)
        ON DELETE CASCADE,

    FOREIGN KEY (item_id)
        REFERENCES items(id),

    CHECK (quantity > 0)
);

CREATE TABLE factory_jobs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    building_id UUID NOT NULL,
    recipe_id UUID NOT NULL,
    status recipe_status NOT NULL DEFAULT 'QUEUED',
    started_at TIMESTAMPTZ,
    finishes_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),

    FOREIGN KEY (building_id)
        REFERENCES buildings(id)
        ON DELETE CASCADE,

    FOREIGN KEY (recipe_id)
        REFERENCES recipes(id),

    CHECK (finishes_at IS NULL OR started_at IS NULL OR finishes_at > started_at)
);

-- =====================================================
-- PHASE 3: VEHICLES, LOGISTICS, MARKET
-- =====================================================

CREATE TABLE vehicle_types (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL UNIQUE,
    base_speed NUMERIC(10,2) NOT NULL,
    max_weight NUMERIC(18,2) NOT NULL,
    max_volume NUMERIC(18,2) NOT NULL,
    fuel_capacity NUMERIC(18,2) NOT NULL,
    fuel_usage_per_km NUMERIC(18,4) NOT NULL,

    CHECK (base_speed > 0),
    CHECK (max_weight > 0),
    CHECK (max_volume > 0),
    CHECK (fuel_capacity >= 0),
    CHECK (fuel_usage_per_km >= 0)
);

CREATE TABLE vehicles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    vehicle_type_id UUID NOT NULL,
    current_node_id UUID,
    name VARCHAR(100),
    health NUMERIC(5,2) NOT NULL DEFAULT 100,
    fuel NUMERIC(18,2) NOT NULL DEFAULT 0,
    status vehicle_status NOT NULL DEFAULT 'IDLE',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    FOREIGN KEY (company_id)
        REFERENCES companies(id)
        ON DELETE CASCADE,

    FOREIGN KEY (vehicle_type_id)
        REFERENCES vehicle_types(id),

    FOREIGN KEY (current_node_id)
        REFERENCES nodes(id),

    CHECK (health BETWEEN 0 AND 100),
    CHECK (fuel >= 0)
);

CREATE TABLE transport_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    company_id UUID NOT NULL,
    pickup_building_id UUID NOT NULL,
    delivery_building_id UUID NOT NULL,
    status transport_order_status NOT NULL DEFAULT 'PENDING',
    created_at TIMESTAMPTZ DEFAULT NOW(),

    FOREIGN KEY (company_id)
        REFERENCES companies(id),

    FOREIGN KEY (pickup_building_id)
        REFERENCES buildings(id),

    FOREIGN KEY (delivery_building_id)
        REFERENCES buildings(id),

    CHECK (pickup_building_id <> delivery_building_id)
);

CREATE TABLE transport_order_items (
    transport_order_id UUID NOT NULL,
    item_id UUID NOT NULL,
    quantity BIGINT NOT NULL,

    PRIMARY KEY (transport_order_id, item_id),

    FOREIGN KEY (transport_order_id)
        REFERENCES transport_orders(id)
        ON DELETE CASCADE,

    FOREIGN KEY (item_id)
        REFERENCES items(id),

    CHECK (quantity > 0)
);

-- FIX (was CRITICAL bug): vehicle_id was globally UNIQUE, meaning a vehicle
-- could only ever be assigned one route in its entire lifetime. Uniqueness
-- is now scoped to only ACTIVE routes via a partial index below.
CREATE TABLE vehicle_routes (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL,
    transport_order_id UUID,
    origin_node_id UUID NOT NULL,
    destination_node_id UUID NOT NULL,
    status vehicle_route_status NOT NULL DEFAULT 'ACTIVE',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    completed_at TIMESTAMPTZ,

    FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
        ON DELETE CASCADE,

    FOREIGN KEY (transport_order_id)
        REFERENCES transport_orders(id)
        ON DELETE SET NULL,

    FOREIGN KEY (origin_node_id)
        REFERENCES nodes(id),

    FOREIGN KEY (destination_node_id)
        REFERENCES nodes(id),

    CHECK (origin_node_id <> destination_node_id),
    CHECK (completed_at IS NULL OR completed_at >= created_at)
);

-- Only one ACTIVE route per vehicle at a time; completed/failed/cancelled
-- routes no longer block new ones.
CREATE UNIQUE INDEX idx_one_active_route_per_vehicle
ON vehicle_routes(vehicle_id)
WHERE status = 'ACTIVE';

CREATE TABLE vehicle_route_steps (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    route_id UUID NOT NULL,
    step_order INTEGER NOT NULL,
    node_id UUID NOT NULL,
    estimated_arrival TIMESTAMPTZ,

    FOREIGN KEY (route_id)
        REFERENCES vehicle_routes(id)
        ON DELETE CASCADE,

    FOREIGN KEY (node_id)
        REFERENCES nodes(id),

    CHECK (step_order >= 0),

    UNIQUE (route_id, step_order)
);

-- FIX (was CRITICAL bug): vehicle_id was globally UNIQUE, meaning a vehicle
-- could only ever move once in its entire lifetime. Uniqueness is now
-- scoped to only IN_PROGRESS movements via a partial index below.
CREATE TABLE vehicle_movements (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    vehicle_id UUID NOT NULL,
    from_node_id UUID NOT NULL,
    to_node_id UUID NOT NULL,
    started_at TIMESTAMPTZ NOT NULL,
    arrival_time TIMESTAMPTZ NOT NULL,
    calculated_speed NUMERIC(10,2) NOT NULL,
    cargo_weight NUMERIC(18,2) NOT NULL,
    status movement_status NOT NULL DEFAULT 'IN_PROGRESS',

    FOREIGN KEY (vehicle_id)
        REFERENCES vehicles(id)
        ON DELETE CASCADE,

    FOREIGN KEY (from_node_id)
        REFERENCES nodes(id),

    FOREIGN KEY (to_node_id)
        REFERENCES nodes(id),

    CHECK (from_node_id <> to_node_id),
    CHECK (arrival_time > started_at),
    CHECK (calculated_speed > 0),
    CHECK (cargo_weight >= 0)
);

-- Only one IN_PROGRESS movement per vehicle at a time.
CREATE UNIQUE INDEX idx_one_active_movement_per_vehicle
ON vehicle_movements(vehicle_id)
WHERE status = 'IN_PROGRESS';

CREATE TABLE marketplaces (
    building_id UUID PRIMARY KEY,
    tax_rate NUMERIC(5,2) NOT NULL DEFAULT 0,

    FOREIGN KEY (building_id)
        REFERENCES buildings(id)
        ON DELETE CASCADE,

    CHECK (tax_rate >= 0 AND tax_rate <= 100)
);

CREATE TABLE market_orders (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    marketplace_id UUID NOT NULL,
    company_id UUID NOT NULL,
    item_id UUID NOT NULL,
    quantity BIGINT NOT NULL,
    price NUMERIC(18,2) NOT NULL,
    order_type order_type NOT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    FOREIGN KEY (marketplace_id)
        REFERENCES marketplaces(building_id),

    FOREIGN KEY (company_id)
        REFERENCES companies(id),

    FOREIGN KEY (item_id)
        REFERENCES items(id),

    -- FIX (was missing): quantity/price had no validation at all.
    CHECK (quantity > 0),
    CHECK (price >= 0)
);

CREATE TABLE transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    sender_company_id UUID,
    receiver_company_id UUID,
    amount NUMERIC(18,2) NOT NULL,
    description TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW(),

    FOREIGN KEY (sender_company_id)
        REFERENCES companies(id),

    FOREIGN KEY (receiver_company_id)
        REFERENCES companies(id),

    -- FIX (was missing): assumes amount always represents a positive
    -- transfer magnitude, with direction encoded via sender/receiver.
    -- Change to allow negative values if you need refund/adjustment rows.
    CHECK (amount > 0),
    CHECK (sender_company_id IS DISTINCT FROM receiver_company_id)
);

CREATE TABLE event_logs (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    event_type VARCHAR(100) NOT NULL,
    reference_id UUID,
    payload JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW()
    -- NOTE: reference_id intentionally has no FK (polymorphic reference
    -- across multiple tables). Enforce validity at the application layer.
);

-- =====================================================
-- INDEXES
-- =====================================================

-- Phase 1
CREATE INDEX idx_company_members_player ON company_members(player_id);
CREATE INDEX idx_nodes_region ON nodes(region_id);
CREATE INDEX idx_roads_from ON roads(from_node_id);
CREATE INDEX idx_roads_to ON roads(to_node_id);
CREATE INDEX idx_roads_blocked ON roads(is_blocked);
CREATE INDEX idx_road_upgrade_tiers_type ON road_upgrade_tiers(road_type);
CREATE INDEX idx_road_upgrades_road ON road_upgrades(road_id);
CREATE INDEX idx_road_upgrades_status ON road_upgrades(status);
CREATE INDEX idx_buildings_company ON buildings(company_id);
CREATE INDEX idx_buildings_type ON buildings(building_type);

-- Phase 2
CREATE INDEX idx_inventory_owner ON inventories(owner_type, owner_id);
CREATE INDEX idx_inventory_items_item ON inventory_items(item_id);
CREATE INDEX idx_factory_jobs_building ON factory_jobs(building_id);
CREATE INDEX idx_factory_jobs_status ON factory_jobs(status);

-- Phase 3
CREATE INDEX idx_vehicle_company ON vehicles(company_id);
CREATE INDEX idx_vehicle_status ON vehicles(status);
CREATE INDEX idx_route_vehicle ON vehicle_routes(vehicle_id);
CREATE INDEX idx_route_steps ON vehicle_route_steps(route_id, step_order);
CREATE INDEX idx_transport_status ON transport_orders(status);
CREATE INDEX idx_market_item ON market_orders(item_id);
CREATE INDEX idx_market_company ON market_orders(company_id);
CREATE INDEX idx_event_logs ON event_logs(event_type);
CREATE INDEX idx_transactions_created ON transactions(created_at);
