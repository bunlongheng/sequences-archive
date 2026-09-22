-- API request log: every programmatic call that creates (or tries to create) a
-- sequence is recorded here with its provenance, so traffic can be attributed
-- to a caller and rate-limited later if one gets out of control.
--
-- Deliberately NOT a foreign key to sequences: deleting a diagram must not
-- erase the record of who asked for it. The database is shared with sibling
-- apps, hence the sequence_ prefix on the table name.

create table if not exists public.sequence_api_requests (
  id          bigserial primary key,
  created_at  timestamptz not null default now(),
  route       text        not null,
  method      text        not null default 'POST',
  status      int         not null,
  sequence_id uuid,
  key_label   text,
  ip          text,
  country     text,
  city        text,
  user_agent  text,
  referer     text,
  origin      text,
  title       text,
  bytes       int
);

create index if not exists idx_sequence_api_requests_created on public.sequence_api_requests (created_at desc);
create index if not exists idx_sequence_api_requests_ip      on public.sequence_api_requests (ip, created_at desc);
create index if not exists idx_sequence_api_requests_seq     on public.sequence_api_requests (sequence_id);

comment on table public.sequence_api_requests is
  'Provenance log for programmatic sequence creation (POST /api/ai/sequences, POST /api/sequences with a Bearer). Never stores the secret itself, only which key name matched.';
