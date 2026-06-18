export type Priority = 'Low' | 'Medium' | 'High' | 'Critical'
export type ProjectType = 'general' | 'study_plan'
export type WorkspaceRole = 'owner' | 'admin' | 'member' | 'viewer'

export type Profile = {
  id: string
  displayName: string
  email: string
  avatarUrl?: string | null
}

export type Workspace = {
  id: string
  name: string
  icon: string
  color: string
  ownerId: string
  members: WorkspaceMember[]
  archived?: boolean
}

export type WorkspaceMember = {
  userId: string
  displayName: string
  role: WorkspaceRole
  email?: string
  active?: boolean
  avatarUrl?: string | null
}

export type WorkspaceRoleCategory = {
  id: string
  workspaceId: string
  name: string
  color: string
}

export type Project = {
  id: string
  workspaceId: string
  name: string
  type: ProjectType
  color: string
  archived?: boolean
}

export type BoardColumn = {
  id: string
  projectId: string
  name: string
  position: number
  isCompleted: boolean
  archived?: boolean
}

export type Tag = {
  id: string
  name: string
  color: string
}

export type ChecklistItem = {
  id: string
  taskId: string
  title: string
  completed: boolean
  position: number
}

export type Learner = {
  id: string
  workspaceId: string
  name: string
  guardianName?: string
  grade?: string
}

export type Subject = {
  id: string
  workspaceId: string
  name: string
  color: string
}

export type StudyTaskDetails = {
  learnerId: string
  subjectId: string
  topic: string
  exerciseType: string
  estimatedMinutes: number
  resultMark?: number | null
  correctionRequired: boolean
  guardianNotes?: string
}

export type Task = {
  id: string
  title: string
  description?: string
  projectId: string
  workspaceId: string
  columnId: string
  priority: Priority
  dueDate?: string | null
  startDate?: string | null
  tags: string[]
  assigneeId?: string | null
  assigneeRoleId?: string | null
  checklist: ChecklistItem[]
  position: number
  createdBy: string
  completedAt?: string | null
  study?: StudyTaskDetails | null
}

export type StudyTemplate = {
  id: string
  name: string
  cadence: 'daily' | 'weekly'
  learnerId: string
  subjectId: string
  topic: string
  exerciseType: string
  estimatedMinutes: number
}

export type PlannerData = {
  profile: Profile
  workspaces: Workspace[]
  projects: Project[]
  columns: BoardColumn[]
  tasks: Task[]
  tags: Tag[]
  roleCategories: WorkspaceRoleCategory[]
  learners: Learner[]
  subjects: Subject[]
  templates: StudyTemplate[]
}

export type Filters = {
  workspaceId: string
  projectId: string
  status: string
  priority: Priority | 'All'
  tag: string
  assigneeId: string
  boardView: string
  learnerId: string
  subjectId: string
  due: 'all' | 'today' | 'overdue' | 'upcoming'
  query: string
}
