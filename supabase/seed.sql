-- Demo seed for Supabase local or hosted development.
-- Create at least one Auth user first; this script seeds demo data for the first user.

do $$
declare
  owner_uuid uuid;
begin
  select id into owner_uuid from auth.users order by created_at limit 1;

  if owner_uuid is null then
    raise notice 'No auth.users row found. Create a user first, then rerun the seed.';
    return;
  end if;

  insert into public.profiles (id, display_name, avatar_url)
  values (owner_uuid, 'Alex Mokoena', null)
  on conflict (id) do update set display_name = coalesce(public.profiles.display_name, excluded.display_name);

  insert into public.workspaces (id, name, icon, color, owner_id)
  values
    ('10000000-0000-0000-0000-000000000001', 'Personal', 'N', '#3f8cff', owner_uuid),
    ('10000000-0000-0000-0000-000000000002', 'Family', 'H', '#27c98b', owner_uuid),
    ('10000000-0000-0000-0000-000000000003', 'Devz', 'D', '#f0a53a', owner_uuid)
  on conflict (id) do nothing;

  insert into public.workspace_members (workspace_id, user_id, role)
  values
    ('10000000-0000-0000-0000-000000000001', owner_uuid, 'owner'),
    ('10000000-0000-0000-0000-000000000002', owner_uuid, 'owner'),
    ('10000000-0000-0000-0000-000000000003', owner_uuid, 'owner')
  on conflict (workspace_id, user_id) do update set role = excluded.role;

  insert into public.workspace_role_categories (id, workspace_id, name, color)
  values
    ('80000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000003', 'Developer', '#4cc9f0'),
    ('80000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', 'Tester', '#f472b6'),
    ('80000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'QA', '#f0a53a'),
    ('80000000-0000-0000-0000-000000000004', '10000000-0000-0000-0000-000000000003', 'PMO', '#a78bfa'),
    ('80000000-0000-0000-0000-000000000005', '10000000-0000-0000-0000-000000000003', 'BA', '#7dd3fc'),
    ('80000000-0000-0000-0000-000000000006', '10000000-0000-0000-0000-000000000002', 'Learner', '#27c98b'),
    ('80000000-0000-0000-0000-000000000007', '10000000-0000-0000-0000-000000000002', 'Parent/Guardian', '#4cc9f0')
  on conflict (id) do nothing;

  insert into public.projects (id, workspace_id, name, type, color)
  values
    ('20000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000001', 'My Learning', 'general', '#4cc9f0'),
    ('20000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Rethabile Study Plan', 'study_plan', '#27c98b'),
    ('20000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'Devz Sprint', 'general', '#f0a53a')
  on conflict (id) do nothing;

  insert into public.board_columns (id, project_id, name, position, is_completed)
  values
    ('30000000-0000-0000-0000-000000000001', '20000000-0000-0000-0000-000000000001', 'To Do', 0, false),
    ('30000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000001', 'In Progress', 1, false),
    ('30000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000001', 'Done', 2, true),
    ('30000000-0000-0000-0000-000000000004', '20000000-0000-0000-0000-000000000002', 'To Do', 0, false),
    ('30000000-0000-0000-0000-000000000005', '20000000-0000-0000-0000-000000000002', 'Practice', 1, false),
    ('30000000-0000-0000-0000-000000000006', '20000000-0000-0000-0000-000000000002', 'Checked', 2, true),
    ('30000000-0000-0000-0000-000000000007', '20000000-0000-0000-0000-000000000003', 'To Do', 0, false),
    ('30000000-0000-0000-0000-000000000008', '20000000-0000-0000-0000-000000000003', 'In Progress', 1, false),
    ('30000000-0000-0000-0000-000000000009', '20000000-0000-0000-0000-000000000003', 'Done', 2, true)
  on conflict (id) do nothing;

  insert into public.learners (id, workspace_id, name, guardian_name, grade)
  values
    ('40000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Rethabile', 'Alex', 'Grade 6'),
    ('40000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'Kamo', 'Thato', 'Grade 4')
  on conflict (id) do nothing;

  insert into public.subjects (id, workspace_id, name, color)
  values
    ('50000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'Mathematics', '#27c98b'),
    ('50000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000002', 'English', '#4cc9f0')
  on conflict (id) do nothing;

  insert into public.tags (id, workspace_id, name, color)
  values
    ('60000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', 'maths', '#27c98b'),
    ('60000000-0000-0000-0000-000000000003', '10000000-0000-0000-0000-000000000003', 'release', '#f0a53a')
  on conflict (id) do nothing;

  insert into public.tasks (id, workspace_id, project_id, column_id, title, description, priority, due_date, assignee_role_id, position, created_by)
  values
    ('70000000-0000-0000-0000-000000000001', '10000000-0000-0000-0000-000000000002', '20000000-0000-0000-0000-000000000002', '30000000-0000-0000-0000-000000000005', 'Fractions worksheet', 'Equivalent fractions and word problems.', 'Critical', current_date, '80000000-0000-0000-0000-000000000006', 0, owner_uuid),
    ('70000000-0000-0000-0000-000000000002', '10000000-0000-0000-0000-000000000003', '20000000-0000-0000-0000-000000000003', '30000000-0000-0000-0000-000000000007', 'QA regression checklist', null, 'High', current_date + 1, '80000000-0000-0000-0000-000000000003', 0, owner_uuid)
  on conflict (id) do nothing;

  insert into public.task_tags (task_id, tag_id)
  values
    ('70000000-0000-0000-0000-000000000001', '60000000-0000-0000-0000-000000000001'),
    ('70000000-0000-0000-0000-000000000002', '60000000-0000-0000-0000-000000000003')
  on conflict do nothing;

  insert into public.study_task_details (task_id, learner_id, subject_id, topic, exercise_type, estimated_minutes, correction_required, guardian_notes)
  values
    ('70000000-0000-0000-0000-000000000001', '40000000-0000-0000-0000-000000000001', '50000000-0000-0000-0000-000000000001', 'Equivalent fractions', 'Worksheet', 35, true, 'Check final word problems together.')
  on conflict (task_id) do nothing;
end $$;
