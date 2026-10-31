const TOKEN_KEY = "mozhu_token"

export function getToken() {
  return localStorage.getItem(TOKEN_KEY) || ""
}

export function clearToken() {
  localStorage.removeItem(TOKEN_KEY)
}

export class ApiError extends Error {
  status: number
  fields: Record<string, string>
  constructor(status: number, message: string, fields: Record<string, string> = {}) {
    super(message)
    this.status = status
    this.fields = fields
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = new Headers(options.headers)
  headers.set("Content-Type", "application/json")
  const token = getToken()
  if (token) headers.set("Authorization", `Bearer ${token}`)
  const response = await fetch(path, { ...options, headers })
  const text = await response.text()
  const data = text ? JSON.parse(text) : null
  if (!response.ok) {
    const detail = data?.detail
    if (detail && typeof detail === "object" && detail.fields) {
      const fields = detail.fields as Record<string, string>
      throw new ApiError(response.status, Object.values(fields).join("；"), fields)
    }
    throw new ApiError(
      response.status,
      typeof detail === "string" ? detail : "请求失败",
    )
  }
  return data as T
}

export async function login(email: string, password: string) {
  const data = await request<{
    access_token: string
    user: { name: string; email: string; role: string }
  }>("/api/auth/login", {
    method: "POST",
    body: JSON.stringify({ email, password }),
  })
  localStorage.setItem(TOKEN_KEY, data.access_token)
  return data
}

export type MaterialItem = {
  id: string
  title: string
  type: string
  content: string
  source: string
  version: string
  taskId: string
  author: string
  chapter: string
  excerpt: string
}

export type TemplateItem = {
  rowId: number
  id: string
  style: string
  content: string
  version: string
}

export function bootstrap() {
  return request<{
    tasks: import("./data").Task[]
    calls: Record<string, import("./data").AgentCall[]>
    dictionaries: Record<string, string[]>
    templates: TemplateItem[]
    materials: MaterialItem[]
    opensource: { version: string; name: string; license: string; url: string; words: string[] }
    accounts: { name: string; email: string; role: import("./data").Role; active: boolean }[]
    audit: {
      user: string
      role: import("./data").Role
      action: string
      object: string
      time: string
      result: string
    }[]
  }>("/api/bootstrap")
}

export function createTask(body: {
  title: string
  author: string
  intro: string
  contents: string
  styles: string[]
  generate: boolean
}) {
  return request<{ task: import("./data").Task; calls: import("./data").AgentCall[] }>(
    "/api/tasks",
    { method: "POST", body: JSON.stringify(body) },
  )
}

export function deleteTask(id: string) {
  return request<{ deleted: string; materials: string[] }>(`/api/tasks/${id}`, { method: "DELETE" })
}

export function patchTask(id: string, body: Record<string, unknown>) {
  return request<import("./data").Task>(`/api/tasks/${id}`, {
    method: "PATCH",
    body: JSON.stringify(body),
  })
}

export function runTask(
  id: string,
  body: { retry?: boolean; simulate_fail?: boolean; styles?: string[]; material?: string; prompt?: string },
) {
  return request<{
    task: import("./data").Task
    calls: import("./data").AgentCall[]
    message: string
  }>(`/api/tasks/${id}/run`, { method: "POST", body: JSON.stringify(body) })
}

export function selectCandidate(id: string, index: number) {
  return request<import("./data").Task>(`/api/tasks/${id}/select`, {
    method: "POST",
    body: JSON.stringify({ index }),
  })
}

export function scanTask(
  id: string,
  body: { text: string; rule_version: string; simulate_timeout?: boolean },
) {
  return request<{
    task: import("./data").Task
    calls: import("./data").AgentCall[]
    scan: {
      done: boolean
      error: string
      hits: { word: string; start: number; end: number }[]
      version: string
      text: string
    }
    message: string
  }>(`/api/tasks/${id}/scan`, { method: "POST", body: JSON.stringify(body) })
}

export function submitTask(id: string, body: { copy: string; reason: string; rule_version: string }) {
  return request<import("./data").Task>(`/api/tasks/${id}/submit`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function reviewTask(id: string, body: { approve: boolean; opinion: string }) {
  return request<import("./data").Task>(`/api/tasks/${id}/review`, {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function createTemplate(body: { tpl_id: string; content: string }) {
  return request<TemplateItem[]>("/api/templates", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function createStyleTemplate(body: { style: string; content: string }) {
  return request<TemplateItem[]>("/api/templates/new", {
    method: "POST",
    body: JSON.stringify(body),
  })
}

export function deleteTemplate(rowId: number) {
  return request<TemplateItem[]>(`/api/templates/${rowId}`, { method: "DELETE" })
}

export function saveMaterial(body: MaterialItem, id?: string) {
  return request<MaterialItem>(id ? `/api/materials/${id}` : "/api/materials", {
    method: id ? "PATCH" : "POST",
    body: JSON.stringify(body),
  })
}

export function createDictionary(words: string[]) {
  return request<{ version: string; dictionaries: Record<string, string[]> }>(
    "/api/dictionaries",
    { method: "POST", body: JSON.stringify({ words }) },
  )
}

export function updateAccount(email: string, body: { role?: string; active?: boolean }) {
  return request<{ name: string; email: string; role: import("./data").Role; active: boolean }[]>(
    `/api/accounts/${encodeURIComponent(email)}`,
    { method: "PATCH", body: JSON.stringify(body) },
  )
}

export function writeAudit(body: { action: string; object: string; result?: string }) {
  return request("/api/audit", { method: "POST", body: JSON.stringify(body) })
}
