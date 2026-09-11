-- Warung Supplier 마이그레이션
-- warung-pos / warung-stock과 같은 Supabase 프로젝트에 실행하세요 (SQL Editor).
-- 기존 products / daily_stock 등 warung-stock 테이블은 건드리지 않습니다.

create table if not exists providers (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  phone1 text,
  phone2 text,
  payment_cycle text not null default 'harian' check (payment_cycle in ('harian', 'mingguan', 'bulanan')),
  created_at timestamptz not null default now()
);

-- 이름 대소문자/앞뒤 공백 차이로 중복 등록되는 걸 막기 위한 정규화 유니크 인덱스.
create unique index if not exists providers_name_unique_idx on providers (lower(trim(name)));

-- 프로바이더가 납품하는 품목. 같은 상품명이라도 프로바이더가 다르면 별도 행(가격도 따로).
create table if not exists supplier_products (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id) on delete set null,
  name text not null,
  category text,
  net_price integer,
  gross_price integer,
  due_days integer not null default 1,
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create index if not exists idx_supplier_products_provider on supplier_products (provider_id);

-- ⚠️ 프로토타입 단계: RLS 비활성화 (warung-stock과 동일한 전제)
alter table providers disable row level security;
alter table supplier_products disable row level security;

-- 매일 아침 납품 기록. 상품당 하루 한 행 (같은 상품이 하루에 두 번 납품되는 일은 없다는 전제).
-- product_name/unit_cost/due_date는 납품 시점 스냅샷 — 나중에 supplier_products 값이 바뀌어도
-- 과거 납품 기록의 금액/기한은 그대로 유지됩니다.
create table if not exists delivery_items (
  id uuid primary key default gen_random_uuid(),
  delivery_date date not null default current_date,
  provider_id uuid references providers(id) on delete set null,
  supplier_product_id uuid references supplier_products(id) on delete set null,
  product_name text not null,
  qty integer not null default 0,
  unit_cost integer not null default 0,
  due_date date not null,
  cleared boolean not null default false,
  paid boolean not null default false,
  payment_id uuid,
  created_at timestamptz not null default now(),
  unique (supplier_product_id, delivery_date)
);

create index if not exists idx_delivery_items_date on delivery_items (delivery_date);
create index if not exists idx_delivery_items_due on delivery_items (due_date);
create index if not exists idx_delivery_items_provider on delivery_items (provider_id);

-- 프로바이더별 대금 정산 기록. 결제 시점에 밀려있던 delivery_items를 한꺼번에 paid=true로 묶습니다.
create table if not exists payments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references providers(id) on delete set null,
  provider_name text not null,
  amount integer not null,
  paid_at timestamptz not null default now(),
  created_at timestamptz not null default now()
);

alter table delivery_items
  add constraint if not exists delivery_items_payment_fk foreign key (payment_id) references payments(id) on delete set null;

alter table delivery_items disable row level security;
alter table payments disable row level security;
