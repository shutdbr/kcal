-- Named plans are private documents. Curriculum data remains versioned with the app.
begin;

create table public.plans (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null check (char_length(btrim(name)) between 1 and 100),
  snapshot jsonb not null,
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint valid_plan_document check (
    jsonb_typeof(snapshot) = 'object'
    and snapshot @> '{"version": 1}'::jsonb
    and snapshot ? 'placements' and jsonb_typeof(snapshot->'placements') = 'object'
    and snapshot ? 'picks' and jsonb_typeof(snapshot->'picks') = 'object'
    and not jsonb_path_exists(snapshot, 'strict $.placements.* ? (@.type() != "array")')
    and not jsonb_path_exists(snapshot, 'strict $.placements.*[*] ? (@.type() != "string")')
    and octet_length(snapshot::text) <= 256000
  )
);

create index plans_owner_created on public.plans (user_id, created_at desc, id);
alter table public.plans enable row level security;

revoke all on public.plans from public, anon, authenticated;
grant select, delete on public.plans to authenticated;
grant insert (user_id, name, snapshot) on public.plans to authenticated;
grant update (name, snapshot) on public.plans to authenticated;

create policy plans_select on public.plans for select to authenticated
  using ((select auth.uid()) = user_id);
create policy plans_insert on public.plans for insert to authenticated
  with check ((select auth.uid()) = user_id);
create policy plans_update on public.plans for update to authenticated
  using ((select auth.uid()) = user_id) with check ((select auth.uid()) = user_id);
create policy plans_delete on public.plans for delete to authenticated
  using ((select auth.uid()) = user_id);

create function public.stamp_plan() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.name := btrim(new.name);
  if TG_OP = 'INSERT' then
    new.revision := 1;
    new.created_at := now();
  else
    if new.id <> old.id or new.user_id <> old.user_id then
      raise exception 'Plan ownership and identity cannot change';
    end if;
    new.revision := old.revision + 1;
    new.created_at := old.created_at;
  end if;
  new.updated_at := now();
  return new;
end;
$$;
revoke all on function public.stamp_plan() from public, anon, authenticated;
create trigger stamp_plan before insert or update on public.plans
  for each row execute function public.stamp_plan();

commit;
