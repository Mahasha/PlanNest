import type { SupabaseClient } from '@supabase/supabase-js'
import { supabase } from './supabase'

const STORAGE_KEY = 'plannest:pending-writes:v1'

type Write = {
  id: string
  userId: string
  label: string
  kind: 'insert' | 'update' | 'delete' | 'task-save'
  table?: string
  rowId?: string
  payload?: unknown
}

let activeUserId: string | null = null
let flushing: Promise<void> | null = null

function readQueue(): Write[] {
  try {
    const value = JSON.parse(localStorage.getItem(STORAGE_KEY) ?? '[]')
    return Array.isArray(value) ? value as Write[] : []
  } catch {
    throw new Error('The pending-write queue could not be read. Local changes were left untouched.')
  }
}

function saveQueue(queue: Write[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(queue))
  window.dispatchEvent(new Event('plannest:sync-status'))
}

export function setActiveSyncUser(userId: string | null) {
  activeUserId = userId
  window.dispatchEvent(new Event('plannest:sync-status'))
}

export function pendingWriteCount() {
  return readQueue().filter((write) => write.userId === activeUserId).length
}

export function queueWrite(write: Omit<Write, 'id' | 'userId'>) {
  if (!activeUserId || !supabase) return
  saveQueue([...readQueue(), { ...write, id: crypto.randomUUID(), userId: activeUserId }])
  void flushPendingWrites().catch((error) => {
    console.error('[plannerOutbox] Sync paused:', error)
    window.dispatchEvent(new Event('plannest:sync-status'))
  })
}

async function execute(write: Write) {
  if (!supabase) throw new Error('Supabase is not configured')
  // The operation is constrained to table names produced by this module's callers.
  const db = supabase as unknown as SupabaseClient
  if (write.kind === 'task-save') {
    const { error } = await supabase.rpc('save_task', write.payload as never)
    if (error) throw error
    return
  }
  if (!write.table) throw new Error('Missing table name')
  const table = db.from(write.table)
  const response = write.kind === 'insert'
    ? await table.upsert(write.payload as never, { onConflict: 'id', ignoreDuplicates: true })
    : write.kind === 'update'
      ? await table.update(write.payload as never).eq('id', write.rowId)
      : await table.delete().eq('id', write.rowId)
  if (response.error) throw response.error
}

/** Replay persisted writes in order. A failed write and all later writes remain queued. */
export async function flushPendingWrites(): Promise<void> {
  if (!activeUserId || !supabase) return
  if (flushing) return flushing
  flushing = (async () => {
    while (true) {
      const write = readQueue().find((item) => item.userId === activeUserId)
      if (!write) return
      await execute(write)
      saveQueue(readQueue().filter((item) => item.id !== write.id))
    }
  })()
  try {
    await flushing
  } finally {
    flushing = null
  }
}

if (typeof window !== 'undefined') {
  window.addEventListener('online', () => {
    void flushPendingWrites().catch(() => window.dispatchEvent(new Event('plannest:sync-status')))
  })
}
