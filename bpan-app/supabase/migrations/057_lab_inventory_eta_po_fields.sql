-- Add explicit purchase-order and expected-arrival tracking for reagent stock events.

alter table public.lab_reagent_stock_events
  add column if not exists purchase_order_number text,
  add column if not exists expected_arrival_at timestamptz;

create index if not exists lab_reagent_stock_events_po_idx
  on public.lab_reagent_stock_events (purchase_order_number);

create index if not exists lab_reagent_stock_events_eta_idx
  on public.lab_reagent_stock_events (expected_arrival_at);

