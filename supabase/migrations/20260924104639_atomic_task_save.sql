-- One request and one transaction for the task, tags, checklist, and study details.
-- SECURITY INVOKER keeps the existing table RLS policies in force.
create or replace function public.save_task(
  p_task jsonb,
  p_tags jsonb,
  p_checklist jsonb,
  p_study jsonb
)
returns void
language plpgsql
security invoker
set search_path = ''
as $$
declare
  task_uuid uuid := (p_task->>'id')::uuid;
begin
  insert into public.tasks (
    id, workspace_id, project_id, column_id, title, description, priority,
    due_date, start_date, assignee_id, assignee_role_id, position,
    created_by, completed_at
  ) values (
    task_uuid,
    (p_task->>'workspace_id')::uuid,
    (p_task->>'project_id')::uuid,
    (p_task->>'column_id')::uuid,
    p_task->>'title',
    p_task->>'description',
    (p_task->>'priority')::public.task_priority,
    (p_task->>'due_date')::date,
    (p_task->>'start_date')::date,
    (p_task->>'assignee_id')::uuid,
    (p_task->>'assignee_role_id')::uuid,
    (p_task->>'position')::integer,
    (select auth.uid()),
    (p_task->>'completed_at')::timestamptz
  )
  on conflict (id) do update set
    workspace_id = excluded.workspace_id,
    project_id = excluded.project_id,
    column_id = excluded.column_id,
    title = excluded.title,
    description = excluded.description,
    priority = excluded.priority,
    due_date = excluded.due_date,
    start_date = excluded.start_date,
    assignee_id = excluded.assignee_id,
    assignee_role_id = excluded.assignee_role_id,
    position = excluded.position,
    completed_at = excluded.completed_at;

  delete from public.task_tags where task_id = task_uuid;
  insert into public.task_tags (task_id, tag_id)
  select task_uuid, value::uuid
  from jsonb_array_elements_text(coalesce(p_tags, '[]'::jsonb)) as tag(value);

  delete from public.checklist_items where task_id = task_uuid;
  insert into public.checklist_items (id, task_id, title, completed, position)
  select (item->>'id')::uuid, task_uuid, item->>'title',
         coalesce((item->>'completed')::boolean, false),
         coalesce((item->>'position')::integer, 0)
  from jsonb_array_elements(coalesce(p_checklist, '[]'::jsonb)) as entries(item);

  if p_study is null or p_study = 'null'::jsonb then
    delete from public.study_task_details where task_id = task_uuid;
  else
    insert into public.study_task_details (
      task_id, learner_id, subject_id, topic, exercise_type,
      estimated_minutes, result_mark, correction_required, guardian_notes
    ) values (
      task_uuid,
      (p_study->>'learner_id')::uuid,
      (p_study->>'subject_id')::uuid,
      p_study->>'topic',
      p_study->>'exercise_type',
      (p_study->>'estimated_minutes')::integer,
      (p_study->>'result_mark')::numeric,
      coalesce((p_study->>'correction_required')::boolean, false),
      p_study->>'guardian_notes'
    )
    on conflict (task_id) do update set
      learner_id = excluded.learner_id,
      subject_id = excluded.subject_id,
      topic = excluded.topic,
      exercise_type = excluded.exercise_type,
      estimated_minutes = excluded.estimated_minutes,
      result_mark = excluded.result_mark,
      correction_required = excluded.correction_required,
      guardian_notes = excluded.guardian_notes;
  end if;
end;
$$;

revoke all on function public.save_task(jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.save_task(jsonb, jsonb, jsonb, jsonb) to authenticated;
