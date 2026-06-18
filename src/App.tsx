import type { FormEvent, InputHTMLAttributes, ReactNode, TextareaHTMLAttributes } from 'react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { Navigate, NavLink, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import {
  closestCorners,
  DndContext,
  type DragEndEvent,
  PointerSensor,
  useDndContext,
  useDroppable,
  useSensor,
  useSensors,
} from '@dnd-kit/core'
import { SortableContext, useSortable, verticalListSortingStrategy } from '@dnd-kit/sortable'
import { CSS } from '@dnd-kit/utilities'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
  BookOpen,
  CalendarDays,
  Check,
  CirclePlus,
  Columns3,
  LayoutDashboard,
  ListChecks,
  LogOut,
  Menu,
  MoreHorizontal,
  Pencil,
  Plus,
  RotateCcw,
  Search,
  Tag,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { useForm, useWatch } from 'react-hook-form'
import { z } from 'zod'
import { useQueryClient } from '@tanstack/react-query'
import { appConfig } from './config/app'
import { isSupabaseConfigured, supabase } from './lib/supabase'
import { useSupabaseSession } from './lib/plannerQueries'
import { usePlannerStore, useSelectedProject } from './store/plannerStore'
import type { BoardColumn, Priority, Project, Task, Workspace, WorkspaceRoleCategory } from './types/domain'

const priorityStyles: Record<Priority, string> = {
  Low: 'border-sky-400/30 bg-sky-400/10 text-sky-200',
  Medium: 'border-emerald-400/30 bg-emerald-400/10 text-emerald-200',
  High: 'border-amber-400/30 bg-amber-400/10 text-amber-200',
  Critical: 'border-rose-400/30 bg-rose-400/10 text-rose-200',
}

const todayIso = () => new Date().toISOString().slice(0, 10)
const isOverdue = (task: Task) => Boolean(task.dueDate && task.dueDate < todayIso() && !task.completedAt)
const isToday = (task: Task) => task.dueDate === todayIso()
const quickAddEvent = 'plannest:quick-add'

type QuickAddDetail = {
  projectId?: string
  columnId?: string
  boardView?: string
  taskId?: string
}

function requestQuickAdd(projectId?: string, columnId?: string, boardView?: string) {
  window.dispatchEvent(new CustomEvent<QuickAddDetail>(quickAddEvent, { detail: { projectId, columnId, boardView } }))
}

function requestEditTask(taskId: string) {
  window.dispatchEvent(new CustomEvent<QuickAddDetail>(quickAddEvent, { detail: { taskId } }))
}

const isPersonBoardView = (value: string) => value.startsWith('person:')
const isRoleBoardView = (value: string) => value.startsWith('role:')
const isLearnerBoardView = (value: string) => value.startsWith('learner:')
const boardViewId = (value: string) => value.split(':')[1]

function boardViewAssignment(value: string) {
  if (isPersonBoardView(value)) return { assigneeId: boardViewId(value), assigneeRoleId: null }
  if (isRoleBoardView(value)) return { assigneeId: null, assigneeRoleId: boardViewId(value) }
  return { assigneeId: null, assigneeRoleId: null }
}

function assignmentValueFromBoardView(value?: string) {
  return value && (isPersonBoardView(value) || isRoleBoardView(value)) ? value : 'none'
}

function App() {
  return (
    <Routes>
      <Route path="/auth" element={<AuthPage />} />
      <Route path="/*" element={<PlannerShell />} />
    </Routes>
  )
}

function AuthPage() {
  const [mode, setMode] = useState<'login' | 'signup' | 'reset'>('login')
  const [message, setMessage] = useState('')
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const schema = z.object({
    email: z.string().email(),
    password: mode === 'reset' ? z.string().optional() : z.string().min(6),
    displayName: mode === 'signup' ? z.string().min(2) : z.string().optional(),
  })
  type FormValues = z.infer<typeof schema>
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { email: '', password: '', displayName: '' },
  })

  const submit = form.handleSubmit(async (values) => {
    setMessage('')
    if (!supabase) {
      setMessage('Demo mode is active. Add Supabase env vars to enable email authentication.')
      return
    }
    if (mode === 'reset') {
      const { error } = await supabase.auth.resetPasswordForEmail(values.email, {
        redirectTo: window.location.origin,
      })
      if (error) throw error
      setMessage('Password reset email sent.')
      return
    }
    if (mode === 'signup') {
      const { error } = await supabase.auth.signUp({
        email: values.email,
        password: values.password ?? '',
        options: { data: { display_name: values.displayName } },
      })
      if (error) throw error
      setMessage('Check your inbox to confirm your account.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: values.email,
      password: values.password ?? '',
    })
    if (error) throw error
    await queryClient.invalidateQueries({ queryKey: ['supabase-session'] })
    navigate('/')
  })

  return (
    <main className="grid min-h-screen place-items-center px-5 py-8">
      <section className="w-full max-w-md rounded-lg border border-white/10 bg-[#111821]/90 p-6 shadow-2xl">
        <div className="mb-6 flex items-center gap-3">
          <div className="grid h-10 w-10 place-items-center rounded-md bg-[#4cc9f0] text-sm font-black text-[#061116]">
            {appConfig.initials}
          </div>
          <div>
            <h1 className="text-2xl font-semibold">{appConfig.name}</h1>
            <p className="text-sm text-slate-400">Tasks, teams, and study plans</p>
          </div>
        </div>
        <div className="mb-5 grid grid-cols-3 rounded-md border border-white/10 bg-white/5 p-1 text-sm">
          {(['login', 'signup', 'reset'] as const).map((item) => (
            <button
              className={`rounded px-3 py-2 ${mode === item ? 'bg-white text-slate-950' : 'text-slate-300'}`}
              key={item}
              type="button"
              onClick={() => setMode(item)}
            >
              {item === 'login' ? 'Login' : item === 'signup' ? 'Signup' : 'Reset'}
            </button>
          ))}
        </div>
        <form className="space-y-4" onSubmit={submit}>
          {mode === 'signup' && (
            <label className="block text-sm text-slate-300">
              Display name
              <input className="mt-2 w-full rounded-md border border-white/10 bg-[#0d1016] px-3 py-2" {...form.register('displayName')} />
            </label>
          )}
          <label className="block text-sm text-slate-300">
            Email
            <input className="mt-2 w-full rounded-md border border-white/10 bg-[#0d1016] px-3 py-2" type="email" {...form.register('email')} />
          </label>
          {mode !== 'reset' && (
            <label className="block text-sm text-slate-300">
              Password
              <input className="mt-2 w-full rounded-md border border-white/10 bg-[#0d1016] px-3 py-2" type="password" {...form.register('password')} />
            </label>
          )}
          {message && <p className="rounded-md border border-sky-400/30 bg-sky-400/10 p-3 text-sm text-sky-100">{message}</p>}
          <button className="w-full rounded-md bg-[#27c98b] px-4 py-2 font-semibold text-[#061116]" type="submit">
            {mode === 'reset' ? 'Send reset email' : mode === 'signup' ? 'Create account' : 'Login'}
          </button>
        </form>
      </section>
    </main>
  )
}

function PlannerShell() {
  const navOpen = usePlannerStore((state) => state.navOpen)
  const setNavOpen = usePlannerStore((state) => state.setNavOpen)
  const resetDemo = usePlannerStore((state) => state.resetDemo)
  const { data: session } = useSupabaseSession()
  const navigate = useNavigate()

  const logout = async () => {
    if (supabase) await supabase.auth.signOut()
    navigate('/auth')
  }

  return (
    <div className="min-h-screen">
      <div className="flex items-center justify-between border-b border-white/10 bg-[#0d1016]/90 px-4 py-3 lg:hidden">
        <button className="mr-3 rounded-md border border-white/10 p-2" onClick={() => setNavOpen(true)} aria-label="Open navigation">
          <Menu size={18} />
        </button>
        <UtilityMenu session={session} resetDemo={resetDemo} logout={logout} />
      </div>
      <div className="mx-auto flex min-h-screen w-full max-w-[1720px]">
        <aside
          className={`fixed inset-y-0 z-30 w-80 border-r border-white/10 bg-[#0d1016] transition-[left] lg:static ${
            navOpen ? 'left-0' : '-left-80'
          }`}
        >
          <Sidebar onClose={() => setNavOpen(false)} />
        </aside>
        <main className="min-w-0 flex-1">
          <div className="px-4 py-4 lg:px-6">
            <div className="mb-3 hidden justify-end lg:flex">
              <UtilityMenu session={session} resetDemo={resetDemo} logout={logout} />
            </div>
            <Routes>
              <Route path="/" element={<Dashboard />} />
              <Route path="/board" element={<KanbanBoard />} />
              <Route path="/list" element={<TaskListView />} />
              <Route path="/calendar" element={<CalendarView />} />
              <Route path="/study" element={<StudyView />} />
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </div>
        </main>
      </div>
      <QuickAddTask />
      {navOpen && <button className="fixed inset-0 z-20 bg-black/60 lg:hidden" onClick={() => setNavOpen(false)} aria-label="Close navigation" />}
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-3">
      <div className="grid h-10 w-10 place-items-center rounded-md bg-[#4cc9f0] text-sm font-black text-[#061116]">
        {appConfig.initials}
      </div>
      <div>
        <p className="text-base font-semibold">{appConfig.name}</p>
        <p className="text-xs text-slate-400">{appConfig.tagline}</p>
      </div>
    </div>
  )
}

function UtilityMenu({
  session,
  resetDemo,
  logout,
}: {
  session: unknown
  resetDemo: () => void
  logout: () => void
}) {
  const [open, setOpen] = useState(false)
  const status = isSupabaseConfigured ? (session ? 'Connected' : 'Supabase ready') : 'Demo mode'
  return (
    <div className="relative">
      <button
        className="inline-flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.04] px-3 py-2 text-sm text-slate-300 hover:bg-white/10"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Open user menu"
      >
        <MoreHorizontal size={17} />
        <span className="hidden sm:inline">{status}</span>
      </button>
      {open && (
        <div className="absolute right-0 top-11 z-20 w-44 rounded-md border border-white/10 bg-[#0d1016] p-1 shadow-xl">
          <MenuButton onClick={resetDemo} icon={RotateCcw} label="Reset demo" />
          <MenuButton onClick={logout} icon={LogOut} label="Logout" />
        </div>
      )}
    </div>
  )
}

function Sidebar({ onClose }: { onClose: () => void }) {
  const location = useLocation()
  const [workspaceModal, setWorkspaceModal] = useState<Workspace | 'new' | null>(null)
  const [projectModal, setProjectModal] = useState<Project | 'new' | null>(null)
  const [membersWorkspace, setMembersWorkspace] = useState<Workspace | null>(null)
  const {
    profile,
    filters,
    workspaces,
    projects,
    tags,
    setFilter,
    archiveWorkspace,
    archiveProject,
    tasks,
  } = usePlannerStore()
  const navItems = [
    { to: '/', label: 'Dashboard', icon: LayoutDashboard },
    { to: '/board', label: 'Kanban', icon: Columns3 },
    { to: '/list', label: 'List', icon: ListChecks },
    { to: '/calendar', label: 'Calendar', icon: CalendarDays },
    { to: '/study', label: 'Study', icon: BookOpen },
  ]

  const visibleWorkspaces = workspaces.filter((workspace) => !workspace.archived)
  const selectedWorkspace = visibleWorkspaces.find((workspace) => workspace.id === filters.workspaceId)
  const scopedProjects = projects.filter((project) => !project.archived && (filters.workspaceId === 'all' || project.workspaceId === filters.workspaceId))
  const projectSectionTitle = selectedWorkspace ? `${selectedWorkspace.name} Projects` : 'All Projects'
  const deleteWorkspace = (workspace: Workspace) => {
    const relatedProjects = projects.filter((project) => project.workspaceId === workspace.id && !project.archived).length
    const relatedTasks = tasks.filter((task) => task.workspaceId === workspace.id).length
    if (window.confirm(`Archive ${workspace.name}? ${relatedProjects} projects and ${relatedTasks} tasks will be hidden from active views.`)) {
      archiveWorkspace(workspace.id)
    }
  }
  const deleteProject = (project: Project) => {
    const relatedTasks = tasks.filter((task) => task.projectId === project.id).length
    if (window.confirm(`Archive ${project.name}? ${relatedTasks} tasks will be hidden from active views.`)) {
      archiveProject(project.id)
    }
  }

  return (
    <div className="flex h-full flex-col p-4">
      <div className="mb-5 flex items-center justify-between">
        <Brand />
        <button className="rounded-md border border-white/10 p-2 lg:hidden" onClick={onClose} aria-label="Close navigation">
          <X size={18} />
        </button>
      </div>
      <div className="mb-4 flex items-center gap-3 rounded-lg border border-white/10 bg-white/[0.04] p-3">
        <div className="grid h-10 w-10 place-items-center rounded-md bg-[#27c98b] font-semibold text-[#061116]">
          {profile.displayName.slice(0, 1)}
        </div>
        <div className="min-w-0">
          <p className="truncate text-sm font-medium">{profile.displayName}</p>
          <p className="truncate text-xs text-slate-400">{profile.email}</p>
        </div>
      </div>
      <div className="relative mb-4">
        <Search className="absolute left-3 top-2.5 text-slate-500" size={16} />
        <input
          className="w-full rounded-md border border-white/10 bg-white/[0.04] py-2 pl-9 pr-3 text-sm outline-none focus:border-sky-300/50"
          placeholder="Search tasks, tags, learners"
          value={filters.query}
          onChange={(event) => setFilter('query', event.target.value)}
        />
      </div>
      <nav className="mb-5 grid gap-1">
        {navItems.map((item) => {
          const Icon = item.icon
          const active = item.to === '/' ? location.pathname === '/' : location.pathname.startsWith(item.to)
          return (
            <NavLink
              className={`flex items-center gap-3 rounded-md px-3 py-2 text-sm ${
                active ? 'bg-white text-slate-950' : 'text-slate-300 hover:bg-white/10'
              }`}
              key={item.to}
              to={item.to}
              onClick={onClose}
            >
              <Icon size={17} />
              {item.label}
            </NavLink>
          )
        })}
      </nav>
      <SidebarSection title="Smart Lists">
        <button className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-white/10" onClick={() => setFilter('priority', 'Critical')}>
          <span className="flex items-center gap-2">
            <AlertCircle size={16} className="text-rose-300" />
            Critical
          </span>
          <span className="text-xs text-slate-400">{tasks.filter((task) => task.priority === 'Critical').length}</span>
        </button>
        <button className="flex w-full items-center justify-between rounded-md px-2 py-2 text-left text-sm hover:bg-white/10" onClick={() => setFilter('tag', 'all')}>
          <span className="flex items-center gap-2">
            <Tag size={16} className="text-sky-300" />
            Tags
          </span>
          <span className="text-xs text-slate-400">{tags.length}</span>
        </button>
      </SidebarSection>
      <SidebarSection
        title="Workspaces"
        action={
            <button className="rounded p-1 hover:bg-white/10" onClick={() => setWorkspaceModal('new')} aria-label="Add workspace">
              <Plus size={15} />
            </button>
        }
      >
        {visibleWorkspaces.map((workspace) => (
          <div className="group flex items-center gap-1" key={workspace.id}>
          <button
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
              filters.workspaceId === workspace.id ? 'bg-white/10' : 'hover:bg-white/10'
            }`}
            onClick={() => setFilter('workspaceId', workspace.id)}
          >
            <span className="grid h-6 w-6 place-items-center rounded text-xs font-semibold" style={{ backgroundColor: workspace.color, color: '#061116' }}>
              {workspace.icon}
            </span>
            <span className="min-w-0 flex-1 truncate">{workspace.name}</span>
          </button>
          <RowMenu
            label={`${workspace.name} workspace actions`}
            items={[
              { label: 'Rename workspace', onClick: () => setWorkspaceModal(workspace) },
              { label: 'Members & roles', onClick: () => setMembersWorkspace(workspace) },
              { label: 'Archive workspace', onClick: () => deleteWorkspace(workspace), danger: true },
            ]}
          />
          </div>
        ))}
      </SidebarSection>
      <SidebarSection
        title={projectSectionTitle}
        action={
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500">{scopedProjects.length}</span>
            <button
              className="rounded p-1 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
              onClick={() => setProjectModal('new')}
              aria-label="Add project"
              disabled={!selectedWorkspace && filters.workspaceId === 'all'}
              title={!selectedWorkspace && filters.workspaceId === 'all' ? 'Select a workspace first' : undefined}
            >
              <Plus size={15} />
            </button>
          </div>
        }
      >
        {scopedProjects
          .map((project) => (
            <div className="group flex items-center gap-1" key={project.id}>
            <button
              className={`flex min-w-0 flex-1 items-center gap-2 rounded-md px-2 py-2 text-left text-sm ${
                filters.projectId === project.id ? 'bg-white/10' : 'hover:bg-white/10'
              }`}
              onClick={() => setFilter('projectId', project.id)}
            >
              <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: project.color }} />
              <span className="min-w-0 flex-1 truncate">{project.name}</span>
              <span className="text-xs text-slate-500">{tasks.filter((task) => task.projectId === project.id).length}</span>
              {project.type === 'study_plan' && <BookOpen size={14} className="text-emerald-300" />}
            </button>
            <RowMenu
              label={`${project.name} project actions`}
              items={[
                { label: 'Rename project', onClick: () => setProjectModal(project) },
                { label: 'Archive project', onClick: () => deleteProject(project), danger: true },
              ]}
            />
            </div>
          ))}
      </SidebarSection>
      <SidebarFilters />
      {workspaceModal && <WorkspaceModal workspace={workspaceModal === 'new' ? undefined : workspaceModal} onClose={() => setWorkspaceModal(null)} />}
      {projectModal && (
        <ProjectModal
          project={projectModal === 'new' ? undefined : projectModal}
          workspaceId={selectedWorkspace?.id ?? (filters.workspaceId !== 'all' ? filters.workspaceId : visibleWorkspaces[0]?.id)}
          onClose={() => setProjectModal(null)}
        />
      )}
      {membersWorkspace && <MembersRolesModal workspace={membersWorkspace} onClose={() => setMembersWorkspace(null)} />}
    </div>
  )
}

function SidebarSection({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="mb-5">
      <div className="mb-2 flex items-center justify-between px-2 text-xs font-semibold uppercase text-slate-500">
        <span>{title}</span>
        {action}
      </div>
      <div className="grid gap-1">{children}</div>
    </section>
  )
}

function RowMenu({
  label,
  items,
}: {
  label: string
  items: Array<{ label: string; onClick: () => void; danger?: boolean }>
}) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button className="rounded p-1 text-slate-500 hover:bg-white/10" onClick={() => setOpen((value) => !value)} aria-label={label} type="button">
        <MoreHorizontal size={15} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-20 w-44 rounded-md border border-white/10 bg-[#0d1016] p-1 shadow-xl">
          {items.map((item) => (
            <button
              key={item.label}
              className={`block w-full rounded px-2 py-2 text-left text-sm hover:bg-white/10 ${item.danger ? 'text-rose-200' : 'text-slate-200'}`}
              onClick={() => {
                setOpen(false)
                item.onClick()
              }}
              type="button"
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

function WorkspaceModal({ workspace, onClose }: { workspace?: Workspace; onClose: () => void }) {
  const { addWorkspace, updateWorkspace } = usePlannerStore()
  const [name, setName] = useState(workspace?.name ?? '')
  const [icon, setIcon] = useState(workspace?.icon ?? '')
  const [color, setColor] = useState(workspace?.color ?? '#4cc9f0')
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    if (workspace) updateWorkspace(workspace.id, { name: name.trim(), icon: icon.trim() || name.trim().slice(0, 1).toUpperCase(), color })
    else addWorkspace({ name: name.trim(), icon: icon.trim() || name.trim().slice(0, 1).toUpperCase(), color })
    onClose()
  }
  return (
    <ModalShell title={workspace ? 'Rename workspace' : 'Create workspace'} onClose={onClose}>
      <form className="grid gap-3" onSubmit={save}>
        <Field label="Workspace name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Icon or emoji">
            <TextInput value={icon} onChange={(event) => setIcon(event.target.value)} maxLength={4} placeholder="P" />
          </Field>
          <Field label="Colour">
            <TextInput value={color} onChange={(event) => setColor(event.target.value)} type="color" />
          </Field>
        </div>
        <FormActions onCancel={onClose} submitLabel={workspace ? 'Save changes' : 'Create workspace'} />
      </form>
    </ModalShell>
  )
}

function ProjectModal({ project, workspaceId, onClose }: { project?: Project; workspaceId?: string; onClose: () => void }) {
  const { addProject, updateProject } = usePlannerStore()
  const [name, setName] = useState(project?.name ?? '')
  const [type, setType] = useState<Project['type']>(project?.type ?? 'general')
  const [color, setColor] = useState(project?.color ?? '#4cc9f0')
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim() || !workspaceId) return
    if (project) updateProject(project.id, { name: name.trim(), color })
    else addProject({ workspaceId, name: name.trim(), type, color })
    onClose()
  }
  return (
    <ModalShell title={project ? 'Rename project' : 'Create project'} onClose={onClose}>
      <form className="grid gap-3" onSubmit={save}>
        <Field label="Project name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Project type">
            <Select value={type} onChange={(value) => setType(value as Project['type'])}>
              <option value="general">General</option>
              <option value="study_plan">Study Plan</option>
            </Select>
            {project && <p className="text-xs text-slate-500">Project type is locked after creation.</p>}
          </Field>
          <Field label="Colour">
            <TextInput value={color} onChange={(event) => setColor(event.target.value)} type="color" />
          </Field>
        </div>
        {project && <input type="hidden" value={project.type} />}
        <FormActions onCancel={onClose} submitLabel={project ? 'Save changes' : 'Create project'} />
      </form>
    </ModalShell>
  )
}

function MembersRolesModal({ workspace, onClose }: { workspace: Workspace; onClose: () => void }) {
  const { roleCategories, addWorkspaceMember, updateWorkspaceMember, archiveWorkspaceMember, addRoleCategory, updateRoleCategory, deleteRoleCategory } =
    usePlannerStore()
  const [memberName, setMemberName] = useState('')
  const [memberEmail, setMemberEmail] = useState('')
  const [memberRole, setMemberRole] = useState('member')
  const [roleName, setRoleName] = useState('')
  const [roleColor, setRoleColor] = useState('#4cc9f0')
  const workspaceRoles = roleCategories.filter((role) => role.workspaceId === workspace.id)
  const addMember = (event: FormEvent) => {
    event.preventDefault()
    if (!memberName.trim()) return
    addWorkspaceMember(workspace.id, { displayName: memberName.trim(), email: memberEmail.trim() || undefined, role: memberRole as Workspace['members'][number]['role'] })
    setMemberName('')
    setMemberEmail('')
    setMemberRole('member')
  }
  const addRole = (event: FormEvent) => {
    event.preventDefault()
    if (!roleName.trim()) return
    addRoleCategory(workspace.id, { name: roleName.trim(), color: roleColor })
    setRoleName('')
  }
  return (
    <ModalShell title={`${workspace.name} members & roles`} onClose={onClose}>
      <div className="grid gap-5">
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Workspace members</h3>
          <div className="grid gap-2">
            {workspace.members.map((member) => (
              <div key={member.userId} className={`grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-3 ${member.active === false ? 'opacity-50' : ''}`}>
                <div className="grid gap-2 sm:grid-cols-[1fr_1fr_8rem_auto]">
                  <TextInput value={member.displayName} onChange={(event) => updateWorkspaceMember(workspace.id, member.userId, { displayName: event.target.value })} />
                  <TextInput value={member.email ?? ''} onChange={(event) => updateWorkspaceMember(workspace.id, member.userId, { email: event.target.value })} placeholder="Email optional" />
                  <Select value={member.role} onChange={(value) => updateWorkspaceMember(workspace.id, member.userId, { role: value as Workspace['members'][number]['role'] })}>
                    <option value="owner">Owner</option>
                    <option value="admin">Admin</option>
                    <option value="member">Member</option>
                    <option value="viewer">Viewer</option>
                  </Select>
                  <button
                    className="rounded-md border border-white/10 px-3 py-2 text-sm text-slate-200 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-40"
                    onClick={() => archiveWorkspaceMember(workspace.id, member.userId)}
                    disabled={member.role === 'owner' || member.active === false}
                    type="button"
                  >
                    {member.active === false ? 'Inactive' : 'Deactivate'}
                  </button>
                </div>
              </div>
            ))}
          </div>
          <form className="mt-3 grid gap-2 rounded-md border border-white/10 p-3 sm:grid-cols-[1fr_1fr_8rem_auto]" onSubmit={addMember}>
            <TextInput value={memberName} onChange={(event) => setMemberName(event.target.value)} placeholder="Name" />
            <TextInput value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="Email optional" />
            <Select value={memberRole} onChange={setMemberRole}>
              <option value="admin">Admin</option>
              <option value="member">Member</option>
              <option value="viewer">Viewer</option>
            </Select>
            <button className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-950" type="submit">
              Add
            </button>
          </form>
        </section>
        <section>
          <h3 className="mb-3 text-sm font-semibold text-slate-300">Board roles/categories</h3>
          <div className="grid gap-2">
            {workspaceRoles.map((role) => (
              <div key={role.id} className="grid gap-2 rounded-md border border-white/10 bg-white/[0.03] p-3 sm:grid-cols-[1fr_5rem_auto]">
                <TextInput value={role.name} onChange={(event) => updateRoleCategory(role.id, { name: event.target.value })} />
                <TextInput value={role.color} onChange={(event) => updateRoleCategory(role.id, { color: event.target.value })} type="color" />
                <button className="rounded-md border border-white/10 px-3 py-2 text-sm text-rose-200 hover:bg-white/10" onClick={() => deleteRoleCategory(role.id)} type="button">
                  Remove
                </button>
              </div>
            ))}
          </div>
          <form className="mt-3 grid gap-2 rounded-md border border-white/10 p-3 sm:grid-cols-[1fr_5rem_auto]" onSubmit={addRole}>
            <TextInput value={roleName} onChange={(event) => setRoleName(event.target.value)} placeholder="Custom role name" />
            <TextInput value={roleColor} onChange={(event) => setRoleColor(event.target.value)} type="color" />
            <button className="rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-950" type="submit">
              Add role
            </button>
          </form>
        </section>
      </div>
    </ModalShell>
  )
}

function SidebarFilters() {
  const [moreOpen, setMoreOpen] = useState(false)
  const { filters, setFilter, workspaces, columns, tags, learners, subjects } = usePlannerStore()
  const visibleColumns = columns.filter((column) => filters.projectId === 'all' || column.projectId === filters.projectId)
  const visibleWorkspaces = workspaces.filter((workspace) => filters.workspaceId === 'all' || workspace.id === filters.workspaceId)
  const assignees = Array.from(
    new Map(
      visibleWorkspaces.flatMap((workspace) => workspace.members).map((member) => [member.userId, member]),
    ).values(),
  )
  return (
    <SidebarSection
      title="Filters"
      action={
        <button
          className="rounded px-2 py-1 text-xs normal-case text-slate-400 hover:bg-white/10"
          onClick={() => setMoreOpen((value) => !value)}
          type="button"
        >
          {moreOpen ? 'Hide' : 'Show'}
        </button>
      }
    >
      {moreOpen && (
        <div className="grid gap-2">
          <Select value={filters.status} onChange={(value) => setFilter('status', value)}>
            <option value="all">All statuses</option>
            {visibleColumns.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select value={filters.due} onChange={(value) => setFilter('due', value as typeof filters.due)}>
            <option value="all">Any date</option>
            <option value="today">Due today</option>
            <option value="overdue">Overdue</option>
            <option value="upcoming">Upcoming</option>
          </Select>
          <Select value={filters.priority} onChange={(value) => setFilter('priority', value as Priority | 'All')}>
            {['All', 'Low', 'Medium', 'High', 'Critical'].map((item) => (
              <option key={item} value={item}>
                {item === 'All' ? 'All priorities' : item}
              </option>
            ))}
          </Select>
          <Select value={filters.tag} onChange={(value) => setFilter('tag', value)}>
            <option value="all">All tags</option>
            {tags.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select value={filters.assigneeId} onChange={(value) => setFilter('assigneeId', value)}>
            <option value="all">All assignees</option>
            {assignees.map((item) => (
              <option key={item.userId} value={item.userId}>
                {item.displayName}
              </option>
            ))}
          </Select>
          <Select value={filters.learnerId} onChange={(value) => setFilter('learnerId', value)}>
            <option value="all">All learners</option>
            {learners.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
          <Select value={filters.subjectId} onChange={(value) => setFilter('subjectId', value)}>
            <option value="all">All subjects</option>
            {subjects.map((item) => (
              <option key={item.id} value={item.id}>
                {item.name}
              </option>
            ))}
          </Select>
        </div>
      )}
    </SidebarSection>
  )
}

function Select({ value, onChange, children }: { value: string; onChange: (value: string) => void; children: ReactNode }) {
  return (
    <select
      className="h-9 min-w-0 rounded-md border border-white/10 bg-[#111821] px-3 text-sm text-slate-100 outline-none focus:border-sky-300/50"
      value={value}
      onChange={(event) => onChange(event.target.value)}
    >
      {children}
    </select>
  )
}

function useFilteredTasks() {
  const { tasks, filters, projects, tags, learners, subjects } = usePlannerStore()
  return useMemo(() => {
    const query = filters.query.trim().toLowerCase()
    return tasks
      .filter((task) => filters.workspaceId === 'all' || task.workspaceId === filters.workspaceId)
      .filter((task) => filters.projectId === 'all' || task.projectId === filters.projectId)
      .filter((task) => {
        if (filters.boardView === 'all') return true
        if (filters.boardView === 'unassigned') return !task.assigneeId && !task.assigneeRoleId
        if (isPersonBoardView(filters.boardView)) return task.assigneeId === boardViewId(filters.boardView)
        if (isRoleBoardView(filters.boardView)) return task.assigneeRoleId === boardViewId(filters.boardView)
        if (isLearnerBoardView(filters.boardView)) return task.study?.learnerId === boardViewId(filters.boardView)
        return true
      })
      .filter((task) => filters.status === 'all' || task.columnId === filters.status)
      .filter((task) => filters.priority === 'All' || task.priority === filters.priority)
      .filter((task) => filters.tag === 'all' || task.tags.includes(filters.tag))
      .filter((task) => filters.assigneeId === 'all' || task.assigneeId === filters.assigneeId)
      .filter((task) => filters.learnerId === 'all' || task.study?.learnerId === filters.learnerId)
      .filter((task) => filters.subjectId === 'all' || task.study?.subjectId === filters.subjectId)
      .filter((task) => {
        if (filters.due === 'today') return isToday(task)
        if (filters.due === 'overdue') return isOverdue(task)
        if (filters.due === 'upcoming') return Boolean(task.dueDate && task.dueDate > todayIso())
        return true
      })
      .filter((task) => {
        if (!query) return true
        const tagText = task.tags.map((id) => tags.find((tag) => tag.id === id)?.name).join(' ')
        const learner = learners.find((item) => item.id === task.study?.learnerId)?.name ?? ''
        const subject = subjects.find((item) => item.id === task.study?.subjectId)?.name ?? ''
        const project = projects.find((item) => item.id === task.projectId)?.name ?? ''
        return [task.title, task.description, tagText, learner, subject, project].join(' ').toLowerCase().includes(query)
      })
      .sort((a, b) => Number(Boolean(a.completedAt)) - Number(Boolean(b.completedAt)) || a.position - b.position)
  }, [tasks, filters, projects, tags, learners, subjects])
}

function usePageScope() {
  const { filters, projects, workspaces } = usePlannerStore()
  const selectedProject = projects.find((project) => project.id === filters.projectId)
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === filters.workspaceId)
  return {
    selectedProject,
    selectedWorkspace,
    title: selectedProject?.name ?? selectedWorkspace?.name ?? 'All workspaces',
  }
}

function PageHeader({
  title,
  subtitle,
  actions,
}: {
  title: string
  subtitle: string
  actions?: ReactNode
}) {
  return (
    <header className="mb-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-semibold tracking-normal">{title}</h1>
          <p className="mt-1 text-sm text-slate-400">{subtitle}</p>
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <ActiveFilterChips />
    </header>
  )
}

function boardViewOptions(workspace?: Workspace, roles: WorkspaceRoleCategory[] = [], project?: Project) {
  return [
    { value: 'all', label: 'All' },
    { value: 'unassigned', label: 'Unassigned' },
    ...(workspace?.members ?? [])
      .filter((member) => member.active !== false)
      .map((member) => ({ value: `person:${member.userId}`, label: member.displayName })),
    ...roles
      .filter((role) => role.workspaceId === workspace?.id)
      .map((role) => ({ value: `role:${role.id}`, label: role.name })),
    ...(project?.type === 'study_plan'
      ? usePlannerStore
          .getState()
          .learners.filter((learner) => learner.workspaceId === workspace?.id)
          .map((learner) => ({ value: `learner:${learner.id}`, label: learner.name }))
      : []),
  ]
}

function boardViewLabel(value: string, workspace?: Workspace, roles: WorkspaceRoleCategory[] = [], project?: Project) {
  return boardViewOptions(workspace, roles, project).find((option) => option.value === value)?.label ?? 'All'
}

function boardViewSubtitle(value: string, project: Project, workspace?: Workspace, roles: WorkspaceRoleCategory[] = []) {
  const label = boardViewLabel(value, workspace, roles, project)
  if (value === 'all') return project.type === 'study_plan' ? 'All study tasks board' : 'All tasks board'
  if (value === 'unassigned') return 'Unassigned board'
  if (isPersonBoardView(value)) return `${label}'s board`
  if (isLearnerBoardView(value)) return `${label}'s study board`
  return `${label} board`
}

function BoardViewSelect({
  workspace,
  roles,
  project,
  value,
  onChange,
}: {
  workspace?: Workspace
  roles: WorkspaceRoleCategory[]
  project?: Project
  value: string
  onChange: (value: string) => void
}) {
  return (
    <label className="flex items-center gap-2 text-sm text-slate-400">
      <span>Board view</span>
      <Select value={value} onChange={onChange}>
        {boardViewOptions(workspace, roles, project).map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </Select>
    </label>
  )
}

function ActiveFilterChips() {
  const { filters, setFilter, columns, tags, learners, subjects, workspaces } = usePlannerStore()
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === filters.workspaceId)
  const assignees = selectedWorkspace
    ? selectedWorkspace.members
    : Array.from(new Map(workspaces.flatMap((workspace) => workspace.members).map((member) => [member.userId, member])).values())
  const activeFilters: Array<{ key: keyof typeof filters; label: string; clear: () => void }> = []

  if (filters.status !== 'all') {
    activeFilters.push({
      key: 'status',
      label: columns.find((column) => column.id === filters.status)?.name ?? 'Status',
      clear: () => setFilter('status', 'all'),
    })
  }
  if (filters.due !== 'all') {
    const labels = { today: 'Due today', overdue: 'Overdue', upcoming: 'Upcoming' }
    activeFilters.push({ key: 'due', label: labels[filters.due], clear: () => setFilter('due', 'all') })
  }
  if (filters.priority !== 'All') {
    activeFilters.push({ key: 'priority', label: filters.priority, clear: () => setFilter('priority', 'All') })
  }
  if (filters.tag !== 'all') {
    activeFilters.push({
      key: 'tag',
      label: tags.find((tag) => tag.id === filters.tag)?.name ?? 'Tag',
      clear: () => setFilter('tag', 'all'),
    })
  }
  if (filters.assigneeId !== 'all') {
    activeFilters.push({
      key: 'assigneeId',
      label: assignees.find((member) => member.userId === filters.assigneeId)?.displayName ?? 'Assignee',
      clear: () => setFilter('assigneeId', 'all'),
    })
  }
  if (filters.learnerId !== 'all') {
    activeFilters.push({
      key: 'learnerId',
      label: learners.find((learner) => learner.id === filters.learnerId)?.name ?? 'Learner',
      clear: () => setFilter('learnerId', 'all'),
    })
  }
  if (filters.subjectId !== 'all') {
    activeFilters.push({
      key: 'subjectId',
      label: subjects.find((subject) => subject.id === filters.subjectId)?.name ?? 'Subject',
      clear: () => setFilter('subjectId', 'all'),
    })
  }

  if (activeFilters.length === 0) return null

  const clearAll = () => {
    setFilter('status', 'all')
    setFilter('due', 'all')
    setFilter('priority', 'All')
    setFilter('tag', 'all')
    setFilter('assigneeId', 'all')
    setFilter('learnerId', 'all')
    setFilter('subjectId', 'all')
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2">
      {activeFilters.map((filter) => (
        <button
          key={filter.key}
          className="rounded border border-white/10 bg-white/[0.05] px-2.5 py-1 text-xs text-slate-200 hover:bg-white/10"
          onClick={filter.clear}
          type="button"
        >
          {filter.label} ×
        </button>
      ))}
      <button className="px-2 py-1 text-xs text-slate-400 hover:text-slate-100" onClick={clearAll} type="button">
        Clear all
      </button>
    </div>
  )
}

function Dashboard() {
  const tasks = useFilteredTasks()
  const { title } = usePageScope()
  const studyToday = tasks.filter((task) => task.study && isToday(task))
  const stats = [
    { label: 'Today', value: tasks.filter(isToday).length, tone: 'bg-sky-400/15 text-sky-200' },
    { label: 'Overdue', value: tasks.filter(isOverdue).length, tone: 'bg-rose-400/15 text-rose-200' },
    { label: 'Critical', value: tasks.filter((task) => task.priority === 'Critical').length, tone: 'bg-amber-400/15 text-amber-200' },
    { label: 'Study due', value: studyToday.length, tone: 'bg-emerald-400/15 text-emerald-200' },
  ]
  return (
    <div className="grid gap-5">
      <PageHeader
        title={title}
        subtitle="Dashboard"
        actions={
          <button
            className="hidden items-center gap-2 rounded-md bg-[#f0a53a] px-3 py-2 text-sm font-semibold text-[#170f04] lg:inline-flex"
            onClick={() => requestQuickAdd()}
          >
            <Plus size={16} />
            Quick add
          </button>
        }
      />
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {stats.map((stat) => (
          <section className="rounded-lg border border-white/10 bg-white/[0.04] p-4" key={stat.label}>
            <p className="text-sm text-slate-400">{stat.label}</p>
            <p className={`mt-3 inline-flex rounded-md px-3 py-2 text-3xl font-semibold ${stat.tone}`}>{stat.value}</p>
          </section>
        ))}
      </div>
      <div className="grid gap-5 xl:grid-cols-[1.2fr_0.8fr]">
        <Panel title="Today and Overdue">
          <TaskStack tasks={tasks.filter((task) => isToday(task) || isOverdue(task)).slice(0, 8)} />
        </Panel>
        <Panel title="Study Focus">
          <TaskStack tasks={studyToday.slice(0, 8)} empty="No study tasks due today." />
        </Panel>
      </div>
    </div>
  )
}

function KanbanBoard() {
  const [columnModalOpen, setColumnModalOpen] = useState(false)
  const project = useSelectedProject()
  const {
    columns,
    tasks,
    workspaces,
    roleCategories,
    filters,
    setFilter,
    moveTask,
    renameColumn,
    archiveColumn,
    setCompletedColumn,
    reorderColumn,
  } = usePlannerStore()
  const filteredTasks = useFilteredTasks()
  const workspace = workspaces.find((item) => item.id === project?.workspaceId)
  const projectColumns = columns
    .filter((column) => column.projectId === project?.id && !column.archived)
    .sort((a, b) => a.position - b.position)
  const projectTasks = filteredTasks.filter((task) => task.projectId === project?.id)
  const sensors = useSensors(useSensor(PointerSensor, { activationConstraint: { distance: 8 } }))

  const onDragEnd = (event: DragEndEvent) => {
    const activeId = String(event.active.id)
    const overId = event.over?.id ? String(event.over.id) : ''
    if (!overId || activeId === overId) return
    const overTask = tasks.find((task) => task.id === overId)
    const overColumn = columns.find((column) => column.id === overId)
    moveTask(activeId, overTask?.columnId ?? overColumn?.id ?? '', overTask?.id)
  }

  const archiveColumnSafely = (column: BoardColumn) => {
    const columnTasks = tasks.filter((task) => task.columnId === column.id)
    if (columnTasks.length === 0) {
      archiveColumn(column.id)
      return
    }
    const fallback = projectColumns.find((item) => item.id !== column.id)
    if (!fallback) {
      window.alert('Create another column before archiving the only column with tasks.')
      return
    }
    if (window.confirm(`Archive ${column.name}? ${columnTasks.length} tasks will move to ${fallback.name}. Cancel to keep the column.`)) {
      archiveColumn(column.id, fallback.id)
    }
  }

  if (!project) return <EmptyState title="No project selected" />

  return (
    <div className="grid gap-3">
      <PageHeader
        title={project.name}
        subtitle={boardViewSubtitle(filters.boardView, project, workspace, roleCategories)}
        actions={
          <>
            <BoardViewSelect
              workspace={workspace}
              roles={roleCategories}
              project={project}
              value={filters.boardView}
              onChange={(value) => setFilter('boardView', value)}
            />
            <button
              className="hidden items-center gap-2 rounded-md bg-[#f0a53a] px-3 py-2 text-sm font-semibold text-[#170f04] lg:inline-flex"
              onClick={() => requestQuickAdd(project.id, undefined, filters.boardView)}
            >
              <Plus size={16} />
              Task
            </button>
            <button className="hidden items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-950 lg:inline-flex" onClick={() => setColumnModalOpen(true)}>
              <Plus size={16} />
              Column
            </button>
          </>
        }
      />
      <DndContext sensors={sensors} collisionDetection={closestCorners} onDragEnd={onDragEnd}>
        <div className="grid auto-cols-[minmax(17rem,1fr)] grid-flow-col gap-4 overflow-x-auto pb-14 lg:pb-4">
          {projectColumns.map((column, index) => (
            <KanbanColumn
              key={column.id}
              column={column}
              project={project}
              canMoveLeft={index > 0}
              canMoveRight={index < projectColumns.length - 1}
              boardView={filters.boardView}
              tasks={projectTasks.filter((task) => task.columnId === column.id).sort((a, b) => a.position - b.position)}
              onRename={renameColumn}
              onArchive={archiveColumnSafely}
              onComplete={setCompletedColumn}
              onReorder={reorderColumn}
            />
          ))}
        </div>
      </DndContext>
      {columnModalOpen && <ColumnModal project={project} onClose={() => setColumnModalOpen(false)} />}
    </div>
  )
}

function KanbanColumn({
  column,
  project,
  canMoveLeft,
  canMoveRight,
  boardView,
  tasks,
  onRename,
  onArchive,
  onComplete,
  onReorder,
}: {
  column: BoardColumn
  project: Project
  canMoveLeft: boolean
  canMoveRight: boolean
  boardView: string
  tasks: Task[]
  onRename: (id: string, name: string) => void
  onArchive: (column: BoardColumn) => void
  onComplete: (projectId: string, columnId: string) => void
  onReorder: (id: string, direction: -1 | 1) => void
}) {
  const { setNodeRef, isOver } = useDroppable({ id: column.id })
  const { active, over } = useDndContext()
  const isDraggingTask = Boolean(active?.id)
  const isColumnTarget = isOver || over?.id === column.id || tasks.some((task) => task.id === over?.id)
  return (
    <section
      ref={setNodeRef}
      className={`min-h-[28rem] rounded-lg border p-3 transition ${
        isColumnTarget
          ? 'border-sky-300/70 bg-sky-300/10 ring-2 ring-sky-300/70'
          : isDraggingTask
            ? 'border-sky-300/30 bg-[#101722] ring-1 ring-sky-300/20'
            : 'border-white/10 bg-[#101722]'
      }`}
    >
      <header className="mb-3 flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold">{column.name}</p>
          <p className="text-xs text-slate-500">{tasks.length} tasks</p>
        </div>
        {column.isCompleted && <Check size={16} className="text-emerald-300" />}
        <button
          className="rounded p-1 text-slate-400 hover:bg-white/10 focus:bg-white/10 focus:outline-none focus:ring-2 focus:ring-sky-300/50"
          onClick={() => requestQuickAdd(project.id, column.id, boardView)}
          aria-label={`Add task to ${column.name}`}
          type="button"
        >
          <Plus size={15} />
        </button>
        <button
          className="rounded p-1 text-slate-400 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
          onClick={() => onReorder(column.id, -1)}
          aria-label="Move column left"
          disabled={!canMoveLeft}
        >
          <ArrowLeft size={15} />
        </button>
        <button
          className="rounded p-1 text-slate-400 hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-30"
          onClick={() => onReorder(column.id, 1)}
          aria-label="Move column right"
          disabled={!canMoveRight}
        >
          <ArrowRight size={15} />
        </button>
        <ColumnMenu
          onRename={() => {
            const name = window.prompt('Rename column', column.name)
            if (name) onRename(column.id, name)
          }}
          onArchive={() => onArchive(column)}
          onComplete={() => onComplete(project.id, column.id)}
        />
      </header>
      <SortableContext items={tasks.map((task) => task.id)} strategy={verticalListSortingStrategy}>
        <div className="grid min-h-20 gap-3">
          {tasks.map((task) => (
            <SortableTaskCard key={task.id} task={task} />
          ))}
          {tasks.length === 0 && <ColumnEmptyState project={project} column={column} boardView={boardView} />}
        </div>
      </SortableContext>
    </section>
  )
}

function ColumnEmptyState({ project, column, boardView }: { project: Project; column: BoardColumn; boardView: string }) {
  const title =
    project.type === 'study_plan' && column.isCompleted
      ? 'Completed study tasks will appear here.'
      : column.isCompleted
        ? 'Completed tasks will appear here.'
        : 'No tasks in this column yet.'
  return (
    <div className="rounded-md border border-dashed border-white/10 bg-white/[0.03] p-3 text-sm text-slate-500">
      <p>{title}</p>
      <button
        className="mt-3 inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-xs font-semibold text-slate-200 hover:bg-white/10"
        onClick={() => requestQuickAdd(project.id, column.id, boardView)}
        type="button"
      >
        <Plus size={14} />
        Add task
      </button>
    </div>
  )
}

function ColumnModal({ project, onClose }: { project: Project; onClose: () => void }) {
  const addColumn = usePlannerStore((state) => state.addColumn)
  const [name, setName] = useState('')
  const [isCompleted, setIsCompleted] = useState(false)
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    addColumn(project.id, name.trim(), isCompleted)
    onClose()
  }
  return (
    <ModalShell title="Add column" onClose={onClose}>
      <form className="grid gap-3" onSubmit={save}>
        <Field label="Column name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <label className="flex items-center gap-2 rounded-md border border-white/10 bg-white/[0.03] px-3 py-2 text-sm text-slate-300">
          <input type="checkbox" checked={isCompleted} onChange={(event) => setIsCompleted(event.target.checked)} />
          Mark as completed/done column
        </label>
        <FormActions onCancel={onClose} submitLabel="Add column" />
      </form>
    </ModalShell>
  )
}

function ColumnMenu({ onRename, onArchive, onComplete }: { onRename: () => void; onArchive: () => void; onComplete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative">
      <button className="rounded p-1 text-slate-400 hover:bg-white/10" onClick={() => setOpen((value) => !value)} aria-label="Column actions">
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-10 w-44 rounded-md border border-white/10 bg-[#0d1016] p-1 shadow-xl">
          <MenuButton onClick={onRename} icon={Pencil} label="Rename" />
          <MenuButton onClick={onComplete} icon={Check} label="Mark completed" />
          <MenuButton onClick={onArchive} icon={Trash2} label="Archive" />
        </div>
      )}
    </div>
  )
}

function MenuButton({ onClick, icon: Icon, label }: { onClick: () => void; icon: LucideIcon; label: string }) {
  return (
    <button className="flex w-full items-center gap-2 rounded px-2 py-2 text-left text-sm hover:bg-white/10" onClick={onClick}>
      <Icon size={15} />
      {label}
    </button>
  )
}

function SortableTaskCard({ task }: { task: Task }) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({ id: task.id })
  return (
    <div
      ref={setNodeRef}
      style={{ transform: CSS.Transform.toString(transform), transition }}
      className={isDragging ? 'opacity-50' : ''}
      {...attributes}
      {...listeners}
    >
      <TaskCard task={task} />
    </div>
  )
}

function TaskCard({ task }: { task: Task }) {
  const { tags, learners, subjects, workspaces, roleCategories, completeTask, deleteTask } = usePlannerStore()
  const learner = learners.find((item) => item.id === task.study?.learnerId)
  const subject = subjects.find((item) => item.id === task.study?.subjectId)
  const workspace = workspaces.find((item) => item.id === task.workspaceId)
  const assignee = workspace?.members.find((member) => member.userId === task.assigneeId)
  const assigneeRole = roleCategories.find((role) => role.id === task.assigneeRoleId)
  const assigneeLabel = assignee?.displayName ?? assigneeRole?.name
  const taskTags = task.tags.map((tagId) => tags.find((item) => item.id === tagId)).filter(Boolean).slice(0, 2)
  const editTask = () => requestEditTask(task.id)
  const deleteCurrentTask = () => {
    if (window.confirm(`Delete "${task.title}"? This cannot be undone.`)) deleteTask(task.id)
  }

  return (
    <article className={`group rounded-lg border border-white/10 bg-white/[0.04] p-3 shadow-lg ${task.completedAt ? 'opacity-70' : ''}`}>
      <div className="flex items-start gap-2">
        <button
          className={`mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded border ${task.completedAt ? 'border-emerald-300 bg-emerald-300 text-[#061116]' : 'border-slate-500'}`}
          onClick={() => completeTask(task.id)}
          aria-label="Complete task"
        >
          {task.completedAt && <Check size={13} />}
        </button>
        <div className="min-w-0 flex-1">
          <h3 className={`text-sm font-semibold leading-5 ${task.completedAt ? 'line-through' : ''}`}>{task.title}</h3>
          {task.description && <p className="mt-1 line-clamp-2 text-xs text-slate-400">{task.description}</p>}
          {learner && subject && (
            <p className="mt-2 text-xs font-medium text-emerald-200">
              {learner.name} • {subject.name}
            </p>
          )}
        </div>
        <button
          className="hidden rounded p-1 text-slate-500 opacity-0 transition hover:bg-white/10 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 lg:inline-flex"
          onClick={editTask}
          aria-label="Edit task"
        >
          <Pencil size={14} />
        </button>
        <button
          className="hidden rounded p-1 text-slate-500 opacity-0 transition hover:bg-white/10 focus:opacity-100 group-focus-within:opacity-100 group-hover:opacity-100 lg:inline-flex"
          onClick={deleteCurrentTask}
          aria-label="Delete task"
        >
          <Trash2 size={14} />
        </button>
        <TaskActionsMenu onEdit={editTask} onDelete={deleteCurrentTask} />
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2 text-xs text-slate-400">
        <span className={isOverdue(task) ? 'font-medium text-rose-200' : ''}>{task.dueDate ?? 'No due date'}</span>
        <span className={`rounded border px-2 py-0.5 ${priorityStyles[task.priority]}`}>{task.priority}</span>
        {assigneeLabel && <span>{assigneeLabel}</span>}
        {task.study && <span>{task.study.estimatedMinutes} min</span>}
        {task.study?.correctionRequired && <span className="text-amber-200">Correction</span>}
        {taskTags.map((tag) => (
          <span key={tag!.id} className="inline-flex items-center gap-1">
            <span className="h-2 w-2 rounded-full" style={{ backgroundColor: tag!.color }} />
            {tag!.name}
          </span>
        ))}
        {task.tags.length > taskTags.length && <span>+{task.tags.length - taskTags.length}</span>}
      </div>
    </article>
  )
}

function TaskActionsMenu({ onEdit, onDelete }: { onEdit: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false)
  return (
    <div className="relative inline-flex lg:opacity-0 lg:transition lg:focus-within:opacity-100 lg:group-focus-within:opacity-100">
      <button
        className="rounded p-1 text-slate-500 hover:bg-white/10 focus:bg-white/10"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        aria-label="Task actions"
      >
        <MoreHorizontal size={16} />
      </button>
      {open && (
        <div className="absolute right-0 top-7 z-10 w-36 rounded-md border border-white/10 bg-[#0d1016] p-1 shadow-xl">
          <MenuButton onClick={onEdit} icon={Pencil} label="Edit" />
          <MenuButton onClick={onDelete} icon={Trash2} label="Delete" />
        </div>
      )}
    </div>
  )
}

function Badge({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <span className={`inline-flex items-center gap-1 rounded border border-white/10 bg-white/[0.05] px-2 py-1 text-xs text-slate-300 ${className}`}>{children}</span>
}

function TaskListView() {
  const tasks = useFilteredTasks()
  const { title, selectedProject } = usePageScope()
  return (
    <div className="grid gap-3">
      <PageHeader
        title={title}
        subtitle="List view"
        actions={
          <button
            className="hidden items-center gap-2 rounded-md bg-[#f0a53a] px-3 py-2 text-sm font-semibold text-[#170f04] lg:inline-flex"
            onClick={() => requestQuickAdd(selectedProject?.id)}
          >
            <Plus size={16} />
            Task
          </button>
        }
      />
      <Panel title="Tasks">
        <div className="grid gap-3">
          {tasks.map((task) => (
            <TaskCard key={task.id} task={task} />
          ))}
          {tasks.length === 0 && <EmptyState title="No matching tasks" />}
        </div>
      </Panel>
    </div>
  )
}

function CalendarView() {
  const tasks = useFilteredTasks().filter((task) => task.dueDate)
  const { title, selectedProject } = usePageScope()
  const grouped = tasks.reduce<Record<string, Task[]>>((acc, task) => {
    const key = task.dueDate ?? 'No date'
    acc[key] = [...(acc[key] ?? []), task]
    return acc
  }, {})
  return (
    <div className="grid gap-3">
      <PageHeader
        title={title}
        subtitle="Calendar view"
        actions={
          <button
            className="hidden items-center gap-2 rounded-md bg-[#f0a53a] px-3 py-2 text-sm font-semibold text-[#170f04] lg:inline-flex"
            onClick={() => requestQuickAdd(selectedProject?.id)}
          >
            <Plus size={16} />
            Task
          </button>
        }
      />
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        {Object.entries(grouped)
          .sort(([a], [b]) => a.localeCompare(b))
          .map(([date, items]) => (
            <Panel key={date} title={date}>
              <TaskStack tasks={items} compact />
            </Panel>
          ))}
        {tasks.length === 0 && <EmptyState title="No dated tasks" />}
      </div>
    </div>
  )
}

function StudyView() {
  const [learnerModalOpen, setLearnerModalOpen] = useState(false)
  const [subjectModalOpen, setSubjectModalOpen] = useState(false)
  const [templateId, setTemplateId] = useState<string | null>(null)
  const { learners, subjects, templates, filters, projects, workspaces } = usePlannerStore()
  const tasks = useFilteredTasks().filter((task) => task.study && isToday(task))
  const selectedProject = projects.find((project) => project.id === filters.projectId && project.type === 'study_plan')
  const { title } = usePageScope()
  const defaultWorkspaceId =
    selectedProject?.workspaceId ??
    (filters.workspaceId !== 'all' ? filters.workspaceId : workspaces.find((workspace) => learners.some((learner) => learner.workspaceId === workspace.id))?.id) ??
    workspaces[0]?.id
  const grouped = learners.map((learner) => ({
    learner,
    subjects: subjects
      .map((subject) => ({
        subject,
        tasks: tasks.filter((task) => task.study?.learnerId === learner.id && task.study.subjectId === subject.id),
      }))
      .filter((item) => item.tasks.length),
  }))

  return (
    <div className="grid gap-3">
      <PageHeader
        title={title}
        subtitle="Daily study"
        actions={
          <button
            className="hidden items-center gap-2 rounded-md bg-[#f0a53a] px-3 py-2 text-sm font-semibold text-[#170f04] lg:inline-flex"
            onClick={() => requestQuickAdd(selectedProject?.id)}
          >
            <Plus size={16} />
            Task
          </button>
        }
      />
      <div className="grid gap-5 xl:grid-cols-[1.1fr_0.9fr]">
        <Panel title="Daily Study">
          <div className="grid gap-4">
            {grouped.map(
              (group) =>
                group.subjects.length > 0 && (
                  <section key={group.learner.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-4">
                    <h3 className="font-semibold">{group.learner.name}</h3>
                    <p className="text-sm text-slate-400">{group.learner.grade}</p>
                    <div className="mt-3 grid gap-3">
                      {group.subjects.map((item) => (
                        <div key={item.subject.id} className="rounded-md border border-white/10 p-3">
                          <p className="mb-2 text-sm font-semibold" style={{ color: item.subject.color }}>
                            {item.subject.name}
                          </p>
                          <TaskStack tasks={item.tasks} compact />
                        </div>
                      ))}
                    </div>
                  </section>
                ),
            )}
            {tasks.length === 0 && <EmptyState title="No study tasks due today" />}
          </div>
        </Panel>
        <div className="grid gap-5">
        <Panel title="Learners and Subjects">
          <div className="mb-4 flex flex-wrap gap-2">
            <button className="inline-flex items-center gap-2 rounded-md bg-white px-3 py-2 text-sm font-semibold text-slate-950" onClick={() => setLearnerModalOpen(true)}>
              <Plus size={16} />
              Learner
            </button>
            <button className="inline-flex items-center gap-2 rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10" onClick={() => setSubjectModalOpen(true)}>
              <Plus size={16} />
              Subject
            </button>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            <div className="rounded-md border border-white/10 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-300">Learners</p>
              <div className="grid gap-2">
                {learners.map((learner) => (
                  <div key={learner.id} className="rounded bg-white/[0.04] px-3 py-2 text-sm">
                    <p>{learner.name}</p>
                    <p className="text-xs text-slate-500">{learner.grade || 'No grade set'}</p>
                  </div>
                ))}
              </div>
            </div>
            <div className="rounded-md border border-white/10 p-3">
              <p className="mb-2 text-sm font-semibold text-slate-300">Subjects</p>
              <div className="grid gap-2">
                {subjects.map((subject) => (
                  <div key={subject.id} className="flex items-center gap-2 rounded bg-white/[0.04] px-3 py-2 text-sm">
                    <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: subject.color }} />
                    {subject.name}
                  </div>
                ))}
              </div>
            </div>
          </div>
        </Panel>
        <Panel title="Study Templates">
          <div className="grid gap-3">
            {templates.map((template) => {
              const learner = learners.find((item) => item.id === template.learnerId)
              const subject = subjects.find((item) => item.id === template.subjectId)
              return (
                <section key={template.id} className="rounded-lg border border-white/10 bg-white/[0.04] p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold">{template.name}</h3>
                      <p className="mt-1 text-sm text-slate-400">
                        {learner?.name} · {subject?.name} · {template.estimatedMinutes} min
                      </p>
                    </div>
                    <Badge className="border-sky-400/30 bg-sky-400/10 text-sky-100">{template.cadence}</Badge>
                  </div>
                  <p className="mt-3 text-sm text-slate-300">{template.topic}</p>
                  <button
                    className="mt-3 rounded-md border border-white/10 px-3 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10"
                    onClick={() => setTemplateId(template.id)}
                    type="button"
                  >
                    Apply template
                  </button>
                </section>
              )
            })}
          </div>
        </Panel>
        </div>
      </div>
      {learnerModalOpen && <LearnerModal workspaceId={defaultWorkspaceId} onClose={() => setLearnerModalOpen(false)} />}
      {subjectModalOpen && <SubjectModal workspaceId={defaultWorkspaceId} onClose={() => setSubjectModalOpen(false)} />}
      {templateId && <ApplyTemplateModal templateId={templateId} workspaceId={defaultWorkspaceId} onClose={() => setTemplateId(null)} />}
    </div>
  )
}

function TaskStack({ tasks, empty = 'No tasks here.', compact = false }: { tasks: Task[]; empty?: string; compact?: boolean }) {
  return (
    <div className={`grid ${compact ? 'gap-2' : 'gap-3'}`}>
      {tasks.map((task) => (
        <TaskCard key={task.id} task={task} />
      ))}
      {tasks.length === 0 && <EmptyState title={empty} compact />}
    </div>
  )
}

function LearnerModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const addLearner = usePlannerStore((state) => state.addLearner)
  const [name, setName] = useState('')
  const [grade, setGrade] = useState('')
  const [notes, setNotes] = useState('')
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    addLearner(workspaceId, name.trim(), grade.trim() || undefined, notes.trim() || undefined)
    onClose()
  }
  return (
    <ModalShell title="Add learner" onClose={onClose}>
      <form className="grid gap-3" onSubmit={save}>
        <Field label="Name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <Field label="Grade">
          <TextInput value={grade} onChange={(event) => setGrade(event.target.value)} />
        </Field>
        <Field label="Notes">
          <TextArea value={notes} onChange={(event) => setNotes(event.target.value)} />
        </Field>
        <FormActions onCancel={onClose} submitLabel="Add learner" />
      </form>
    </ModalShell>
  )
}

function SubjectModal({ workspaceId, onClose }: { workspaceId: string; onClose: () => void }) {
  const addSubject = usePlannerStore((state) => state.addSubject)
  const [name, setName] = useState('')
  const [color, setColor] = useState('#27c98b')
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!name.trim()) return
    addSubject(workspaceId, name.trim(), color)
    onClose()
  }
  return (
    <ModalShell title="Add subject" onClose={onClose}>
      <form className="grid gap-3" onSubmit={save}>
        <Field label="Name">
          <TextInput value={name} onChange={(event) => setName(event.target.value)} autoFocus />
        </Field>
        <Field label="Colour">
          <TextInput value={color} onChange={(event) => setColor(event.target.value)} type="color" />
        </Field>
        <FormActions onCancel={onClose} submitLabel="Add subject" />
      </form>
    </ModalShell>
  )
}

function ApplyTemplateModal({ templateId, workspaceId, onClose }: { templateId: string; workspaceId: string; onClose: () => void }) {
  const { templates, learners, subjects, projects, columns, addTask } = usePlannerStore()
  const template = templates.find((item) => item.id === templateId)
  const [learnerId, setLearnerId] = useState(template?.learnerId ?? learners.find((learner) => learner.workspaceId === workspaceId)?.id ?? 'none')
  const [startDate, setStartDate] = useState(todayIso())
  const [repeat, setRepeat] = useState('once')
  if (!template) return null
  const workspaceLearners = learners.filter((learner) => learner.workspaceId === workspaceId)
  const subject = subjects.find((item) => item.id === template.subjectId)
  const project = projects.find((item) => item.workspaceId === workspaceId && item.type === 'study_plan' && !item.archived)
  const firstColumn = columns.filter((column) => column.projectId === project?.id && !column.archived).sort((a, b) => a.position - b.position)[0]
  const save = (event: FormEvent) => {
    event.preventDefault()
    if (!project || !firstColumn || learnerId === 'none') return
    addTask({
      title: template.name,
      description: `${template.topic}${repeat !== 'once' ? ` (${repeat})` : ''}`,
      workspaceId,
      projectId: project.id,
      columnId: firstColumn.id,
      priority: 'Medium',
      dueDate: startDate,
      tags: [],
      learnerId,
      subjectId: template.subjectId,
      topic: template.topic,
      exerciseType: template.exerciseType,
      estimatedMinutes: template.estimatedMinutes,
    })
    onClose()
  }
  return (
    <ModalShell title="Apply study template" onClose={onClose}>
      <form className="grid gap-3" onSubmit={save}>
        <p className="rounded-md border border-white/10 bg-white/[0.03] p-3 text-sm text-slate-300">
          {template.name} · {subject?.name ?? 'Subject'} · {template.estimatedMinutes} min
        </p>
        {!project && <p className="rounded-md border border-amber-400/30 bg-amber-400/10 p-3 text-sm text-amber-100">Create a study plan project in this workspace before applying templates.</p>}
        <Field label="Learner">
          <Select value={learnerId} onChange={setLearnerId}>
            <option value="none">Select learner</option>
            {workspaceLearners.map((learner) => (
              <option key={learner.id} value={learner.id}>
                {learner.name}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="Start date">
          <TextInput value={startDate} onChange={(event) => setStartDate(event.target.value)} type="date" />
        </Field>
        <Field label="Repeat">
          <Select value={repeat} onChange={setRepeat}>
            <option value="once">Once</option>
            <option value="daily">Daily label only</option>
            <option value="weekly">Weekly label only</option>
          </Select>
        </Field>
        <FormActions onCancel={onClose} submitLabel="Apply template" />
      </form>
    </ModalShell>
  )
}

function Panel({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-lg border border-white/10 bg-[#111821]/80 p-4">
      <h2 className="mb-4 text-lg font-semibold">{title}</h2>
      {children}
    </section>
  )
}

function EmptyState({ title, compact = false }: { title: string; compact?: boolean }) {
  return (
    <div className={`grid place-items-center rounded-lg border border-dashed border-white/10 bg-white/[0.03] text-center text-sm text-slate-500 ${compact ? 'min-h-20 p-3' : 'min-h-40 p-6'}`}>
      {title}
    </div>
  )
}

function ModalShell({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="fixed inset-0 z-40 grid place-items-center bg-black/70 px-4 py-6">
      <section className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-lg border border-white/10 bg-[#111821] p-5 shadow-2xl">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-xl font-semibold">{title}</h2>
          <button className="rounded p-2 hover:bg-white/10" onClick={onClose} aria-label={`Close ${title}`}>
            <X size={18} />
          </button>
        </div>
        {children}
      </section>
    </div>
  )
}

function Field({
  label,
  children,
}: {
  label: string
  children: ReactNode
}) {
  return (
    <label className="grid gap-1 text-sm text-slate-300">
      <span>{label}</span>
      {children}
    </label>
  )
}

function TextInput(props: InputHTMLAttributes<HTMLInputElement>) {
  return <input className="rounded-md border border-white/10 bg-[#0d1016] px-3 py-2 text-slate-100 outline-none focus:border-sky-300/50" {...props} />
}

function TextArea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className="min-h-20 rounded-md border border-white/10 bg-[#0d1016] px-3 py-2 text-slate-100 outline-none focus:border-sky-300/50" {...props} />
}

function FormActions({ onCancel, submitLabel = 'Save' }: { onCancel: () => void; submitLabel?: string }) {
  return (
    <div className="mt-2 flex justify-end gap-2">
      <button className="rounded-md border border-white/10 px-4 py-2 text-sm font-semibold text-slate-200 hover:bg-white/10" type="button" onClick={onCancel}>
        Cancel
      </button>
      <button className="rounded-md bg-[#27c98b] px-4 py-2 text-sm font-semibold text-[#061116]" type="submit">
        {submitLabel}
      </button>
    </div>
  )
}

const taskSchema = z.object({
  title: z.string().min(2),
  description: z.string().optional(),
  workspaceId: z.string().min(1),
  projectId: z.string().min(1),
  columnId: z.string().min(1),
  assignment: z.string().optional(),
  priority: z.enum(['Low', 'Medium', 'High', 'Critical']),
  dueDate: z.string().optional(),
  tagId: z.string().optional(),
  learnerId: z.string().optional(),
  subjectId: z.string().optional(),
  topic: z.string().optional(),
  exerciseType: z.string().optional(),
  estimatedMinutes: z.coerce.number().optional(),
  correctionRequired: z.boolean().optional(),
  guardianNotes: z.string().optional(),
  checklistText: z.string().optional(),
})

type TaskFormInput = z.input<typeof taskSchema>
type TaskFormOutput = z.output<typeof taskSchema>

function QuickAddTask() {
  const [open, setOpen] = useState(false)
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null)
  const { addTask, updateTask, tasks, workspaces, projects, columns, tags, learners, subjects, roleCategories, filters } = usePlannerStore()
  const selectedProject = useSelectedProject()
  const firstActiveColumnId = useCallback(
    (projectId?: string) =>
      columns
        .filter((column) => column.projectId === projectId && !column.archived)
        .sort((a, b) => a.position - b.position)[0]?.id ?? '',
    [columns],
  )
  const form = useForm<TaskFormInput, unknown, TaskFormOutput>({
    resolver: zodResolver(taskSchema),
    defaultValues: {
      title: '',
      description: '',
      workspaceId: selectedProject?.workspaceId ?? workspaces[0]?.id,
      projectId: selectedProject?.id ?? projects[0]?.id,
      columnId: firstActiveColumnId(selectedProject?.id ?? projects[0]?.id),
      assignment: assignmentValueFromBoardView(filters.boardView),
      priority: 'Medium',
      dueDate: '',
      tagId: 'none',
      learnerId: 'none',
      subjectId: 'none',
      topic: '',
      exerciseType: 'Practice',
      estimatedMinutes: 30,
      correctionRequired: false,
      guardianNotes: '',
      checklistText: '',
    },
  })
  const watchedWorkspaceId = useWatch({ control: form.control, name: 'workspaceId' })
  const watchedProjectId = useWatch({ control: form.control, name: 'projectId' })
  const watchedColumnId = useWatch({ control: form.control, name: 'columnId' })
  const watchedAssignment = useWatch({ control: form.control, name: 'assignment' })
  const watchedPriority = useWatch({ control: form.control, name: 'priority' })
  const watchedTagId = useWatch({ control: form.control, name: 'tagId' })
  const watchedLearnerId = useWatch({ control: form.control, name: 'learnerId' })
  const watchedSubjectId = useWatch({ control: form.control, name: 'subjectId' })
  const watchedCorrectionRequired = useWatch({ control: form.control, name: 'correctionRequired' })
  const selectedProjectType = projects.find((project) => project.id === watchedProjectId)?.type
  const visibleProjects = projects.filter((project) => project.workspaceId === watchedWorkspaceId)
  const visibleColumns = columns
    .filter((column) => column.projectId === watchedProjectId && !column.archived)
    .sort((a, b) => a.position - b.position)
  const selectedWorkspace = workspaces.find((workspace) => workspace.id === watchedWorkspaceId)
  const assignmentOptions = [
    { value: 'none', label: 'Unassigned' },
    ...(selectedWorkspace?.members ?? []).map((member) => ({ value: `person:${member.userId}`, label: member.displayName })),
    ...roleCategories
      .filter((role) => role.workspaceId === watchedWorkspaceId)
      .map((role) => ({ value: `role:${role.id}`, label: role.name })),
  ]

  useEffect(() => {
    const open = (event: Event) => {
      const detail = (event as CustomEvent<QuickAddDetail>).detail
      const editingTask = tasks.find((task) => task.id === detail?.taskId)
      if (editingTask) {
        setEditingTaskId(editingTask.id)
        form.reset({
          title: editingTask.title,
          description: editingTask.description ?? '',
          workspaceId: editingTask.workspaceId,
          projectId: editingTask.projectId,
          columnId: editingTask.columnId,
          assignment: editingTask.assigneeId ? `person:${editingTask.assigneeId}` : editingTask.assigneeRoleId ? `role:${editingTask.assigneeRoleId}` : 'none',
          priority: editingTask.priority,
          dueDate: editingTask.dueDate ?? '',
          tagId: editingTask.tags[0] ?? 'none',
          learnerId: editingTask.study?.learnerId ?? 'none',
          subjectId: editingTask.study?.subjectId ?? 'none',
          topic: editingTask.study?.topic ?? '',
          exerciseType: editingTask.study?.exerciseType ?? 'Practice',
          estimatedMinutes: editingTask.study?.estimatedMinutes ?? 30,
          correctionRequired: Boolean(editingTask.study?.correctionRequired),
          guardianNotes: editingTask.study?.guardianNotes ?? '',
          checklistText: editingTask.checklist.map((item) => item.title).join('\n'),
        })
        setOpen(true)
        return
      }
      const project =
        projects.find((item) => item.id === detail?.projectId) ??
        (filters.projectId !== 'all' ? projects.find((item) => item.id === filters.projectId) : undefined) ??
        selectedProject ??
        projects[0]
      const columnId =
        columns.find((column) => column.id === detail?.columnId && column.projectId === project?.id && !column.archived)?.id ??
        firstActiveColumnId(project?.id)
      if (project) {
        setEditingTaskId(null)
        form.reset({
          ...form.getValues(),
          title: '',
          description: '',
          workspaceId: project.workspaceId,
          projectId: project.id,
          columnId,
          assignment: assignmentValueFromBoardView(detail?.boardView ?? filters.boardView),
          priority: form.getValues('priority') ?? 'Medium',
          dueDate: '',
          tagId: 'none',
          learnerId: isLearnerBoardView(detail?.boardView ?? filters.boardView) ? boardViewId(detail?.boardView ?? filters.boardView) : 'none',
          subjectId: 'none',
          topic: '',
          exerciseType: 'Practice',
          estimatedMinutes: 30,
          correctionRequired: false,
          guardianNotes: '',
          checklistText: '',
        })
      }
      setOpen(true)
    }
    window.addEventListener(quickAddEvent, open)
    return () => window.removeEventListener(quickAddEvent, open)
  }, [columns, filters.boardView, filters.projectId, firstActiveColumnId, form, projects, selectedProject, tasks])

  const submit = form.handleSubmit((values) => {
    const assignment = boardViewAssignment(values.assignment ?? 'none')
    const checklist = (values.checklistText ?? '')
      .split('\n')
      .map((item) => item.trim())
      .filter(Boolean)
      .map((title, position) => ({
        id: `check-${crypto.randomUUID()}`,
        taskId: editingTaskId ?? 'new',
        title,
        completed: false,
        position,
      }))
    const study =
      values.learnerId && values.learnerId !== 'none' && values.subjectId && values.subjectId !== 'none'
        ? {
            learnerId: values.learnerId,
            subjectId: values.subjectId,
            topic: values.topic || 'Study session',
            exerciseType: values.exerciseType || 'Practice',
            estimatedMinutes: values.estimatedMinutes || 30,
            correctionRequired: Boolean(values.correctionRequired),
            guardianNotes: values.guardianNotes || undefined,
          }
        : null
    if (editingTaskId) {
      updateTask(editingTaskId, {
        title: values.title,
        description: values.description,
        workspaceId: values.workspaceId,
        projectId: values.projectId,
        columnId: values.columnId,
        priority: values.priority,
        dueDate: values.dueDate || null,
        tags: values.tagId && values.tagId !== 'none' ? [values.tagId] : [],
        assigneeId: assignment.assigneeId,
        assigneeRoleId: assignment.assigneeRoleId,
        checklist: checklist.map((item) => ({ ...item, taskId: editingTaskId })),
        study,
      })
    } else {
      addTask({
        ...values,
        ...assignment,
        tags: values.tagId && values.tagId !== 'none' ? [values.tagId] : [],
        learnerId: values.learnerId === 'none' ? undefined : values.learnerId,
        subjectId: values.subjectId === 'none' ? undefined : values.subjectId,
        guardianNotes: values.guardianNotes,
        checklistTitles: checklist.map((item) => item.title),
      })
    }
    form.reset({
      ...values,
      title: '',
      description: '',
      tagId: 'none',
      learnerId: 'none',
      subjectId: 'none',
      assignment: values.assignment ?? 'none',
      columnId: values.columnId,
      correctionRequired: false,
      guardianNotes: '',
      checklistText: '',
    })
    setEditingTaskId(null)
    setOpen(false)
  })

  return (
    <>
      <button
        className="fixed bottom-8 right-5 z-20 inline-flex h-14 w-14 items-center justify-center rounded-full bg-[#f0a53a] font-semibold text-[#170f04] shadow-xl lg:hidden"
        onClick={() => {
          requestQuickAdd()
        }}
        aria-label="Quick add task"
      >
        <CirclePlus size={20} />
      </button>
      {open && (
        <ModalShell title={editingTaskId ? 'Edit task' : 'New task'} onClose={() => setOpen(false)}>
            <form className="grid gap-3" onSubmit={submit}>
              <TextInput placeholder="Task title" {...form.register('title')} />
              <TextArea placeholder="Description" {...form.register('description')} />
              <div className="grid gap-3 sm:grid-cols-2">
                <Select
                  value={watchedWorkspaceId}
                  onChange={(value) => {
                    const nextProject = projects.find((project) => project.workspaceId === value)
                    form.setValue('workspaceId', value)
                    if (nextProject) {
                      form.setValue('projectId', nextProject.id)
                      form.setValue('columnId', firstActiveColumnId(nextProject.id))
                    }
                    form.setValue('assignment', 'none')
                  }}
                >
                  {workspaces.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
                <Select
                  value={watchedProjectId}
                  onChange={(value) => {
                    form.setValue('projectId', value)
                    form.setValue('columnId', firstActiveColumnId(value))
                  }}
                >
                  {visibleProjects.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
                <Select value={watchedColumnId} onChange={(value) => form.setValue('columnId', value)}>
                  {visibleColumns.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
                <Select value={watchedAssignment ?? 'none'} onChange={(value) => form.setValue('assignment', value)}>
                  {assignmentOptions.map((item) => (
                    <option key={item.value} value={item.value}>
                      {item.label}
                    </option>
                  ))}
                </Select>
                <Select value={watchedPriority} onChange={(value) => form.setValue('priority', value as Priority)}>
                  {(['Low', 'Medium', 'High', 'Critical'] as const).map((item) => (
                    <option key={item} value={item}>
                      {item}
                    </option>
                  ))}
                </Select>
                <input className="rounded-md border border-white/10 bg-[#0d1016] px-3 py-2" type="date" {...form.register('dueDate')} />
                <Select value={watchedTagId ?? 'none'} onChange={(value) => form.setValue('tagId', value)}>
                  <option value="none">No tag</option>
                  {tags.map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
                </Select>
              </div>
              {selectedProjectType === 'study_plan' && (
                <div className="grid gap-3 rounded-lg border border-emerald-400/20 bg-emerald-400/5 p-3 sm:grid-cols-2">
                  <Select value={watchedLearnerId ?? 'none'} onChange={(value) => form.setValue('learnerId', value)}>
                    <option value="none">Learner</option>
                    {learners.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                  <Select value={watchedSubjectId ?? 'none'} onChange={(value) => form.setValue('subjectId', value)}>
                    <option value="none">Subject</option>
                    {subjects.map((item) => (
                      <option key={item.id} value={item.id}>
                        {item.name}
                      </option>
                    ))}
                  </Select>
                  <input className="rounded-md border border-white/10 bg-[#0d1016] px-3 py-2" placeholder="Topic" {...form.register('topic')} />
                  <input className="rounded-md border border-white/10 bg-[#0d1016] px-3 py-2" placeholder="Exercise type" {...form.register('exerciseType')} />
                  <input className="rounded-md border border-white/10 bg-[#0d1016] px-3 py-2" type="number" min="5" step="5" {...form.register('estimatedMinutes')} />
                  <TextArea placeholder="Guardian notes" {...form.register('guardianNotes')} />
                  <label className="flex min-h-9 items-center gap-2 rounded-md border border-white/10 bg-[#0d1016] px-3 py-2 text-sm text-slate-300">
                    <input
                      type="checkbox"
                      checked={Boolean(watchedCorrectionRequired)}
                      onChange={(event) => form.setValue('correctionRequired', event.target.checked)}
                    />
                    Correction required
                  </label>
                </div>
              )}
              <Field label="Checklist items">
                <TextArea placeholder="One item per line" {...form.register('checklistText')} />
              </Field>
              <FormActions onCancel={() => setOpen(false)} submitLabel={editingTaskId ? 'Save task' : 'Add task'} />
            </form>
        </ModalShell>
      )}
    </>
  )
}

export default App
