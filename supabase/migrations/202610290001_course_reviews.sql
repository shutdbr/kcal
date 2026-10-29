-- Run once in a new Supabase project's SQL editor (or via supabase db push).
begin;

create schema if not exists private;
revoke all on schema private from public, anon, authenticated;

create table private.review_settings (
  singleton boolean primary key default true check (singleton),
  allowed_email_domains text[] not null default '{}'
);
-- Exact domain only: subdomains and lookalike suffixes are not eligible.
insert into private.review_settings (singleton, allowed_email_domains)
values (true, array['krea.ac.in']);

create function public.can_review() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from auth.users u
    join auth.identities i on i.user_id = u.id and i.provider = 'google'
    cross join private.review_settings s
    where u.id = (select auth.uid())
      and u.email_confirmed_at is not null
      and lower(i.identity_data ->> 'email') = lower(u.email)
      and lower(split_part(u.email, '@', 2)) = any(s.allowed_email_domains)
  );
$$;
revoke all on function public.can_review() from public;
grant execute on function public.can_review() to authenticated;

create table public.course_reviews (
  course_code text not null check (course_code ~ '^[A-Z]{2,8}[0-9]{3}[A-Z]?$'),
  user_id uuid not null references auth.users(id) on delete cascade,
  display_name text not null check (char_length(btrim(display_name)) between 1 and 60),
  difficulty smallint not null check (difficulty between 1 and 5),
  comment text not null default '' check (char_length(comment) <= 1000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (course_code, user_id)
);

create function private.stamp_course_review() returns trigger
language plpgsql set search_path = '' as $$
begin
  if TG_OP = 'UPDATE' then
    if new.user_id <> old.user_id or new.course_code <> old.course_code then
      raise exception 'Review ownership and course cannot be changed';
    end if;
    new.created_at := old.created_at;
  else
    new.created_at := now();
  end if;
  new.updated_at := now();
  new.display_name := btrim(new.display_name);
  new.comment := btrim(new.comment);
  return new;
end;
$$;
revoke all on function private.stamp_course_review() from public;
create trigger stamp_course_review before insert or update on public.course_reviews
for each row execute function private.stamp_course_review();

alter table public.course_reviews enable row level security;
revoke all on public.course_reviews from anon, authenticated;
grant select on public.course_reviews to anon, authenticated;
grant insert (course_code, user_id, display_name, difficulty, comment),
      update (display_name, difficulty, comment, course_code, user_id),
      delete on public.course_reviews to authenticated;

create policy "Anyone can read reviews" on public.course_reviews
for select to anon, authenticated using (true);
create policy "Eligible students can create their own review" on public.course_reviews
for insert to authenticated with check (
  (select auth.uid()) = user_id and (select public.can_review())
);
create policy "Eligible students can update their own review" on public.course_reviews
for update to authenticated using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id and (select public.can_review()));
-- Owners can remove their contribution even if their domain is later disallowed.
create policy "Owners can delete their review" on public.course_reviews
for delete to authenticated using ((select auth.uid()) = user_id);

commit;
