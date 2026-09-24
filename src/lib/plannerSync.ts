import { supabase } from './supabase'
import { queueWrite } from './plannerOutbox'
import type {
  BoardColumn,
  Learner,
  PlannerData,
  Profile,
  Project,
  Subject,
  Task,
  Workspace,
  WorkspaceRoleCategory,
} from '../types/domain'

// ─────────────────────────────────────────────────────────────────────────────
// Supabase persistence layer for the planner.
//
// The Zustand store stays the synchronous source of truth for the UI; these
// helpers (a) hydrate it from Supabase on login and (b) write changes back.
// Writes are optimistic, recorded in a per-user outbox, and replayed in order.
// A failed write remains pending and is surfaced by the planner shell.
//
// Known limitations (schema models members/assignees as REAL auth users):
//  - Workspace members beyond the owner are not persisted (no invite flow yet).
//  - A task's person-assignee only persists when it is the current user;
//    role-assignment (assignee_role_id) persists fully.
//  - Workspace archiving is local-only (workspaces has no archived_at column);
//    project archiving persists.
//  - Tags and study templates are not seeded/created from the UI, so they start
//    empty for a new account.
// ─────────────────────────────────────────────────────────────────────────────

async function run(label: string, fn: () => PromiseLike<{ error: unknown }>): Promise<void> {
  try {
    const { error } = await fn()
    if (error) throw error
  } catch (error) {
    console.error(`[plannerSync] ${label} threw:`, error)
    throw error
  }
}

/** Ensure the signed-in user has a profile row and at least one workspace. */
export async function ensureBootstrap(userId: string, displayName: string): Promise<void> {
  const db = supabase
  if (!db) return

  await run('profile upsert', () =>
    db.from('profiles').upsert({ id: userId, display_name: displayName }, { onConflict: 'id' }),
  )

  const { data: existing, error } = await db.from('workspaces').select('id').limit(1)
  if (error) {
    console.error('[plannerSync] workspace check failed:', error)
    return
  }
  if (existing && existing.length > 0) return

  // First login: create a starter workspace + a default project with columns.
  const workspaceId = crypto.randomUUID()
  const { error: wsError } = await db
    .from('workspaces')
    .insert({ id: workspaceId, name: 'Personal', icon: 'P', color: '#4cc9f0', owner_id: userId })
  if (wsError) {
    console.error('[plannerSync] starter workspace insert failed:', wsError)
    return
  }

  const projectId = crypto.randomUUID()
  await run('starter project insert', () =>
    db.from('projects').insert({ id: projectId, workspace_id: workspaceId, name: 'My Tasks', type: 'general', color: '#4cc9f0' }),
  )
  await run('starter columns insert', () =>
    db.from('board_columns').insert(
      ['To Do', 'In Progress', 'Done'].map((name, position) => ({
        id: crypto.randomUUID(),
        project_id: projectId,
        name,
        position,
        is_completed: position === 2,
      })),
    ),
  )
}

/** Load every entity the current user can see and shape it into PlannerData. */
export async function loadPlannerData(userId: string, fallbackName: string, email: string): Promise<PlannerData> {
  const db = supabase
  if (!db) throw new Error('Supabase is not configured')

  const [
    profiles,
    workspaces,
    members,
    roleCategories,
    projects,
    columns,
    tasks,
    tags,
    taskTags,
    checklist,
    learners,
    subjects,
    studyDetails,
  ] = await Promise.all([
    db.from('profiles').select('*'),
    db.from('workspaces').select('*'),
    db.from('workspace_members').select('*'),
    db.from('workspace_role_categories').select('*'),
    db.from('projects').select('*'),
    db.from('board_columns').select('*'),
    db.from('tasks').select('*'),
    db.from('tags').select('*'),
    db.from('task_tags').select('*'),
    db.from('checklist_items').select('*'),
    db.from('learners').select('*'),
    db.from('subjects').select('*'),
    db.from('study_task_details').select('*'),
  ])

  const requiredReads = { profiles, workspaces, members, roleCategories, projects, columns, tasks, tags, taskTags, checklist, learners, subjects, studyDetails }
  const failedRead = Object.entries(requiredReads).find(([, result]) => result.error)
  if (failedRead) {
    throw new Error(`Could not load ${failedRead[0]}: ${failedRead[1].error?.message}`)
  }

  const profilesById = new Map((profiles.data ?? []).map((row) => [row.id, row]))
  const me = profilesById.get(userId)
  const profile: Profile = {
    id: userId,
    displayName: me?.display_name ?? fallbackName,
    email,
    avatarUrl: me?.avatar_url ?? null,
  }

  const mappedWorkspaces: Workspace[] = (workspaces.data ?? []).map((ws) => ({
    id: ws.id,
    name: ws.name,
    icon: ws.icon,
    color: ws.color,
    ownerId: ws.owner_id,
    archived: false,
    members: (members.data ?? [])
      .filter((m) => m.workspace_id === ws.id)
      .map((m) => ({
        userId: m.user_id,
        displayName: profilesById.get(m.user_id)?.display_name ?? 'Member',
        email: m.user_id === userId ? email : undefined,
        role: m.role,
        active: true,
        avatarUrl: profilesById.get(m.user_id)?.avatar_url ?? null,
      })),
  }))

  const mappedRoleCategories: WorkspaceRoleCategory[] = (roleCategories.data ?? []).map((r) => ({
    id: r.id,
    workspaceId: r.workspace_id,
    name: r.name,
    color: r.color,
  }))

  const mappedProjects: Project[] = (projects.data ?? []).map((p) => ({
    id: p.id,
    workspaceId: p.workspace_id,
    name: p.name,
    type: p.type,
    color: p.color,
    archived: Boolean(p.archived_at),
  }))

  const mappedColumns: BoardColumn[] = (columns.data ?? []).map((c) => ({
    id: c.id,
    projectId: c.project_id,
    name: c.name,
    position: c.position,
    isCompleted: c.is_completed,
    archived: Boolean(c.archived_at),
  }))

  const checklistByTask = new Map<string, typeof checklist.data>()
  for (const item of checklist.data ?? []) {
    const list = checklistByTask.get(item.task_id) ?? []
    list.push(item)
    checklistByTask.set(item.task_id, list)
  }
  const tagsByTask = new Map<string, string[]>()
  for (const link of taskTags.data ?? []) {
    const list = tagsByTask.get(link.task_id) ?? []
    list.push(link.tag_id)
    tagsByTask.set(link.task_id, list)
  }
  const studyByTask = new Map((studyDetails.data ?? []).map((s) => [s.task_id, s]))

  const mappedTasks: Task[] = (tasks.data ?? []).map((t) => {
    const study = studyByTask.get(t.id)
    return {
      id: t.id,
      title: t.title,
      description: t.description ?? undefined,
      workspaceId: t.workspace_id,
      projectId: t.project_id,
      columnId: t.column_id,
      priority: t.priority,
      dueDate: t.due_date,
      startDate: t.start_date,
      tags: tagsByTask.get(t.id) ?? [],
      assigneeId: t.assignee_id,
      assigneeRoleId: t.assignee_role_id,
      position: t.position,
      createdBy: t.created_by ?? userId,
      completedAt: t.completed_at,
      checklist: (checklistByTask.get(t.id) ?? [])
        .slice()
        .sort((a, b) => a.position - b.position)
        .map((c) => ({ id: c.id, taskId: c.task_id, title: c.title, completed: c.completed, position: c.position })),
      study: study
        ? {
            learnerId: study.learner_id,
            subjectId: study.subject_id,
            topic: study.topic,
            exerciseType: study.exercise_type,
            estimatedMinutes: study.estimated_minutes,
            resultMark: study.result_mark,
            correctionRequired: study.correction_required,
            guardianNotes: study.guardian_notes ?? undefined,
          }
        : null,
    }
  })

  const mappedLearners: Learner[] = (learners.data ?? []).map((l) => ({
    id: l.id,
    workspaceId: l.workspace_id,
    name: l.name,
    grade: l.grade ?? undefined,
    guardianName: l.guardian_name ?? undefined,
  }))

  const mappedSubjects: Subject[] = (subjects.data ?? []).map((s) => ({
    id: s.id,
    workspaceId: s.workspace_id,
    name: s.name,
    color: s.color,
  }))

  return {
    profile,
    workspaces: mappedWorkspaces,
    projects: mappedProjects,
    columns: mappedColumns,
    tasks: mappedTasks,
    tags: (tags.data ?? []).map((t) => ({ id: t.id, name: t.name, color: t.color })),
    roleCategories: mappedRoleCategories,
    learners: mappedLearners,
    subjects: mappedSubjects,
    templates: [],
  }
}

// ── Workspaces ───────────────────────────────────────────────────────────────
export function insertWorkspaceRemote(ws: Workspace, userId: string) {
  queueWrite({ kind: 'insert', table: 'workspaces', label: 'workspace insert', payload: {
    id: ws.id, name: ws.name, icon: ws.icon, color: ws.color, owner_id: userId,
  } })
}

export function updateWorkspaceRemote(id: string, patch: { name?: string; icon?: string; color?: string }) {
  queueWrite({ kind: 'update', table: 'workspaces', rowId: id, label: 'workspace update', payload: patch })
}

// ── Projects ─────────────────────────────────────────────────────────────────
export function insertProjectRemote(project: Project, columns: BoardColumn[]) {
  queueWrite({ kind: 'insert', table: 'projects', label: 'project insert', payload: {
    id: project.id, workspace_id: project.workspaceId, name: project.name, type: project.type, color: project.color,
  } })
  if (columns.length) queueWrite({ kind: 'insert', table: 'board_columns', label: 'project columns insert', payload:
    columns.map((c) => ({ id: c.id, project_id: c.projectId, name: c.name, position: c.position, is_completed: c.isCompleted })),
  })
}

export function updateProjectRemote(id: string, patch: { name?: string; color?: string }) {
  queueWrite({ kind: 'update', table: 'projects', rowId: id, label: 'project update', payload: patch })
}

export function archiveProjectRemote(id: string) {
  queueWrite({ kind: 'update', table: 'projects', rowId: id, label: 'project archive', payload: { archived_at: new Date().toISOString() } })
}

// ── Board columns ────────────────────────────────────────────────────────────
export function insertColumnRemote(column: BoardColumn) {
  queueWrite({ kind: 'insert', table: 'board_columns', label: 'column insert', payload: {
    id: column.id, project_id: column.projectId, name: column.name, position: column.position, is_completed: column.isCompleted,
  } })
}

export function updateColumnRemote(id: string, patch: { name?: string; position?: number; is_completed?: boolean }) {
  queueWrite({ kind: 'update', table: 'board_columns', rowId: id, label: 'column update', payload: patch })
}

export function archiveColumnRemote(id: string) {
  queueWrite({ kind: 'update', table: 'board_columns', rowId: id, label: 'column archive', payload: {
    archived_at: new Date().toISOString(), is_completed: false,
  } })
}

export function syncColumnsRemote(columns: BoardColumn[]) {
  for (const column of columns) {
    queueWrite({ kind: 'update', table: 'board_columns', rowId: column.id, label: 'column position sync', payload: {
      position: column.position, is_completed: column.isCompleted,
    } })
  }
}

// ── Tasks ────────────────────────────────────────────────────────────────────
export function upsertTaskRemote(task: Task, userId: string) {
  const assigneeId = task.assigneeId === userId ? userId : null
  queueWrite({ kind: 'task-save', label: 'task save', payload: {
    p_task: {
      id: task.id, workspace_id: task.workspaceId, project_id: task.projectId, column_id: task.columnId,
      title: task.title, description: task.description ?? null, priority: task.priority,
      due_date: task.dueDate ?? null, start_date: task.startDate ?? null,
      assignee_id: assigneeId, assignee_role_id: task.assigneeRoleId ?? null,
      position: task.position, completed_at: task.completedAt ?? null,
    },
    p_tags: task.tags,
    p_checklist: task.checklist.map((item, index) => ({
      id: item.id, title: item.title, completed: item.completed, position: item.position ?? index,
    })),
    p_study: task.study ? {
      learner_id: task.study.learnerId, subject_id: task.study.subjectId,
      topic: task.study.topic, exercise_type: task.study.exerciseType,
      estimated_minutes: task.study.estimatedMinutes, result_mark: task.study.resultMark ?? null,
      correction_required: task.study.correctionRequired, guardian_notes: task.study.guardianNotes ?? null,
    } : null,
  } })
}

export function deleteTaskRemote(id: string) {
  queueWrite({ kind: 'delete', table: 'tasks', rowId: id, label: 'task delete' })
}

export function syncTasksRemote(tasks: Task[]) {
  for (const task of tasks) {
    queueWrite({ kind: 'update', table: 'tasks', rowId: task.id, label: 'task position sync', payload: {
      column_id: task.columnId, position: task.position, completed_at: task.completedAt ?? null,
    } })
  }
}

// ── Role categories ──────────────────────────────────────────────────────────
export function insertRoleCategoryRemote(role: WorkspaceRoleCategory) {
  queueWrite({ kind: 'insert', table: 'workspace_role_categories', label: 'role category insert', payload: {
    id: role.id, workspace_id: role.workspaceId, name: role.name, color: role.color,
  } })
}

export function updateRoleCategoryRemote(id: string, patch: { name?: string; color?: string }) {
  queueWrite({ kind: 'update', table: 'workspace_role_categories', rowId: id, label: 'role category update', payload: patch })
}

export function deleteRoleCategoryRemote(id: string) {
  queueWrite({ kind: 'delete', table: 'workspace_role_categories', rowId: id, label: 'role category delete' })
}

// ── Learners & subjects ──────────────────────────────────────────────────────
export function insertLearnerRemote(learner: Learner) {
  queueWrite({ kind: 'insert', table: 'learners', label: 'learner insert', payload: {
    id: learner.id, workspace_id: learner.workspaceId, name: learner.name,
    grade: learner.grade ?? null, guardian_name: learner.guardianName ?? null,
  } })
}

export function insertSubjectRemote(subject: Subject) {
  queueWrite({ kind: 'insert', table: 'subjects', label: 'subject insert', payload: {
    id: subject.id, workspace_id: subject.workspaceId, name: subject.name, color: subject.color,
  } })
}
