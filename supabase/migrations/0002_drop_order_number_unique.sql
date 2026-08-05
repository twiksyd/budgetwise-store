-- The Store inserts one `orders` row per gamepass in a cart, with multiple
-- rows sharing the same order_number to represent one checkout. This
-- requires order_number to no longer be unique per row.
alter table public.orders drop constraint orders_order_number_key;
