import { create } from 'zustand'
import { persist } from 'zustand/middleware'
import { appConfig } from '../config/app'
import { demoData } from '../data/demo'
import type {
  BoardColumn,
  Filters,
  Learner,
  PlannerData,
  Priority,
  Project,
  ProjectType,
  Subject,
  Task,
  WorkspaceMember,
  WorkspaceRole,
  WorkspaceRoleCategory,
} from '../types/domain'

type NewTaskInput = {
  title: string
  description?: string
  workspaceId: string
  projectId: string
  priority: Priority
  dueDate?: string
  tags?: string[]
  columnId?: string
  assigneeId?: string | null
  assigneeRoleId?: string | null
  learnerId?: string
  subjectId?: string
  topic?: string
  exerciseType?: string
  estimatedMinutes?: number
  correctionRequired?: boolean
  guardianNotes?: string
  checklistTitles?: string[]
}

type PlannerState = PlannerData & {
  filters: Filters
  navOpen: boolean
  setNavOpen: (open: boolean) => void
  setFilter: <K extends keyof Filters>(key: K, value: Filters[K]) => void
  addTask: (input: NewTaskInput) => void
  updateTask: (id: string, patch: Partial<Task>) => void
  deleteTask: (id: string) => void
  completeTask: (id: string) => void
  moveTask: (taskId: string, targetColumnId: string, overTaskId?: string) => void
  addColumn: (projectId: string, name: string, isCompleted?: boolean) => void
  renameColumn: (columnId: string, name: string) => void
  archiveColumn: (columnId: string, moveTaskColumnId?: string) => void
  setCompletedColumn: (projectId: string, columnId: string) => void
  reorderColumn: (columnId: string, direction: -1 | 1) => void
  addWorkspace: (input: { name: string; icon: string; color: string }) => void
  updateWorkspace: (id: string, patch: { name?: string; icon?: string; color?: string }) => void
  archiveWorkspace: (id: string) => void
  addProject: (input: { workspaceId: string; name: string; type: ProjectType; color: string }) => void
  updateProject: (id: string, patch: { name?: string; color?: string }) => void
  archiveProject: (id: string) => void
  addWorkspaceMember: (workspaceId: string, input: { displayName: string; email?: string; role: WorkspaceRole }) => void
  updateWorkspaceMember: (workspaceId: string, userId: string, patch: Partial<WorkspaceMember>) => void
  archiveWorkspaceMember: (workspaceId: string, userId: string) => void
  addRoleCategory: (workspaceId: string, input: { name: string; color: string }) => void
  updateRoleCategory: (id: string, patch: Partial<Pick<WorkspaceRoleCategory, 'name' | 'color'>>) => void
  deleteRoleCategory: (id: string) => void
  addLearner: (workspaceId: string, name: string, grade?: string, guardianName?: string) => void
  addSubject: (workspaceId: string, name: string, color?: string) => void
  resetDemo: () => void
}

const defaultFilters: Filters = {
  workspaceId: 'all',
  projectId: demoData.projects[1]?.id ?? 'all',
  status: 'all',
  priority: 'All',
  tag: 'all',
  assigneeId: 'all',
  boardView: 'all',
  learnerId: 'all',
  subjectId: 'all',
  due: 'all',
  query: '',
}

const uid = (prefix: string) => `${prefix}-${crypto.randomUUID()}`

const defaultColumnNames = (type: ProjectType) =>
  type === 'study_plan' ? ['To Do', 'Practice', 'Checked'] : ['To Do', 'In Progress', 'Done']

const normalizePositions = (tasks: Task[]) => {
  const byColumn = new Map<string, Task[]>()
  tasks.forEach((task) => {
    byColumn.set(task.columnId, [...(byColumn.get(task.columnId) ?? []), task])
  })
  byColumn.forEach((items) => {
    items
      .sort((a, b) => a.position - b.position)
      .forEach((task, index) => {
        task.position = index
      })
  })
  return tasks
}

export const usePlannerStore = create<PlannerState>()(
  persist(
    (set) => ({
      ...demoData,
      filters: defaultFilters,
      navOpen: false,
      setNavOpen: (open) => set({ navOpen: open }),
      setFilter: (key, value) =>
        set((state) => ({
          filters: {
            ...state.filters,
            [key]: value,
            ...(key === 'workspaceId' ? { projectId: 'all', boardView: 'all' } : {}),
            ...(key === 'projectId' ? { boardView: 'all' } : {}),
          },
        })),
      addTask: (input) =>
        set((state) => {
          const project = state.projects.find((item) => item.id === input.projectId)
          const targetColumn = input.columnId
            ? state.columns.find((column) => column.id === input.columnId && column.projectId === input.projectId && !column.archived)
            : undefined
          const firstColumn = targetColumn ?? state.columns
            .filter((column) => column.projectId === input.projectId && !column.archived)
            .sort((a, b) => a.position - b.position)[0]
          if (!project || !firstColumn) return state

          const isStudy = project.type === 'study_plan' && input.learnerId && input.subjectId
          const task: Task = {
            id: uid('task'),
            title: input.title,
            description: input.description,
            workspaceId: input.workspaceId,
            projectId: input.projectId,
            columnId: firstColumn.id,
            priority: input.priority,
            dueDate: input.dueDate || null,
            tags: input.tags ?? [],
            assigneeId: input.assigneeId ?? null,
            assigneeRoleId: input.assigneeRoleId ?? null,
            checklist: (input.checklistTitles ?? []).map((title, position) => ({
              id: uid('check'),
              taskId: 'pending',
              title,
              completed: false,
              position,
            })),
            position: state.tasks.filter((item) => item.columnId === firstColumn.id).length,
            createdBy: state.profile.id,
            study: isStudy
              ? {
                  learnerId: input.learnerId!,
                  subjectId: input.subjectId!,
                  topic: input.topic || 'Study session',
                  exerciseType: input.exerciseType || 'Practice',
                  estimatedMinutes: input.estimatedMinutes || 30,
                  correctionRequired: Boolean(input.correctionRequired),
                  guardianNotes: input.guardianNotes || undefined,
                }
              : null,
          }
          task.checklist = task.checklist.map((item) => ({ ...item, taskId: task.id }))
          return { tasks: [...state.tasks, task] }
        }),
      updateTask: (id, patch) =>
        set((state) => ({
          tasks: state.tasks.map((task) => (task.id === id ? { ...task, ...patch } : task)),
        })),
      deleteTask: (id) =>
        set((state) => ({
          tasks: normalizePositions(state.tasks.filter((task) => task.id !== id)),
        })),
      completeTask: (id) =>
        set((state) => {
          const task = state.tasks.find((item) => item.id === id)
          if (!task) return state
          const doneColumn = state.columns.find((column) => column.projectId === task.projectId && column.isCompleted)
          const firstOpenColumn = state.columns
            .filter((column) => column.projectId === task.projectId && !column.archived && !column.isCompleted)
            .sort((a, b) => a.position - b.position)[0]
          return {
            tasks: normalizePositions(
              state.tasks.map((item) =>
                item.id === id
                  ? {
                      ...item,
                      columnId: item.completedAt ? firstOpenColumn?.id ?? item.columnId : doneColumn?.id ?? item.columnId,
                      completedAt: item.completedAt ? null : new Date().toISOString(),
                    }
                  : item,
              ),
            ),
          }
        }),
      moveTask: (taskId, targetColumnId, overTaskId) =>
        set((state) => {
          const moving = state.tasks.find((task) => task.id === taskId)
          if (!moving) return state
          const targetColumn = state.columns.find((column) => column.id === targetColumnId)
          if (!targetColumn) return state

          const remaining = state.tasks.filter((task) => task.id !== taskId)
          const targetTasks = remaining
            .filter((task) => task.columnId === targetColumnId)
            .sort((a, b) => a.position - b.position)
          const overIndex = overTaskId ? targetTasks.findIndex((task) => task.id === overTaskId) : -1
          const insertIndex = overIndex >= 0 ? overIndex : targetTasks.length
          targetTasks.splice(insertIndex, 0, {
            ...moving,
            columnId: targetColumnId,
            completedAt: targetColumn.isCompleted ? moving.completedAt ?? new Date().toISOString() : null,
          })

          const rebuilt = [
            ...remaining.filter((task) => task.columnId !== targetColumnId),
            ...targetTasks.map((task, index) => ({ ...task, position: index })),
          ]
          return { tasks: normalizePositions(rebuilt) }
        }),
      addColumn: (projectId, name, isCompleted = false) =>
        set((state) => {
          const position = state.columns.filter((column) => column.projectId === projectId).length
          const column: BoardColumn = {
            id: uid('column'),
            projectId,
            name,
            position,
            isCompleted,
          }
          return {
            columns: [
              ...state.columns.map((item) => (isCompleted && item.projectId === projectId ? { ...item, isCompleted: false } : item)),
              column,
            ],
          }
        }),
      renameColumn: (columnId, name) =>
        set((state) => ({
          columns: state.columns.map((column) => (column.id === columnId ? { ...column, name } : column)),
        })),
      archiveColumn: (columnId, moveTaskColumnId) =>
        set((state) => {
          const column = state.columns.find((item) => item.id === columnId)
          if (!column) return state
          const fallbackColumn = moveTaskColumnId
            ? state.columns.find((item) => item.id === moveTaskColumnId && item.projectId === column.projectId && !item.archived)
            : undefined
          return {
            columns: state.columns.map((item) => (item.id === columnId ? { ...item, archived: true, isCompleted: false } : item)),
            tasks: fallbackColumn
              ? normalizePositions(
                  state.tasks.map((task) =>
                    task.columnId === columnId
                      ? {
                          ...task,
                          columnId: fallbackColumn.id,
                          completedAt: fallbackColumn.isCompleted ? task.completedAt ?? new Date().toISOString() : null,
                        }
                      : task,
                  ),
                )
              : state.tasks.filter((task) => task.columnId !== columnId),
          }
        }),
      setCompletedColumn: (projectId, columnId) =>
        set((state) => ({
          columns: state.columns.map((column) =>
            column.projectId === projectId ? { ...column, isCompleted: column.id === columnId } : column,
          ),
        })),
      reorderColumn: (columnId, direction) =>
        set((state) => {
          const column = state.columns.find((item) => item.id === columnId)
          if (!column) return state
          const projectColumns = state.columns
            .filter((item) => item.projectId === column.projectId && !item.archived)
            .sort((a, b) => a.position - b.position)
          const index = projectColumns.findIndex((item) => item.id === columnId)
          const target = index + direction
          if (target < 0 || target >= projectColumns.length) return state
          const ordered = [...projectColumns]
          const [removed] = ordered.splice(index, 1)
          ordered.splice(target, 0, removed)
          const positions = new Map(ordered.map((item, position) => [item.id, position]))
          return {
            columns: state.columns.map((item) => ({
              ...item,
              position: positions.get(item.id) ?? item.position,
            })),
          }
        }),
      addWorkspace: (input) =>
        set((state) => {
          const workspaceId = uid('workspace')
          const workspace = {
            id: workspaceId,
            name: input.name,
            icon: input.icon || input.name.slice(0, 1).toUpperCase(),
            color: input.color || '#4cc9f0',
            ownerId: state.profile.id,
            members: [{ userId: state.profile.id, displayName: state.profile.displayName, role: 'owner' as const }],
          }
          // TODO(Supabase): route workspace writes through a persistence service when app-data sync is enabled.
          return {
            workspaces: [...state.workspaces, workspace],
            filters: { ...state.filters, workspaceId, projectId: 'all', boardView: 'all' },
          }
        }),
      updateWorkspace: (id, patch) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) => (workspace.id === id ? { ...workspace, ...patch } : workspace)),
        })),
      archiveWorkspace: (id) =>
        set((state) => {
          const projectIds = state.projects.filter((project) => project.workspaceId === id).map((project) => project.id)
          const nextWorkspaceId = state.workspaces.find((workspace) => workspace.id !== id && !workspace.archived)?.id ?? 'all'
          return {
            workspaces: state.workspaces.map((workspace) => (workspace.id === id ? { ...workspace, archived: true } : workspace)),
            projects: state.projects.map((project) => (project.workspaceId === id ? { ...project, archived: true } : project)),
            filters: {
              ...state.filters,
              workspaceId: state.filters.workspaceId === id ? nextWorkspaceId : state.filters.workspaceId,
              projectId: projectIds.includes(state.filters.projectId) ? 'all' : state.filters.projectId,
              boardView: 'all',
            },
          }
        }),
      addProject: (input) =>
        set((state) => {
          const projectId = uid('project')
          const project: Project = {
            id: projectId,
            workspaceId: input.workspaceId,
            name: input.name,
            type: input.type,
            color: input.color || (input.type === 'study_plan' ? '#27c98b' : '#4cc9f0'),
          }
          const columns: BoardColumn[] = defaultColumnNames(input.type).map((columnName, position) => ({
            id: uid('column'),
            projectId: project.id,
            name: columnName,
            position,
            isCompleted: position === 2,
          }))
          return {
            projects: [...state.projects, project],
            columns: [...state.columns, ...columns],
            filters: { ...state.filters, workspaceId: input.workspaceId, projectId, boardView: 'all' },
          }
        }),
      updateProject: (id, patch) =>
        set((state) => ({
          projects: state.projects.map((project) => (project.id === id ? { ...project, ...patch } : project)),
        })),
      archiveProject: (id) =>
        set((state) => ({
          projects: state.projects.map((project) => (project.id === id ? { ...project, archived: true } : project)),
          filters: {
            ...state.filters,
            projectId: state.filters.projectId === id ? 'all' : state.filters.projectId,
            boardView: state.filters.projectId === id ? 'all' : state.filters.boardView,
          },
        })),
      addWorkspaceMember: (workspaceId, input) =>
        set((state) => {
          const member: WorkspaceMember = {
            userId: uid('user'),
            displayName: input.displayName,
            email: input.email,
            role: input.role,
            active: true,
          }
          return {
            workspaces: state.workspaces.map((workspace) =>
              workspace.id === workspaceId ? { ...workspace, members: [...workspace.members, member] } : workspace,
            ),
          }
        }),
      updateWorkspaceMember: (workspaceId, userId, patch) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  members: workspace.members.map((member) => (member.userId === userId ? { ...member, ...patch } : member)),
                }
              : workspace,
          ),
        })),
      archiveWorkspaceMember: (workspaceId, userId) =>
        set((state) => ({
          workspaces: state.workspaces.map((workspace) =>
            workspace.id === workspaceId
              ? {
                  ...workspace,
                  members: workspace.members.map((member) => (member.userId === userId ? { ...member, active: false } : member)),
                }
              : workspace,
          ),
          tasks: state.tasks.map((task) => (task.workspaceId === workspaceId && task.assigneeId === userId ? { ...task, assigneeId: null } : task)),
        })),
      addRoleCategory: (workspaceId, input) =>
        set((state) => ({
          roleCategories: [...state.roleCategories, { id: uid('role'), workspaceId, name: input.name, color: input.color || '#4cc9f0' }],
        })),
      updateRoleCategory: (id, patch) =>
        set((state) => ({
          roleCategories: state.roleCategories.map((role) => (role.id === id ? { ...role, ...patch } : role)),
        })),
      deleteRoleCategory: (id) =>
        set((state) => ({
          roleCategories: state.roleCategories.filter((role) => role.id !== id),
          tasks: state.tasks.map((task) => (task.assigneeRoleId === id ? { ...task, assigneeRoleId: null } : task)),
          filters: { ...state.filters, boardView: state.filters.boardView === `role:${id}` ? 'all' : state.filters.boardView },
        })),
      addLearner: (workspaceId, name, grade, guardianName) =>
        set((state) => {
          const learner: Learner = {
            id: uid('learner'),
            workspaceId,
            name,
            grade: grade || undefined,
            guardianName: guardianName || undefined,
          }
          return { learners: [...state.learners, learner] }
        }),
      addSubject: (workspaceId, name, color = '#27c98b') =>
        set((state) => {
          const subject: Subject = {
            id: uid('subject'),
            workspaceId,
            name,
            color,
          }
          return { subjects: [...state.subjects, subject] }
        }),
      resetDemo: () => set({ ...demoData, filters: defaultFilters }),
    }),
    {
      name: appConfig.storageKey,
      partialize: (state) => {
        const { navOpen, ...persisted } = state
        void navOpen
        return persisted
      },
      merge: (persisted, current) => {
        const saved = persisted as Partial<PlannerState>
        return {
          ...current,
          ...saved,
          filters: {
            ...defaultFilters,
            ...(saved.filters ?? {}),
          },
          roleCategories: saved.roleCategories ?? current.roleCategories,
          tasks: saved.tasks?.map((task) => ({ ...task, assigneeRoleId: task.assigneeRoleId ?? null })) ?? current.tasks,
          navOpen: false,
        }
      },
    },
  ),
)

export const useSelectedProject = () => {
  const { projects, filters } = usePlannerStore()
  return (
    projects.find((project) => project.id === filters.projectId && !project.archived) ??
    projects.find((project) => filters.workspaceId !== 'all' && project.workspaceId === filters.workspaceId && !project.archived) ??
    projects.find((project) => !project.archived)
  )
}
