-- READ-ONLY verification after applying 0033. Run in the SQL editor as is;
-- it changes nothing. Every row should read pass = true.
--
-- Schema rows check that 0033 is fully in place, that 0023 was NOT run and
-- that Realtime still publishes chat messages. Invariant rows must hold at
-- any time after 0033 (immediately after the migration and after traffic).
-- The last rows are informational counts (pass is always true).
with
linked as (select key, home_key from public.store_chat_threads where home_key is not null),
checks(check_name, actual, expected, pass) as (
  -- ---- schema
  select 'columns: home_key, order_ref, confirmations.order_ref',
         count(*)::text, '3', count(*) = 3
    from information_schema.columns
   where table_schema = 'public'
     and (table_name, column_name) in (('store_chat_threads', 'home_key'),
                                       ('store_order_messages', 'order_ref'),
                                       ('store_payment_confirmations', 'order_ref'))
  union all
  select 'functions: attach, send_recommendation',
         count(*)::text, '2', count(*) = 2
    from pg_proc p join pg_namespace n on n.oid = p.pronamespace
   where n.nspname = 'public' and p.proname in ('store_attach_order_to_customer', 'store_send_recommendation')
  union all
  select 'tables: store_order_recommendations, store_chat_settings',
         count(*)::text, '2', count(*) = 2
    from pg_class where oid in (to_regclass('public.store_order_recommendations'), to_regclass('public.store_chat_settings'))
  union all
  select 'recovery switch row (unified_order_chat)',
         coalesce(string_agg(unified_order_chat::text, ','), 'missing'), 'true',
         coalesce(bool_and(unified_order_chat), false) and count(*) = 1
    from public.store_chat_settings
  union all
  select 'guard trigger enabled',
         coalesce(max(tgenabled::text), 'missing'), 'O', coalesce(max(tgenabled::text), '') = 'O'
    from pg_trigger where tgname = 'store_order_messages_thread_guard' and not tgisinternal
  union all
  select 'message kinds include product',
         (pg_get_constraintdef(oid) like '%product%')::text, 'true', pg_get_constraintdef(oid) like '%product%'
    from pg_constraint where conname = 'store_order_messages_kind_valid'
  union all
  select 'one-slip indexes (legacy + per order)',
         count(*)::text, '2', count(*) = 2
    from pg_indexes where schemaname = 'public'
     and indexname in ('store_order_messages_one_slip_idx', 'store_order_messages_one_slip_per_order_idx')
  union all
  select 'inbox returns order_count / latest_order_number',
         count(*)::text, '2', count(*) = 2
    from pg_proc p, unnest(p.proargnames) a
   where p.proname = 'store_admin_inbox' and a in ('order_count', 'latest_order_number')
  union all
  select '0023 NOT run (legacy read-sync trigger still present)',
         count(*)::text, '1', count(*) = 1
    from pg_trigger where tgname = 'store_order_messages_legacy_read_sync' and not tgisinternal
  union all
  select 'Realtime still publishes store_order_messages',
         count(*)::text, '1', count(*) = 1
    from pg_publication_tables where pubname = 'supabase_realtime' and schemaname = 'public' and tablename = 'store_order_messages'
  -- ---- invariants (must be 0 forever)
  union all
  select 'messages inside a linked order thread',
         count(*)::text, '0', count(*) = 0
    from public.store_order_messages m join linked l on l.key = m.order_number
  union all
  select 'order_ref not linked to the message''s conversation',
         count(*)::text, '0', count(*) = 0
    from public.store_order_messages m
   where m.order_ref is not null
     and not exists (select 1 from linked l where l.key = m.order_ref and l.home_key = m.order_number)
  union all
  select 'order_ref on a kind other than slip/payment',
         count(*)::text, '0', count(*) = 0
    from public.store_order_messages where order_ref is not null and kind not in ('slip', 'payment')
  union all
  select 'linked order owner differs from conversation owner',
         count(*)::text, '0', count(*) = 0
    from linked l
    join public.store_order_snapshots s on s.order_number = l.key
    join public.store_chat_threads h on h.key = l.home_key
   where h.kind <> 'inquiry' or s.owner_user_id is distinct from h.owner_user_id
  union all
  select 'linked orders without exactly one slip',
         count(*)::text, '0', count(*) = 0
    from linked l
   where (select count(*) from public.store_order_messages m
           where m.kind = 'slip' and m.order_ref = l.key) <> 1
  union all
  select 'order payment card amount differs from its order total',
         count(*)::text, '0', count(*) = 0
    from public.store_order_messages m
    join public.store_order_snapshots s on s.order_number = m.order_ref
   where m.kind = 'payment' and (m.payload ->> 'amount')::numeric <> s.total_amount
  union all
  select 'confirmation order differs from its card''s order',
         count(*)::text, '0', count(*) = 0
    from public.store_payment_confirmations pc
    join public.store_order_messages m on m.id = pc.message_id
   where pc.order_ref is distinct from m.order_ref or pc.order_number <> m.order_number
  union all
  select 'conversation marked Paid while an order/quote card is unconfirmed',
         count(*)::text, '0', count(*) = 0
    from public.store_order_conversations c
   where c.payment_request_message_id is not null
     and c.payment_request_message_id = c.payment_received_message_id
     and exists (
       select 1 from (
         select distinct on (coalesce(m.order_ref, '')) m.id
           from public.store_order_messages m
          where m.order_number = c.order_number and m.kind = 'payment'
          order by coalesce(m.order_ref, ''), m.created_at desc, m.id desc
       ) latest
        where not exists (select 1 from public.store_payment_confirmations pc where pc.message_id = latest.id))
  union all
  select 'recommendation links to a card outside the order''s conversation',
         count(*)::text, '0', count(*) = 0
    from public.store_order_recommendations r
    join public.store_order_messages m on m.id = r.message_id
    left join linked l on l.key = r.order_number
   where m.kind <> 'product' or l.home_key is distinct from m.order_number
  -- ---- information (always pass)
  union all
  select 'info: orders in customer conversations', count(*)::text, 'any', true from linked
  union all
  select 'info: older order chats with messages (kept separate)',
         count(distinct m.order_number)::text, 'any', true
    from public.store_order_messages m join public.store_chat_threads t on t.key = m.order_number
   where t.kind = 'order' and t.home_key is null
  union all
  select 'info: product cards sent', count(*)::text, 'any', true from public.store_order_messages where kind = 'product'
)
select check_name, actual, expected, pass from checks;
