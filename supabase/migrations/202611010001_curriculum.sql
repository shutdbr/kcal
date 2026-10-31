-- The curriculum: every course, lecturer and programme rule the compiler
-- resolves from the scrape and the departments' FYUP documents
-- (src/lib/curriculum/compiler.ts). Normalised tables are the record and
-- what /admin edits; publishing assembles them into one immutable snapshot
-- per release, which is all the app reads — one indexed row per request,
-- with a cache key that changes only when something is published.
--
-- Everyone may read the curriculum. Only admins write: a user whose
-- app_metadata.role is 'admin' (settable only with the service role).
begin;

create function public.is_admin() returns boolean
language sql stable set search_path = '' as $$
  select coalesce(auth.jwt() -> 'app_metadata' ->> 'role' = 'admin', false)
$$;

-- ── Catalogue ────────────────────────────────────────────────────────────

create table public.subjects (
  id text primary key check (id ~ '^[a-z][a-z ]{1,39}$'),
  label text not null check (char_length(label) between 1 and 60),
  short text not null check (char_length(short) between 1 and 12),
  majorable boolean not null,
  hue smallint check (hue between 0 and 360),
  position smallint not null unique
);

create table public.courses (
  code text primary key check (code ~ '^[A-Z]{2,5}[0-9]{3}[A-Z]?$'),
  position integer not null unique,
  title text not null check (char_length(title) between 1 and 300),
  subject_id text not null references public.subjects (id),
  credits numeric(4, 1) not null check (credits between 0 and 30),
  credits_pending boolean not null default false,
  -- the university's own flag; programmes decide what is required for whom
  flagged_required boolean not null,
  offered smallint[] not null default '{}' check (offered <@ '{1,2,3}'),
  eligible_years smallint[] not null default '{}' check (eligible_years <@ '{1,2,3,4,5}'),
  -- every term it ran, newest first ("25_T2")
  terms text[] not null default '{}' check (array_to_string(terms, ',') ~ '^([0-9]{2}_T[123](,|$))*$'),
  -- lecturer names as the term sheets spelled them; the search reads these
  taught_as text not null default '',
  credit_share text check (credit_share in ('one', 'all')),
  transcript_only boolean not null default false,
  retired boolean not null default false,
  description text check (char_length(description) <= 20000)
);
create index courses_subject on public.courses (subject_id);

-- One course, one code per department that lists it (ARTS229 = HIST235 = LITT235).
create table public.course_codes (
  code text primary key check (code ~ '^[A-Z]{2,5}[0-9]{3}[A-Z]?$'),
  course_code text not null references public.courses (code) on update cascade on delete cascade,
  position smallint not null,
  unique (course_code, position)
);
create table public.course_subjects (
  course_code text not null references public.courses (code) on update cascade on delete cascade,
  subject_id text not null references public.subjects (id),
  -- the code that subject's students see it under
  code text not null references public.course_codes (code) on update cascade on delete cascade,
  position smallint not null,
  primary key (course_code, subject_id),
  unique (course_code, position)
);

create table public.course_prerequisites (
  course_code text not null references public.courses (code) on update cascade on delete cascade,
  prerequisite_code text not null references public.courses (code) on update cascade on delete cascade,
  position smallint not null,
  primary key (course_code, prerequisite_code),
  check (course_code <> prerequisite_code)
);
create index course_prerequisites_reverse on public.course_prerequisites (prerequisite_code);

-- Separate courses that satisfy one another: any one of a group …
create table public.course_substitutes (
  group_id smallint not null,
  course_code text not null references public.courses (code) on update cascade on delete cascade,
  position smallint not null,
  primary key (group_id, course_code)
);
-- … and one way only: the maths course clears the applied one.
create table public.course_covers (
  maths_code text not null references public.courses (code) on update cascade on delete cascade,
  applied_code text not null references public.courses (code) on update cascade on delete cascade,
  position smallint not null unique,
  primary key (maths_code, applied_code)
);

create table public.lecturers (
  id text primary key check (char_length(id) between 1 and 120),
  position integer not null unique,
  name text not null check (char_length(name) between 1 and 120),
  email text not null default '',
  title text not null default '',
  office_hours text not null default '',
  image_url text not null default '',
  profile_url text not null default '',
  joined text
);
create table public.course_lecturers (
  course_code text not null references public.courses (code) on update cascade on delete cascade,
  lecturer_id text not null references public.lecturers (id) on update cascade on delete cascade,
  position smallint not null,
  primary key (course_code, lecturer_id)
);
create index course_lecturers_lecturer on public.course_lecturers (lecturer_id);

-- ── Programme rules ──────────────────────────────────────────────────────

-- The rules a run of batches graduates under; batches null = the default set.
create table public.requirement_sets (
  id text primary key check (id ~ '^[a-z0-9-]{1,40}$'),
  position smallint not null unique,
  name text not null,
  batches smallint[] check (batches is null or cardinality(batches) > 0)
);
create unique index one_default_requirement_set on public.requirement_sets ((batches is null)) where batches is null;

create table public.programmes (
  id bigint generated always as identity primary key,
  set_id text not null references public.requirement_sets (id) on update cascade on delete cascade,
  subject_id text not null references public.subjects (id),
  variant text not null check (variant in (
    'single_major_4yr', 'double_major_4yr', 'single_major_3yr', 'double_major_3yr',
    'minor_4yr', 'minor_3yr', 'concentration_4yr', 'concentration_3yr')),
  position integer not null,
  total_credits numeric(5, 1) not null check (total_credits >= 0),
  required_credits numeric(5, 1) check (required_credits >= 0),
  elective_credits numeric(5, 1) check (elective_credits >= 0),
  unique (set_id, subject_id, variant),
  unique (set_id, position)
);

-- required: always; pick: in a 'choose N' pool (counts as required); elective
create table public.programme_courses (
  programme_id bigint not null references public.programmes (id) on delete cascade,
  role text not null check (role in ('required', 'pick', 'elective')),
  course_code text not null references public.courses (code) on update cascade on delete cascade,
  position smallint not null,
  primary key (programme_id, role, course_code)
);

create table public.programme_choices (
  id bigint generated always as identity primary key,
  programme_id bigint not null references public.programmes (id) on delete cascade,
  position smallint not null,
  rule text not null check (char_length(rule) between 1 and 200),
  pick smallint not null check (pick > 0),
  unique (programme_id, position)
);
create table public.programme_choice_options (
  choice_id bigint not null references public.programme_choices (id) on delete cascade,
  position smallint not null,
  -- null: a course the department names but the catalogue doesn't have yet
  course_code text references public.course_codes (code) on update cascade on delete cascade,
  title text not null,
  primary key (choice_id, position)
);

create table public.programme_pathway (
  programme_id bigint not null references public.programmes (id) on delete cascade,
  position smallint not null,
  year smallint not null check (year between 1 and 5),
  trimester smallint not null check (trimester between 1 and 3),
  course_code text not null references public.courses (code) on update cascade on delete cascade,
  primary key (programme_id, position)
);

-- A rule for one batch only ("ENVS201, for the 2022 batch").
create table public.batch_rules (
  batch smallint not null check (batch between 2018 and 2100),
  subject_id text not null references public.subjects (id),
  variant text not null,
  required_credits numeric(5, 1),
  primary key (batch, subject_id, variant)
);
create table public.batch_rule_courses (
  batch smallint not null,
  subject_id text not null,
  variant text not null,
  course_code text not null references public.course_codes (code) on update cascade on delete cascade,
  verdict text not null check (verdict in ('required', 'elective')),
  position smallint not null,
  primary key (batch, subject_id, variant, course_code),
  foreign key (batch, subject_id, variant) references public.batch_rules on delete cascade
);

-- University-wide numbers (credit caps, audits) and the scrape date.
create table public.curriculum_settings (
  singleton boolean primary key default true check (singleton),
  updated_on date,
  rules jsonb not null check (jsonb_typeof(rules) = 'object')
);

-- ── Releases: what the app reads ─────────────────────────────────────────

create table public.curriculum_releases (
  id text primary key,
  snapshot jsonb not null,
  published_at timestamptz not null default now(),
  published_by uuid references auth.users (id) on delete set null,
  is_current boolean not null default false
);
create unique index one_current_release on public.curriculum_releases ((is_current)) where is_current;

-- ── Access ───────────────────────────────────────────────────────────────

do $$
declare t text;
begin
  foreach t in array array[
    'subjects', 'courses', 'course_codes', 'course_subjects', 'course_prerequisites',
    'course_substitutes', 'course_covers', 'lecturers', 'course_lecturers',
    'requirement_sets', 'programmes', 'programme_courses', 'programme_choices',
    'programme_choice_options', 'programme_pathway', 'batch_rules', 'batch_rule_courses',
    'curriculum_settings', 'curriculum_releases'
  ] loop
    execute format('alter table public.%I enable row level security', t);
    execute format('revoke all on public.%I from public, anon, authenticated', t);
    execute format('grant select on public.%I to anon, authenticated', t);
    execute format('create policy %I on public.%I for select to anon, authenticated using (true)', t || '_read', t);
    if t <> 'curriculum_releases' then
      execute format('grant insert, update, delete on public.%I to authenticated', t);
      execute format(
        'create policy %I on public.%I for all to authenticated using ((select public.is_admin())) with check ((select public.is_admin()))',
        t || '_admin', t);
    end if;
  end loop;
end $$;
-- releases are immutable: admins add one and move the current marker
grant insert, update (is_current) on public.curriculum_releases to authenticated;
create policy curriculum_releases_publish on public.curriculum_releases for insert to authenticated
  with check ((select public.is_admin()) and published_by = (select auth.uid()));
create policy curriculum_releases_switch on public.curriculum_releases for update to authenticated
  using ((select public.is_admin())) with check ((select public.is_admin()));

-- ── Assembling a release ─────────────────────────────────────────────────

-- The tables as one CurriculumSnapshot (src/lib/curriculum/snapshot.ts),
-- every list in its stored order.
create function public.assemble_curriculum() returns jsonb
language sql stable set search_path = '' as $$
  select jsonb_build_object(
    'format', 1,
    'updatedOn', (select updated_on from public.curriculum_settings),
    'rules', (select rules from public.curriculum_settings),
    'subjects', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', s.id, 'label', s.label, 'short', s.short, 'majorable', s.majorable, 'hue', s.hue
      )) order by s.position), '[]') from public.subjects s),
    'courses', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'code', c.code,
        'title', c.title,
        'faculty', c.taught_as,
        'subject', c.subject_id,
        'subjects', (select jsonb_agg(cs.subject_id order by cs.position) from public.course_subjects cs where cs.course_code = c.code),
        'codes', (select jsonb_agg(cc.code order by cc.position) from public.course_codes cc where cc.course_code = c.code),
        'codesBySubject', coalesce((select jsonb_object_agg(cs.subject_id, cs.code) from public.course_subjects cs where cs.course_code = c.code), '{}'),
        'credits', c.credits,
        'pendingCredits', nullif(c.credits_pending, false),
        'required', c.flagged_required,
        'offered', to_jsonb(c.offered),
        'eligibleYears', to_jsonb(c.eligible_years),
        'prereqs', coalesce((select jsonb_agg(p.prerequisite_code order by p.position) from public.course_prerequisites p where p.course_code = c.code), '[]'),
        'share', c.credit_share,
        'retired', nullif(c.retired, false),
        'terms', to_jsonb(c.terms),
        'lecturers', coalesce((select jsonb_agg(cl.lecturer_id order by cl.position) from public.course_lecturers cl where cl.course_code = c.code), '[]')
      )) order by c.position), '[]') from public.courses c),
    'lecturers', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'id', l.id, 'name', l.name, 'email', l.email, 'position', l.title, 'office_hours', l.office_hours,
        'image_url', l.image_url, 'url', l.profile_url, 'date_of_joining', l.joined
      )) order by l.position), '[]') from public.lecturers l),
    'equivalences', jsonb_build_object(
      'substitutes', (
        select coalesce(jsonb_agg(g.codes order by g.group_id), '[]') from (
          select group_id, jsonb_agg(course_code order by position) codes from public.course_substitutes group by group_id) g),
      'covers', (
        select coalesce(jsonb_agg(jsonb_build_object('maths', maths_code, 'applied', applied_code) order by position), '[]')
        from public.course_covers),
      'transcriptOnly', (
        select coalesce(jsonb_agg(code order by position), '[]') from public.courses where transcript_only)),
    'requirementSets', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', rs.id, 'name', rs.name, 'batches', to_jsonb(rs.batches),
        'programmes', (
          select coalesce(jsonb_agg(jsonb_build_object(
            'subject', p.subject_id,
            'variant', p.variant,
            'credits', jsonb_build_object('total', p.total_credits, 'required', p.required_credits, 'elective', p.elective_credits),
            'required', coalesce((select jsonb_agg(pc.course_code order by pc.position) from public.programme_courses pc where pc.programme_id = p.id and pc.role = 'required'), '[]'),
            'picks', coalesce((select jsonb_agg(pc.course_code order by pc.position) from public.programme_courses pc where pc.programme_id = p.id and pc.role = 'pick'), '[]'),
            'electives', coalesce((select jsonb_agg(pc.course_code order by pc.position) from public.programme_courses pc where pc.programme_id = p.id and pc.role = 'elective'), '[]'),
            'choices', coalesce((
              select jsonb_agg(jsonb_build_object(
                'rule', ch.rule, 'pick', ch.pick,
                'courses', (select jsonb_agg(jsonb_build_object('code', o.course_code, 'title', o.title) order by o.position)
                            from public.programme_choice_options o where o.choice_id = ch.id)
              ) order by ch.position) from public.programme_choices ch where ch.programme_id = p.id), '[]'),
            'pathway', coalesce((
              select jsonb_agg(jsonb_build_object('year', pw.year, 'trim', pw.trimester, 'code', pw.course_code) order by pw.position)
              from public.programme_pathway pw where pw.programme_id = p.id), '[]')
          ) order by p.position), '[]') from public.programmes p where p.set_id = rs.id)
      ) order by rs.position), '[]') from public.requirement_sets rs),
    'batchRules', (
      select coalesce(jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
        'batch', br.batch, 'subject', br.subject_id, 'variant', br.variant,
        'courses', coalesce((select jsonb_object_agg(bc.course_code, bc.verdict) from public.batch_rule_courses bc
                             where (bc.batch, bc.subject_id, bc.variant) = (br.batch, br.subject_id, br.variant)), '{}'),
        'requiredCredits', br.required_credits
      )) order by br.batch, br.subject_id collate "C", br.variant collate "C"), '[]') from public.batch_rules br)
  )
$$;

-- Assemble the tables into a release and make it current. Returns its id.
create function public.publish_curriculum() returns text
language plpgsql set search_path = '' as $$
declare
  snapshot jsonb := public.assemble_curriculum();
  release text := left(md5(snapshot::text), 12);
begin
  -- API callers must be admins; trusted roles (service key, SQL editor) may
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'Only admins can publish the curriculum' using errcode = '42501';
  end if;
  insert into public.curriculum_releases (id, snapshot, published_by)
  values (release, snapshot || jsonb_build_object('release', release), auth.uid())
  on conflict (id) do nothing;
  update public.curriculum_releases set is_current = false where is_current and id <> release;
  update public.curriculum_releases set is_current = true where id = release and not is_current;
  return release;
end;
$$;

-- Replace the whole curriculum with a compiled snapshot (npm run
-- curriculum:push) and publish it, in one transaction.
create function public.import_curriculum(snapshot jsonb, descriptions jsonb default '{}') returns text
language plpgsql set search_path = '' as $$
begin
  -- API callers must be admins; trusted roles (service key, SQL editor) may
  if current_user in ('anon', 'authenticated') and not public.is_admin() then
    raise exception 'Only admins can import the curriculum' using errcode = '42501';
  end if;
  if snapshot ->> 'format' is distinct from '1' then
    raise exception 'Unsupported curriculum format: %', snapshot ->> 'format';
  end if;

  delete from public.batch_rules where true;
  delete from public.requirement_sets where true;
  delete from public.course_lecturers where true;
  delete from public.lecturers where true;
  delete from public.course_covers where true;
  delete from public.course_substitutes where true;
  delete from public.course_prerequisites where true;
  delete from public.course_subjects where true;
  delete from public.course_codes where true;
  delete from public.courses where true;
  delete from public.subjects where true;

  insert into public.curriculum_settings (singleton, updated_on, rules)
  values (true, (snapshot ->> 'updatedOn')::date, snapshot -> 'rules')
  on conflict (singleton) do update set updated_on = excluded.updated_on, rules = excluded.rules;

  insert into public.subjects (id, label, short, majorable, hue, position)
  select s ->> 'id', s ->> 'label', s ->> 'short', (s ->> 'majorable')::boolean, (s ->> 'hue')::smallint, i
  from jsonb_array_elements(snapshot -> 'subjects') with ordinality t (s, i);

  insert into public.courses (code, position, title, subject_id, credits, credits_pending, flagged_required,
    offered, eligible_years, terms, taught_as, credit_share, transcript_only, retired, description)
  select c ->> 'code', i, c ->> 'title', c ->> 'subject', (c ->> 'credits')::numeric,
    coalesce((c ->> 'pendingCredits')::boolean, false), (c ->> 'required')::boolean,
    array(select jsonb_array_elements_text(c -> 'offered')::smallint),
    array(select jsonb_array_elements_text(c -> 'eligibleYears')::smallint),
    array(select jsonb_array_elements_text(c -> 'terms')),
    coalesce(c ->> 'faculty', ''), c ->> 'share',
    (snapshot -> 'equivalences' -> 'transcriptOnly') ? (c ->> 'code'),
    coalesce((c ->> 'retired')::boolean, false), descriptions ->> (c ->> 'code')
  from jsonb_array_elements(snapshot -> 'courses') with ordinality t (c, i);

  insert into public.course_codes (code, course_code, position)
  select code, c ->> 'code', j
  from jsonb_array_elements(snapshot -> 'courses') c, jsonb_array_elements_text(c -> 'codes') with ordinality u (code, j);

  insert into public.course_subjects (course_code, subject_id, code, position)
  select c ->> 'code', subject, c -> 'codesBySubject' ->> subject, j
  from jsonb_array_elements(snapshot -> 'courses') c, jsonb_array_elements_text(c -> 'subjects') with ordinality u (subject, j);

  insert into public.course_prerequisites (course_code, prerequisite_code, position)
  select c ->> 'code', pre, j
  from jsonb_array_elements(snapshot -> 'courses') c, jsonb_array_elements_text(c -> 'prereqs') with ordinality u (pre, j);

  insert into public.course_substitutes (group_id, course_code, position)
  select g, code, j
  from jsonb_array_elements(snapshot -> 'equivalences' -> 'substitutes') with ordinality t (codes, g),
    jsonb_array_elements_text(codes) with ordinality u (code, j);

  insert into public.course_covers (maths_code, applied_code, position)
  select e ->> 'maths', e ->> 'applied', i
  from jsonb_array_elements(snapshot -> 'equivalences' -> 'covers') with ordinality t (e, i);

  insert into public.lecturers (id, position, name, email, title, office_hours, image_url, profile_url, joined)
  select l ->> 'id', i, l ->> 'name', coalesce(l ->> 'email', ''), coalesce(l ->> 'position', ''),
    coalesce(l ->> 'office_hours', ''), coalesce(l ->> 'image_url', ''), coalesce(l ->> 'url', ''), l ->> 'date_of_joining'
  from jsonb_array_elements(snapshot -> 'lecturers') with ordinality t (l, i);

  insert into public.course_lecturers (course_code, lecturer_id, position)
  select c ->> 'code', id, j
  from jsonb_array_elements(snapshot -> 'courses') c, jsonb_array_elements_text(c -> 'lecturers') with ordinality u (id, j);

  insert into public.requirement_sets (id, position, name, batches)
  select rs ->> 'id', i, rs ->> 'name',
    case when jsonb_typeof(rs -> 'batches') = 'array' then array(select jsonb_array_elements_text(rs -> 'batches')::smallint) end
  from jsonb_array_elements(snapshot -> 'requirementSets') with ordinality t (rs, i);

  insert into public.programmes (set_id, subject_id, variant, position, total_credits, required_credits, elective_credits)
  select rs ->> 'id', p ->> 'subject', p ->> 'variant', j,
    (p -> 'credits' ->> 'total')::numeric, (p -> 'credits' ->> 'required')::numeric, (p -> 'credits' ->> 'elective')::numeric
  from jsonb_array_elements(snapshot -> 'requirementSets') rs
    cross join lateral jsonb_array_elements(rs -> 'programmes') with ordinality u (p, j);

  insert into public.programme_courses (programme_id, role, course_code, position)
  select pr.id, list.role, code, k
  from jsonb_array_elements(snapshot -> 'requirementSets') rs
    cross join lateral jsonb_array_elements(rs -> 'programmes') p
    join public.programmes pr on (pr.set_id, pr.subject_id, pr.variant) = (rs ->> 'id', p ->> 'subject', p ->> 'variant')
    cross join (values ('required', 'required'), ('pick', 'picks'), ('elective', 'electives')) list (role, field)
    cross join lateral jsonb_array_elements_text(p -> list.field) with ordinality v (code, k);

  insert into public.programme_choices (programme_id, position, rule, pick)
  select pr.id, k, ch ->> 'rule', (ch ->> 'pick')::smallint
  from jsonb_array_elements(snapshot -> 'requirementSets') rs
    cross join lateral jsonb_array_elements(rs -> 'programmes') p
    join public.programmes pr on (pr.set_id, pr.subject_id, pr.variant) = (rs ->> 'id', p ->> 'subject', p ->> 'variant')
    cross join lateral jsonb_array_elements(p -> 'choices') with ordinality v (ch, k);

  insert into public.programme_choice_options (choice_id, position, course_code, title)
  select pc.id, m, o ->> 'code', o ->> 'title'
  from jsonb_array_elements(snapshot -> 'requirementSets') rs
    cross join lateral jsonb_array_elements(rs -> 'programmes') p
    join public.programmes pr on (pr.set_id, pr.subject_id, pr.variant) = (rs ->> 'id', p ->> 'subject', p ->> 'variant')
    cross join lateral jsonb_array_elements(p -> 'choices') with ordinality v (ch, k)
    join public.programme_choices pc on (pc.programme_id, pc.position) = (pr.id, k)
    cross join lateral jsonb_array_elements(ch -> 'courses') with ordinality w (o, m);

  insert into public.programme_pathway (programme_id, position, year, trimester, course_code)
  select pr.id, k, (s ->> 'year')::smallint, (s ->> 'trim')::smallint, s ->> 'code'
  from jsonb_array_elements(snapshot -> 'requirementSets') rs
    cross join lateral jsonb_array_elements(rs -> 'programmes') p
    join public.programmes pr on (pr.set_id, pr.subject_id, pr.variant) = (rs ->> 'id', p ->> 'subject', p ->> 'variant')
    cross join lateral jsonb_array_elements(p -> 'pathway') with ordinality v (s, k);

  insert into public.batch_rules (batch, subject_id, variant, required_credits)
  select (b ->> 'batch')::smallint, b ->> 'subject', b ->> 'variant', (b ->> 'requiredCredits')::numeric
  from jsonb_array_elements(snapshot -> 'batchRules') b;

  insert into public.batch_rule_courses (batch, subject_id, variant, course_code, verdict, position)
  select (b ->> 'batch')::smallint, b ->> 'subject', b ->> 'variant', e.key, e.value, row_number() over ()
  from jsonb_array_elements(snapshot -> 'batchRules') b, jsonb_each_text(b -> 'courses') e;

  return public.publish_curriculum();
end;
$$;

revoke all on function public.assemble_curriculum(), public.publish_curriculum(), public.import_curriculum(jsonb, jsonb) from public, anon;
grant execute on function public.is_admin() to anon, authenticated;
grant execute on function public.assemble_curriculum(), public.publish_curriculum(), public.import_curriculum(jsonb, jsonb) to authenticated;

commit;
