-- Keep owner privileges tied to the workspace owner_id, never to a member role alone.
create or replace function app_private.is_workspace_owner(workspace_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces
    where id = workspace_uuid and owner_id = (select auth.uid())
  );
$$;

grant execute on function app_private.is_workspace_owner(uuid) to authenticated;

create or replace function app_private.is_canonical_owner(workspace_uuid uuid, member_uuid uuid)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from public.workspaces
    where id = workspace_uuid and owner_id = member_uuid
  );
$$;

grant execute on function app_private.is_canonical_owner(uuid, uuid) to authenticated;

drop policy "workspaces_delete_owners" on public.workspaces;
create policy "workspaces_delete_owners"
on public.workspaces for delete to authenticated
using (app_private.is_workspace_owner(id));

create or replace function app_private.protect_workspace_owner()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Workspace ownership cannot be changed through a direct update';
  end if;
  return new;
end;
$$;

create trigger protect_workspace_owner_before_update
before update on public.workspaces
for each row execute function app_private.protect_workspace_owner();

create or replace function app_private.protect_membership_identity()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.workspace_id is distinct from old.workspace_id
     or new.user_id is distinct from old.user_id then
    raise exception 'Membership identity cannot be changed';
  end if;
  if app_private.is_canonical_owner(new.workspace_id, new.user_id)
     and new.role <> 'owner' then
    raise exception 'The workspace owner must retain the owner membership';
  end if;
  return new;
end;
$$;

create trigger protect_membership_identity_before_update
before update on public.workspace_members
for each row execute function app_private.protect_membership_identity();

drop policy "workspace_members_insert_admins" on public.workspace_members;
create policy "workspace_members_insert_admins"
on public.workspace_members for insert to authenticated
with check (
  app_private.is_workspace_member(workspace_id, array['owner', 'admin'])
  and (role <> 'owner' or app_private.is_canonical_owner(workspace_id, user_id))
);

drop policy "workspace_members_update_admins" on public.workspace_members;
create policy "workspace_members_update_admins"
on public.workspace_members for update to authenticated
using (
  app_private.is_workspace_member(workspace_id, array['owner', 'admin'])
  and (role <> 'owner' or app_private.is_canonical_owner(workspace_id, user_id))
)
with check (
  app_private.is_workspace_member(workspace_id, array['owner', 'admin'])
  and (role <> 'owner' or app_private.is_canonical_owner(workspace_id, user_id))
);

drop policy "workspace_members_delete_admins" on public.workspace_members;
create policy "workspace_members_delete_admins"
on public.workspace_members for delete to authenticated
using (
  app_private.is_workspace_member(workspace_id, array['owner', 'admin'])
  and not app_private.is_canonical_owner(workspace_id, user_id)
);
