create extension if not exists "pgcrypto";

create schema if not exists app_private;

create type public.workspace_role as enum ('owner', 'admin', 'member', 'viewer');
create type public.project_type as enum ('general', 'study_plan');
create type public.task_priority as enum ('Low', 'Medium', 'High', 'Critical');

create table public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  avatar_url text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspaces (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  icon text not null default 'N',
  color text not null default '#4cc9f0',
  owner_id uuid not null references public.profiles(id) on delete cascade default auth.uid(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.workspace_members (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  role public.workspace_role not null default 'member',
  created_at timestamptz not null default now(),
  unique (workspace_id, user_id)
);

create table public.workspace_role_categories (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#4cc9f0',
  created_at timestamptz not null default now()
);

create table public.projects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  type public.project_type not null default 'general',
  color text not null default '#4cc9f0',
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.board_columns (
  id uuid primary key default gen_random_uuid(),
  project_id uuid not null references public.projects(id) on delete cascade,
  name text not null,
  position integer not null default 0,
  is_completed boolean not null default false,
  archived_at timestamptz,
  created_at timestamptz not null default now()
);

create table public.tasks (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  column_id uuid not null references public.board_columns(id) on delete restrict,
  title text not null,
  description text,
  priority public.task_priority not null default 'Medium',
  due_date date,
  start_date date,
  assignee_id uuid references public.profiles(id) on delete set null,
  assignee_role_id uuid references public.workspace_role_categories(id) on delete set null,
  position integer not null default 0,
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tasks_project_workspace_consistency check (workspace_id is not null)
);

create table public.tags (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#7dd3fc',
  created_at timestamptz not null default now()
);

create table public.task_tags (
  task_id uuid not null references public.tasks(id) on delete cascade,
  tag_id uuid not null references public.tags(id) on delete cascade,
  primary key (task_id, tag_id)
);

create table public.checklist_items (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.tasks(id) on delete cascade,
  title text not null,
  completed boolean not null default false,
  position integer not null default 0,
  created_at timestamptz not null default now()
);

create table public.learners (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  guardian_name text,
  grade text,
  created_at timestamptz not null default now()
);

create table public.subjects (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  color text not null default '#27c98b',
  created_at timestamptz not null default now()
);

create table public.study_task_details (
  task_id uuid primary key references public.tasks(id) on delete cascade,
  learner_id uuid not null references public.learners(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic text not null,
  exercise_type text not null default 'Practice',
  estimated_minutes integer not null default 30 check (estimated_minutes > 0),
  result_mark numeric(5, 2),
  correction_required boolean not null default false,
  guardian_notes text
);

create table public.study_templates (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  name text not null,
  cadence text not null check (cadence in ('daily', 'weekly')),
  learner_id uuid not null references public.learners(id) on delete cascade,
  subject_id uuid not null references public.subjects(id) on delete cascade,
  topic text not null,
  exercise_type text not null default 'Practice',
  estimated_minutes integer not null default 30 check (estimated_minutes > 0),
  created_by uuid references public.profiles(id) on delete set null default auth.uid(),
  created_at timestamptz not null default now()
);

create index workspace_members_workspace_user_idx on public.workspace_members (workspace_id, user_id);
create index workspace_role_categories_workspace_idx on public.workspace_role_categories (workspace_id);
create index projects_workspace_idx on public.projects (workspace_id);
create index board_columns_project_position_idx on public.board_columns (project_id, position);
create index tasks_workspace_due_idx on public.tasks (workspace_id, due_date);
create index tasks_project_column_position_idx on public.tasks (project_id, column_id, position);
create index tasks_assignee_idx on public.tasks (assignee_id);
create index tasks_assignee_role_idx on public.tasks (assignee_role_id);
create index task_tags_tag_idx on public.task_tags (tag_id);
create index learners_workspace_idx on public.learners (workspace_id);
create index subjects_workspace_idx on public.subjects (workspace_id);
create unique index tags_workspace_lower_name_idx on public.tags (workspace_id, lower(name));
create unique index subjects_workspace_lower_name_idx on public.subjects (workspace_id, lower(name));
create unique index workspace_role_categories_workspace_lower_name_idx on public.workspace_role_categories (workspace_id, lower(name));

create or replace function app_private.set_updated_at()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create or replace function app_private.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, display_name, avatar_url)
  values (
    new.id,
    coalesce(new.raw_user_meta_data ->> 'display_name', split_part(new.email, '@', 1)),
    new.raw_user_meta_data ->> 'avatar_url'
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

create or replace function app_private.handle_new_workspace()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.workspace_members (workspace_id, user_id, role)
  values (new.id, new.owner_id, 'owner')
  on conflict (workspace_id, user_id) do update set role = 'owner';

  return new;
end;
$$;

create or replace function app_private.is_workspace_member(workspace_uuid uuid, allowed_roles text[] default null)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.workspace_members wm
    where wm.workspace_id = workspace_uuid
      and wm.user_id = auth.uid()
      and (allowed_roles is null or wm.role::text = any(allowed_roles))
  )
  or exists (
    select 1
    from public.workspaces w
    where w.id = workspace_uuid
      and w.owner_id = auth.uid()
      and (allowed_roles is null or 'owner' = any(allowed_roles))
  );
$$;

create or replace function app_private.project_workspace(project_uuid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.projects where id = project_uuid;
$$;

create or replace function app_private.task_workspace(task_uuid uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select workspace_id from public.tasks where id = task_uuid;
$$;

create or replace function app_private.shares_workspace(profile_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select profile_uuid = auth.uid()
  or exists (
    select 1
    from public.workspace_members mine
    join public.workspace_members peer on peer.workspace_id = mine.workspace_id
    where mine.user_id = auth.uid()
      and peer.user_id = profile_uuid
  );
$$;

create or replace function app_private.ensure_task_links()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  project_workspace uuid;
  column_project uuid;
  role_workspace uuid;
begin
  select workspace_id into project_workspace from public.projects where id = new.project_id;
  select project_id into column_project from public.board_columns where id = new.column_id;

  if project_workspace is null or column_project is null then
    raise exception 'Invalid project or column';
  end if;

  if project_workspace <> new.workspace_id or column_project <> new.project_id then
    raise exception 'Task workspace, project, and column must match';
  end if;

  if new.assignee_role_id is not null then
    select workspace_id into role_workspace from public.workspace_role_categories where id = new.assignee_role_id;

    if role_workspace is null or role_workspace <> new.workspace_id then
      raise exception 'Task assignee role must belong to the task workspace';
    end if;
  end if;

  return new;
end;
$$;

create trigger profiles_set_updated_at
before update on public.profiles
for each row execute function app_private.set_updated_at();

create trigger workspaces_set_updated_at
before update on public.workspaces
for each row execute function app_private.set_updated_at();

create trigger projects_set_updated_at
before update on public.projects
for each row execute function app_private.set_updated_at();

create trigger tasks_set_updated_at
before update on public.tasks
for each row execute function app_private.set_updated_at();

create trigger on_auth_user_created
after insert on auth.users
for each row execute function app_private.handle_new_user();

create trigger on_workspace_created
after insert on public.workspaces
for each row execute function app_private.handle_new_workspace();

create trigger tasks_ensure_links
before insert or update on public.tasks
for each row execute function app_private.ensure_task_links();

alter table public.profiles enable row level security;
alter table public.workspaces enable row level security;
alter table public.workspace_members enable row level security;
alter table public.workspace_role_categories enable row level security;
alter table public.projects enable row level security;
alter table public.board_columns enable row level security;
alter table public.tasks enable row level security;
alter table public.tags enable row level security;
alter table public.task_tags enable row level security;
alter table public.checklist_items enable row level security;
alter table public.learners enable row level security;
alter table public.subjects enable row level security;
alter table public.study_task_details enable row level security;
alter table public.study_templates enable row level security;

grant usage on schema public to anon, authenticated;
grant usage on schema app_private to authenticated;
grant usage on type public.workspace_role to authenticated;
grant usage on type public.project_type to authenticated;
grant usage on type public.task_priority to authenticated;
grant select, insert, update, delete on all tables in schema public to authenticated;
grant execute on function app_private.is_workspace_member(uuid, text[]) to authenticated;
grant execute on function app_private.project_workspace(uuid) to authenticated;
grant execute on function app_private.task_workspace(uuid) to authenticated;
grant execute on function app_private.shares_workspace(uuid) to authenticated;

create policy "profiles_select_workspace_peers"
on public.profiles for select to authenticated
using (app_private.shares_workspace(id));

create policy "profiles_insert_self"
on public.profiles for insert to authenticated
with check (id = auth.uid());

create policy "profiles_update_self"
on public.profiles for update to authenticated
using (id = auth.uid())
with check (id = auth.uid());

create policy "workspaces_select_members"
on public.workspaces for select to authenticated
using (app_private.is_workspace_member(id));

create policy "workspaces_insert_owner"
on public.workspaces for insert to authenticated
with check (owner_id = auth.uid());

create policy "workspaces_update_admins"
on public.workspaces for update to authenticated
using (app_private.is_workspace_member(id, array['owner', 'admin']))
with check (app_private.is_workspace_member(id, array['owner', 'admin']));

create policy "workspaces_delete_owners"
on public.workspaces for delete to authenticated
using (app_private.is_workspace_member(id, array['owner']));

create policy "workspace_members_select_members"
on public.workspace_members for select to authenticated
using (app_private.is_workspace_member(workspace_id));

create policy "workspace_members_insert_admins"
on public.workspace_members for insert to authenticated
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin']));

create policy "workspace_members_update_admins"
on public.workspace_members for update to authenticated
using (app_private.is_workspace_member(workspace_id, array['owner', 'admin']))
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin']));

create policy "workspace_members_delete_admins"
on public.workspace_members for delete to authenticated
using (app_private.is_workspace_member(workspace_id, array['owner', 'admin']));

create policy "workspace_role_categories_select_members"
on public.workspace_role_categories for select to authenticated
using (app_private.is_workspace_member(workspace_id));

create policy "workspace_role_categories_insert_admins"
on public.workspace_role_categories for insert to authenticated
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin']));

create policy "workspace_role_categories_update_admins"
on public.workspace_role_categories for update to authenticated
using (app_private.is_workspace_member(workspace_id, array['owner', 'admin']))
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin']));

create policy "workspace_role_categories_delete_admins"
on public.workspace_role_categories for delete to authenticated
using (app_private.is_workspace_member(workspace_id, array['owner', 'admin']));

create policy "projects_select_members"
on public.projects for select to authenticated
using (app_private.is_workspace_member(workspace_id));

create policy "projects_insert_admins"
on public.projects for insert to authenticated
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin', 'member']));

create policy "projects_update_admins"
on public.projects for update to authenticated
using (app_private.is_workspace_member(workspace_id, array['owner', 'admin']))
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin']));

create policy "projects_delete_admins"
on public.projects for delete to authenticated
using (app_private.is_workspace_member(workspace_id, array['owner', 'admin']));

create policy "board_columns_select_members"
on public.board_columns for select to authenticated
using (app_private.is_workspace_member(app_private.project_workspace(project_id)));

create policy "board_columns_insert_members"
on public.board_columns for insert to authenticated
with check (app_private.is_workspace_member(app_private.project_workspace(project_id), array['owner', 'admin', 'member']));

create policy "board_columns_update_members"
on public.board_columns for update to authenticated
using (app_private.is_workspace_member(app_private.project_workspace(project_id), array['owner', 'admin', 'member']))
with check (app_private.is_workspace_member(app_private.project_workspace(project_id), array['owner', 'admin', 'member']));

create policy "board_columns_delete_admins"
on public.board_columns for delete to authenticated
using (app_private.is_workspace_member(app_private.project_workspace(project_id), array['owner', 'admin']));

create policy "tasks_select_members"
on public.tasks for select to authenticated
using (app_private.is_workspace_member(workspace_id));

create policy "tasks_insert_members"
on public.tasks for insert to authenticated
with check (
  created_by = auth.uid()
  and app_private.is_workspace_member(workspace_id, array['owner', 'admin', 'member'])
);

create policy "tasks_update_members"
on public.tasks for update to authenticated
using (app_private.is_workspace_member(workspace_id, array['owner', 'admin', 'member']))
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin', 'member']));

create policy "tasks_delete_members"
on public.tasks for delete to authenticated
using (app_private.is_workspace_member(workspace_id, array['owner', 'admin', 'member']));

create policy "tags_member_access"
on public.tags for all to authenticated
using (app_private.is_workspace_member(workspace_id))
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin', 'member']));

create policy "task_tags_member_access"
on public.task_tags for all to authenticated
using (app_private.is_workspace_member(app_private.task_workspace(task_id)))
with check (app_private.is_workspace_member(app_private.task_workspace(task_id), array['owner', 'admin', 'member']));

create policy "checklist_items_member_access"
on public.checklist_items for all to authenticated
using (app_private.is_workspace_member(app_private.task_workspace(task_id)))
with check (app_private.is_workspace_member(app_private.task_workspace(task_id), array['owner', 'admin', 'member']));

create policy "learners_member_access"
on public.learners for all to authenticated
using (app_private.is_workspace_member(workspace_id))
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin', 'member']));

create policy "subjects_member_access"
on public.subjects for all to authenticated
using (app_private.is_workspace_member(workspace_id))
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin', 'member']));

create policy "study_task_details_member_access"
on public.study_task_details for all to authenticated
using (app_private.is_workspace_member(app_private.task_workspace(task_id)))
with check (app_private.is_workspace_member(app_private.task_workspace(task_id), array['owner', 'admin', 'member']));

create policy "study_templates_member_access"
on public.study_templates for all to authenticated
using (app_private.is_workspace_member(workspace_id))
with check (app_private.is_workspace_member(workspace_id, array['owner', 'admin', 'member']));

-- TODO(Render): add a future backend job that expands study_templates into dated tasks.
-- TODO(Render): add a future API service for reminders, digest emails, and background scoring.
