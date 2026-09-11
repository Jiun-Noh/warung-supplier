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
