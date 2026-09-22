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

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'delivery_items_payment_fk'
  ) then
    alter table delivery_items
      add constraint delivery_items_payment_fk foreign key (payment_id) references payments(id) on delete set null;
  end if;
end $$;

alter table delivery_items disable row level security;
alter table payments disable row level security;

-- 정산 시 할인 판매 / 폐기 수량 반영: 정상 수량은 원가, 할인 수량은 할인가, 폐기 수량은 대금 없음.
-- 원래 납품 수량(qty)은 이력 보존을 위해 그대로 두고, 정산 시점에만 이 컬럼들을 채웁니다.
alter table delivery_items add column if not exists discount_qty integer not null default 0;
alter table delivery_items add column if not exists discount_price integer;
alter table delivery_items add column if not exists waste_qty integer not null default 0;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'delivery_items_settlement_check'
  ) then
    alter table delivery_items
      add constraint delivery_items_settlement_check
      check (discount_qty >= 0 and waste_qty >= 0 and discount_qty + waste_qty <= qty);
  end if;
end $$;

-- 감열 프린터(RawBT / Bluetooth Print 앱의 "Browser/Website Print" 기능)용 영수증 JSON.
-- 이 함수는 결제 1건을 받아 앱이 이해하는 인쇄 항목 배열(JSON)을 돌려줍니다.
-- PostgREST를 통해 GET으로 호출됩니다: /rest/v1/rpc/get_receipt_print_json?p_payment_id=...&apikey=...
create or replace function get_receipt_print_json(p_payment_id uuid)
returns json
language plpgsql
stable
as $$
declare
  v_line_width constant int := 32;
  v_payment payments%rowtype;
  v_item record;
  v_entries json[] := '{}';
  v_price_text text;
  v_name_text text;
  v_result json;
  v_normal_qty int;
  v_row_total int;
begin
  select * into v_payment from payments where id = p_payment_id;

  if not found then
    -- Bluetooth Print 앱은 최상위 응답이 배열이 아니라 "0","1",... 키를 가진
    -- 객체여야 한다 (PHP json_encode(..., JSON_FORCE_OBJECT)와 동일한 형태).
    return json_build_object(
      '0', json_build_object('type', 0, 'content', 'Pembayaran tidak ditemukan', 'bold', 1, 'align', 1, 'format', 0)
    );
  end if;

  v_entries := array_append(v_entries, json_build_object(
    'type', 0, 'content', 'Warung Ceria Aneka Kue', 'bold', 1, 'align', 1, 'format', 1
  ));
  v_entries := array_append(v_entries, json_build_object(
    'type', 0, 'content', 'Jl. Merpati No. 44', 'bold', 0, 'align', 1, 'format', 0
  ));
  v_entries := array_append(v_entries, json_build_object(
    'type', 0, 'content', 'Denpasar Barat', 'bold', 0, 'align', 1, 'format', 0
  ));
  v_entries := array_append(v_entries, json_build_object(
    'type', 0, 'content', 'WA 085238848579', 'bold', 0, 'align', 1, 'format', 0
  ));
  v_entries := array_append(v_entries, json_build_object(
    'type', 0, 'content', '--------------------------------', 'bold', 0, 'align', 0, 'format', 0
  ));
  v_entries := array_append(v_entries, json_build_object(
    'type', 0, 'content', 'Tanda Terima Pembayaran', 'bold', 1, 'align', 1, 'format', 0
  ));
  v_entries := array_append(v_entries, json_build_object(
    'type', 0, 'content', v_payment.provider_name, 'bold', 0, 'align', 1, 'format', 0
  ));
  v_entries := array_append(v_entries, json_build_object(
    'type', 0,
    'content', to_char(v_payment.paid_at at time zone 'Asia/Jakarta', 'DD/MM/YYYY HH24:MI'),
    'bold', 0, 'align', 1, 'format', 0
  ));
  v_entries := array_append(v_entries, json_build_object(
    'type', 0, 'content', '--------------------------------', 'bold', 0, 'align', 0, 'format', 0
  ));

  for v_item in
    select product_name, qty, unit_cost, discount_qty, discount_price, waste_qty
    from delivery_items
    where payment_id = p_payment_id
    order by product_name
  loop
    v_normal_qty := v_item.qty - coalesce(v_item.discount_qty, 0) - coalesce(v_item.waste_qty, 0);
    v_row_total := v_normal_qty * v_item.unit_cost + coalesce(v_item.discount_qty, 0) * coalesce(v_item.discount_price, 0);
    v_price_text := 'Rp' || replace(trim(to_char(v_row_total, '999,999,999')), ',', '.');
    v_name_text := left(v_item.product_name, greatest(1, v_line_width - length(v_price_text) - 1));

    -- 1줄: 상품명 왼쪽, 정산 금액 오른쪽 (줄 폭에 맞춰 공백으로 정렬)
    v_entries := array_append(v_entries, json_build_object(
      'type', 0,
      'content', v_name_text ||
        repeat(' ', greatest(1, v_line_width - length(v_name_text) - length(v_price_text))) ||
        v_price_text,
      'bold', 0, 'align', 0, 'format', 0
    ));

    if v_normal_qty > 0 then
      v_entries := array_append(v_entries, json_build_object(
        'type', 0,
        'content', '  ' || v_normal_qty || ' x Rp' ||
          replace(trim(to_char(v_item.unit_cost, '999,999,999')), ',', '.'),
        'bold', 0, 'align', 0, 'format', 0
      ));
    end if;
    if coalesce(v_item.discount_qty, 0) > 0 then
      v_entries := array_append(v_entries, json_build_object(
        'type', 0,
        'content', '  ' || v_item.discount_qty || ' diskon x Rp' ||
          replace(trim(to_char(coalesce(v_item.discount_price, 0), '999,999,999')), ',', '.'),
        'bold', 0, 'align', 0, 'format', 0
      ));
    end if;
    if coalesce(v_item.waste_qty, 0) > 0 then
      v_entries := array_append(v_entries, json_build_object(
        'type', 0,
        'content', '  ' || v_item.waste_qty || ' rusak/dibuang',
        'bold', 0, 'align', 0, 'format', 0
      ));
    end if;
  end loop;

  v_entries := array_append(v_entries, json_build_object(
    'type', 0, 'content', '--------------------------------', 'bold', 0, 'align', 0, 'format', 0
  ));
  v_entries := array_append(v_entries, json_build_object(
    'type', 0,
    'content', 'Total: Rp' || replace(trim(to_char(v_payment.amount, '999,999,999')), ',', '.'),
    'bold', 1, 'align', 2, 'format', 0
  ));

  -- 배열을 "0","1","2",... 키를 가진 객체로 변환 (Bluetooth Print 앱이 요구하는 형태).
  select json_object_agg((ord - 1)::text, entry order by ord)
  into v_result
  from unnest(v_entries) with ordinality as t(entry, ord);

  return v_result;
end;
$$;

grant execute on function get_receipt_print_json(uuid) to anon;

-- Pesanan pelanggan (pesanan borongan yang selama ini ditulis tangan di nota).
-- Beda dari delivery_items (penerimaan barang DARI provider): ini pesanan KE pelanggan.
create table if not exists customer_orders (
  id uuid primary key default gen_random_uuid(),
  customer_name text not null,
  pickup_date date not null,
  pickup_time text,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_orders_pickup_date on customer_orders (pickup_date);

create table if not exists customer_order_items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references customer_orders(id) on delete cascade,
  provider_id uuid references providers(id) on delete set null,
  supplier_product_id uuid references supplier_products(id) on delete set null,
  product_name text not null,
  qty integer not null default 0,
  unit_price integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_order_items_order on customer_order_items (order_id);

-- ⚠️ Prototipe: RLS nonaktif, sama seperti tabel lain di sini.
alter table customer_orders disable row level security;
alter table customer_order_items disable row level security;
