import type { TodoItem } from './types'

// 跨模块待办单独存一份：和业务记录分开，清业务数据不会把待办冲掉。
const TODO_STORAGE_KEY = 'archaeology-field:todos'

let cache: TodoItem[] | null = null

function readStorage(): TodoItem[] {
  if (typeof window === 'undefined' || !window.localStorage) {
    return []
  }
  const raw = window.localStorage.getItem(TODO_STORAGE_KEY)
  if (!raw) {
    return []
  }
  try {
    const parsed = JSON.parse(raw) as TodoItem[]
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function persist(rows: TodoItem[]): void {
  cache = rows
  if (typeof window !== 'undefined' && window.localStorage) {
    window.localStorage.setItem(TODO_STORAGE_KEY, JSON.stringify(rows))
  }
}

export function listTodos(module?: string): TodoItem[] {
  if (cache === null) {
    cache = readStorage()
  }
  const rows = module ? cache.filter((item) => item.module === module) : cache
  return [...rows].sort((a, b) => b.id - a.id)
}

export function addTodo(input: Omit<TodoItem, 'id' | 'done' | 'createdAt'>): TodoItem {
  const rows = listTodos()
  const todo: TodoItem = {
    ...input,
    id: rows.reduce((max, item) => Math.max(max, item.id), 0) + 1,
    done: false,
    createdAt: new Date().toISOString().slice(0, 10),
  }
  persist([...rows, todo])
  return todo
}

export function completeTodo(id: number): void {
  persist(listTodos().map((item) => (item.id === id ? { ...item, done: true } : item)))
}

export function openTodoCount(module?: string): number {
  return listTodos(module).filter((item) => !item.done).length
}
