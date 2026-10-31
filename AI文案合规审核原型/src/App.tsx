import { useEffect, useRef, useState, type ReactNode } from "react"
import * as api from "./api"
import { ApiError, type MaterialItem } from "./api"
import Login from "./Login"
import {
  Avatar,
  Badge,
  Button,
  EmptyState,
  Field,
  Heading,
  Icon,
  Input,
  Modal,
  Notice,
  Select,
  Textarea,
  statuses,
  type IconName,
  type Status,
} from "./ui"
import {
  acceptance,
  initialTasks,
  intro,
  otherTask,
  styleOptions,
  type AgentCall,
  type Role,
  type Task,
} from "./data"

type Page = "tasks" | "review" | "materials" | "templates" | "dictionary" | "accounts" | "audit" | "design" | "states" | "help" | "form" | "detail" | "forbidden"
type Audit = {
  user: string
  role: Role
  action: string
  object: string
  time: string
  result: string
}
interface NavItem {
  id: Page
  label: string
  icon: IconName
}
interface ToastMessage {
  text: string
  error?: boolean
}
interface SensitiveHit {
  word: string
  start: number
  end: number
}
const navGroups: {
  label: string
  items: NavItem[]
}[] = [
  {
    label: "工作空间",
    items: [
      { id: "tasks", label: "任务管理", icon: "tasks" },
      { id: "review", label: "审核工作台", icon: "review" },
      { id: "materials", label: "资料管理", icon: "folder" },
    ],
  },
  {
    label: "系统管理",
    items: [
      { id: "templates", label: "风格模板库", icon: "template" },
      { id: "dictionary", label: "敏感词库", icon: "shield" },
      { id: "accounts", label: "账号与角色", icon: "users" },
      { id: "audit", label: "审计日志", icon: "history" },
    ],
  },
]
const pageNames: Partial<Record<Page, string>> = {
  tasks: "任务管理",
  review: "审核工作台",
  materials: "资料管理",
  templates: "风格模板库",
  dictionary: "敏感词库",
  accounts: "账号与角色",
  audit: "审计日志",
  design: "设计系统",
  states: "全局状态",
  help: "帮助与验收",
  form: "新建 / 编辑任务",
  detail: "任务详情",
  forbidden: "访问受限",
}
const detailTabs = [
  "资料与生成",
  "候选文案",
  "人工微调",
  "敏感词筛查",
  "版本记录",
  "Agent 执行记录",
]
const emptyMaterial = (): MaterialItem => ({
  id: "",
  title: "",
  type: "书稿摘要",
  content: "",
  source: "",
  version: "V1.0",
  taskId: "",
  author: "",
  chapter: "",
  excerpt: "",
})
function rejectionReason(task: Task) {
  if (task.status !== "退回") return ""
  const hit = [...task.versions]
    .reverse()
    .find(
      (item) =>
        item.opinion &&
        !["等待主编审核", "保留原始生成结果", "待人工确认"].includes(item.opinion),
    )
  return hit?.opinion || ""
}
const now = () => new Date().toLocaleString("sv-SE").slice(0, 16)

export default function App() {
  const [signedIn, setSignedIn] = useState(false)
  const [page, setPage] = useState<Page>("tasks")
  const [role, setRole] = useState<Role>("编辑")
  const [tasks, setTasks] = useState<Task[]>([...initialTasks, otherTask])
  const [activeId, setActiveId] = useState("TASK-001")
  const [tab, setTab] = useState(0)
  const [status, setStatus] = useState("全部")
  const [keyword, setKeyword] = useState("")
  const [creator, setCreator] = useState("全部创建人")
  const [listPage, setListPage] = useState(1)
  const [pageSize, setPageSize] = useState(8)
  const [checked, setChecked] = useState<string[]>([])
  const [dateFilter, setDateFilter] = useState("近 30 天")
  const [toast, setToast] = useState<ToastMessage | null>(null)
  const [modal, setModal] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [savingForm, setSavingForm] = useState(false)
  const [form, setForm] = useState({
    title: "",
    author: "",
    intro: "",
    contents: "",
    styles: ["温暖治愈"],
  })
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [calls, setCalls] = useState<Record<string, AgentCall[]>>({})
  const [run, setRun] = useState<{
    id: string
    step: number
    fail: boolean
  } | null>(null)
  const [failureMode, setFailureMode] = useState(false)
  const [dictVersion, setDictVersion] = useState("DICT-V1")
  const [dictionaries, setDictionaries] = useState<Record<string, string[]>>({
    "DICT-V1": ["最佳", "第一", "绝对"],
    "DICT-V2": ["最佳", "第一", "绝对", "治愈"],
  })
  const [dictionaryDraft, setDictionaryDraft] = useState("")
  const [scanText, setScanText] = useState("")
  const [scan, setScan] = useState<{
    done: boolean
    error: string
    hits: SensitiveHit[]
    version: string
    text: string
  } | null>(null)
  const [scanning, setScanning] = useState(false)
  const [scanFailure, setScanFailure] = useState(false)
  const [reviewOpinion, setReviewOpinion] = useState("")
  const [opinionError, setOpinionError] = useState("")
  const [audit, setAudit] = useState<Audit[]>([
    {
      user: "陈妍",
      role: "编辑",
      action: "尝试修改他人任务",
      object: "TASK-001",
      time: "2025-05-22 14:30",
      result: "403 · 权限拒绝",
    },
    {
      user: "林晓",
      role: "编辑",
      action: "提交人工修改版本",
      object: "TASK-001 · V2",
      time: "2025-05-22 14:32",
      result: "成功",
    },
    {
      user: "王珂",
      role: "管理员",
      action: "发布敏感词库版本",
      object: "DICT-V2",
      time: "2025-05-22 10:20",
      result: "成功",
    },
    {
      user: "周明",
      role: "主编",
      action: "审核通过",
      object: "TASK-004",
      time: "2025-05-22 09:18",
      result: "成功",
    },
  ])
  const [templateVersions, setTemplateVersions] = useState<api.TemplateItem[]>([
    {
      rowId: 0,
      id: "TPL-001",
      style: "温暖治愈",
      content:
        "采用温暖细腻的语言，突出情感共鸣；以生活细节为切入点，避免绝对化宣传。",
      version: "V1.2",
    },
    {
      rowId: 0,
      id: "TPL-002",
      style: "文学叙事",
      content:
        "以具有画面感的文学语言呈现主题，保留叙事留白，关注人物与时代的关系。",
      version: "V1.0",
    },
    {
      rowId: 0,
      id: "TPL-003",
      style: "悬念引导",
      content:
        "用问题或故事引子建立悬念，引导阅读兴趣，不编造书稿未提供的情节。",
      version: "V1.1",
    },
  ])
  const availableStyles = Array.from(
    new Set([...styleOptions, ...templateVersions.map((item) => item.style)]),
  )
  const [templateContent, setTemplateContent] = useState("")
  const [templateIndex, setTemplateIndex] = useState(0)
  const [accounts, setAccounts] = useState<{
    name: string
    email: string
    role: Role
    active: boolean
  }[]>([
    { name: "林晓", email: "linxiao@example.com", role: "编辑", active: true },
    { name: "陈妍", email: "chenyan@example.com", role: "编辑", active: true },
    { name: "周明", email: "zhouming@example.com", role: "主编", active: true },
    { name: "王珂", email: "wangke@example.com", role: "管理员", active: true },
  ])
  const [tableState, setTableState] =
    useState<"normal" | "empty" | "loading" | "error">("normal")
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [resourceQuery, setResourceQuery] = useState("")
  const [resourcePage, setResourcePage] = useState(1)
  const [materials, setMaterials] = useState<MaterialItem[]>([])
  const [materialForm, setMaterialForm] = useState<MaterialItem>(emptyMaterial())
  const [materialDetail, setMaterialDetail] = useState<MaterialItem | null>(null)
  const [ossWords, setOssWords] = useState<string[]>([])
  const [ossMeta, setOssMeta] = useState({
    name: "Sensitive-lexicon",
    version: "OSS-SENSITIVE-LEXICON",
    license: "MIT",
  })
  const [dictSource, setDictSource] = useState<"custom" | "oss">("custom")
  const [newStyle, setNewStyle] = useState("")
  const timers = useRef<ReturnType<typeof setTimeout>[]>([])
  const runResult = useRef<{ task: Task; calls: AgentCall[]; message: string } | null>(null)
  const current =
    tasks.find((t) => t.id === activeId) ||
    tasks[0] || {
      id: "",
      title: "",
      author: "",
      intro: "",
      contents: "",
      status: "待处理" as Status,
      creator: "",
      time: "",
      styles: [],
      material: "",
      selected: -1,
      copy: "",
      reason: "",
      versions: [],
      candidates: [],
      batch: "",
      retries: 0,
      submitted: false,
    }
  const user = role === "编辑" ? "林晓" : role === "主编" ? "周明" : "王珂"
  const canEdit =
    role === "管理员" || (role === "编辑" && current.creator === user)
  const visibleTasks =
    role === "编辑" ? tasks.filter((t) => t.creator === user) : tasks
  const totalReview = tasks.filter((t) => t.status === "待审核").length

  useEffect(() => {
    if (!toast) return
    const timer = setTimeout(() => setToast(null), 4200)
    return () => clearTimeout(timer)
  }, [toast])
  useEffect(() => () => timers.current.forEach(clearTimeout), [])
  useEffect(() => {
    document.title = `${signedIn ? pageNames[page] : "登录"} · 墨舟 AI`
    document.documentElement.lang = "zh-CN"
  }, [page, signedIn])
  useEffect(() => {
    setResourceQuery("")
    setResourcePage(1)
    setTableState("normal")
  }, [page])
  useEffect(() => {
    if (!run) return
    const timer = setTimeout(() => {
      if (run.step < 3) {
        setRun({ ...run, step: run.step + 1 })
        return
      }
      const data = runResult.current
      if (!data || data.task.id !== run.id) {
        setRun({ ...run, step: 3 })
        return
      }
      setTasks((prev) => prev.map((t) => (t.id === data.task.id ? data.task : t)))
      setCalls((prev) => ({ ...prev, [data.task.id]: data.calls }))
      runResult.current = null
      setRun(null)
      if (data.task.status === "失败") notify(data.message, true)
      else {
        setTab(1)
        notify(data.message || "已生成 3 组候选文案，请选择一条继续。")
      }
    }, 700)
    return () => clearTimeout(timer)
  }, [run])

  function notify(text: string, error = false) {
    setToast({ text, error })
  }
  function log(action: string, object: string, result = "成功") {
    setAudit((prev) => [
      { user, role, action, object, time: now(), result },
      ...prev,
    ])
    if (api.getToken()) {
      api.writeAudit({ action, object, result }).catch(() => {})
    }
  }
  function denied(action = "越权访问", object = current.id, full = false) {
    log(action, object, "403 · 权限拒绝")
    notify("403 · 当前角色无此权限，已写入模拟审计日志。", true)
    if (full) setPage("forbidden")
  }
  function navigate(next: Page) {
    if (next === "review" && role === "编辑") {
      denied("访问审核工作台", "审核工作台", true)
      return
    }
    if (
      ["templates", "dictionary", "accounts", "audit"].includes(next) &&
      role !== "管理员"
    ) {
      denied("访问管理页面", pageNames[next], true)
      return
    }
    setPage(next)
    setListPage(1)
    setChecked([])
    if (next === "review") setStatus("待审核")
    else if (next === "tasks") setStatus("全部")
  }
  const roleAccount: Record<Role, { email: string; name: string }> = {
    编辑: { email: "linxiao@example.com", name: "林晓" },
    主编: { email: "zhouming@example.com", name: "周明" },
    管理员: { email: "wangke@example.com", name: "王珂" },
  }
  async function applyWorkspace(next: Role) {
    const boot = await api.bootstrap()
    setTasks(boot.tasks)
    setCalls(boot.calls)
    setDictionaries(boot.dictionaries)
    setTemplateVersions(boot.templates)
    setMaterials(boot.materials)
    setOssWords(boot.opensource.words)
    setOssMeta({
      name: boot.opensource.name,
      version: boot.opensource.version,
      license: boot.opensource.license,
    })
    setAccounts(boot.accounts)
    setAudit(boot.audit)
    setDictSource("custom")
    setDictVersion("DICT-V1")
    if (boot.tasks[0]) setActiveId(boot.tasks[0].id)
    setRole(next)
    setPage(next === "主编" ? "review" : "tasks")
    setStatus(next === "主编" ? "待审核" : "全部")
    setListPage(1)
    setCreator("全部创建人")
    setKeyword("")
  }
  async function switchRole(next: Role) {
    await api.login(roleAccount[next].email, "demo123456")
    await applyWorkspace(next)
    notify(`已切换为${next}：${roleAccount[next].name}`)
  }
  async function completeLogin(next: Role) {
    await api.login(roleAccount[next].email, "demo123456")
    await applyWorkspace(next)
    setSignedIn(true)
    notify(`欢迎回来，${roleAccount[next].name}。已进入${next}工作台。`)
  }
  function signOut() {
    log("退出登录", "工作空间")
    api.clearToken()
    setSignedIn(false)
    setModal(null)
    setNotificationOpen(false)
    setToast(null)
  }
  function patchTask(patch: Partial<Task>) {
    setTasks((prev) =>
      prev.map((t) =>
        t.id === activeId ? { ...t, ...patch, time: now() } : t,
      ),
    )
    const persist: Record<string, unknown> = {}
    ;(["title", "author", "intro", "styles", "material", "copy", "reason", "selected", "prompt"] as const).forEach(
      (key) => {
        if (key in patch) persist[key] = patch[key]
      },
    )
    if (Object.keys(persist).length && api.getToken()) {
      api.patchTask(activeId, persist).catch((error: ApiError) => notify(error.message, true))
    }
  }
  function openTask(task: Task, targetTab = 0) {
    if (role === "编辑" && task.creator !== user) {
      denied("查看他人任务", task.id, true)
      return
    }
    setActiveId(task.id)
    setTab(targetTab)
    setPage("detail")
    setScan(null)
    setScanText(task.copy)
    setReviewOpinion("")
    setOpinionError("")
  }
  function openForm(task?: Task) {
    if (role === "主编" || (task && role === "编辑" && task.creator !== user)) {
      denied("修改任务", task?.id || "新建任务", true)
      return
    }
    if (task && !["待处理", "退回", "失败"].includes(task.status)) {
      notify("该状态不可修改基础资料，请在人工微调中编辑文案。", true)
      return
    }
    setEditingId(task?.id || null)
    setForm(
      task
        ? {
            title: task.title,
            author: task.author,
            intro: task.intro,
            contents: task.contents || "",
            styles: [...task.styles],
          }
        : {
            title: "",
            author: "",
            intro: "",
            contents: "",
            styles: ["温暖治愈"],
          },
    )
    setErrors({})
    setPage("form")
  }
  async function saveForm(generate: boolean) {
    if (role === "主编")
      return denied("创建 / 修改任务", editingId || "新任务", true)
    const next: Record<string, string> = {}
    if (!form.title.trim()) next.title = "请输入书名"
    if (generate) {
      if (!form.author.trim()) next.author = "请输入作者"
      if (!form.intro.trim())
        next.intro = "请填写内容简介，不可在缺少简介时发起 AI"
      else if (form.intro.trim().length < 50)
        next.intro = `信息不足：简介至少需要 50 字，当前 ${form.intro.trim().length} 字。请补充核心情节、主题与人物，不会虚构书目信息。`
      if (!form.styles.length) next.styles = "请至少选择一个风格标签"
    }
    setErrors(next)
    if (Object.keys(next).length || savingForm) return
    setSavingForm(true)
    try {
      let task: Task
      if (editingId) {
        task = await api.patchTask(editingId, {
          title: form.title.trim(),
          author: form.author.trim(),
          intro: form.intro.trim(),
          contents: form.contents,
          styles: [...form.styles],
        })
        setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...task } : t)))
      } else {
        const created = await api.createTask({
          title: form.title.trim(),
          author: form.author.trim(),
          intro: form.intro.trim(),
          contents: form.contents,
          styles: [...form.styles],
          generate: false,
        })
        task = created.task
        setTasks((prev) => [task, ...prev])
        setCalls((prev) => ({ ...prev, [task.id]: created.calls }))
      }
      setActiveId(task.id)
      setEditingId(task.id)
      setMaterials((prev) => {
        const owned = prev.findIndex((item) => item.taskId === task.id)
        if (owned >= 0) {
          return prev.map((item, index) =>
            index === owned
              ? { ...item, title: task.title, content: task.intro, author: task.author }
              : item,
          )
        }
        if (!task.material) return prev
        return [
          {
            id: task.material,
            title: task.title,
            type: "书稿摘要",
            content: task.intro,
            source: "教学模拟资料 · 手工录入",
            version: "V1.0",
            taskId: task.id,
            author: task.author,
            chapter: "",
            excerpt: "",
          },
          ...prev,
        ]
      })
      if (generate) {
        setPage("detail")
        setTab(0)
        setScan(null)
        setScanText("")
        startGeneration(task)
      } else {
        notify("草稿已保存。只需书名即可保留，其余资料可稍后补全。")
      }
    } catch (error) {
      const err = error as ApiError
      if (err.fields) setErrors(err.fields)
      notify(err.message || "保存失败", true)
    } finally {
      setSavingForm(false)
    }
  }
  async function removeTask(task: Task) {
    if (role !== "编辑" || task.creator !== user)
      return denied("删除任务", task.id, true)
    if (task.status === "完成")
      return notify("已审核通过的任务不可删除。", true)
    if (!window.confirm(`删除「${task.title}」（${task.id}）？删除后不可恢复。`)) return
    try {
      const data = await api.deleteTask(task.id)
      if (run?.id === task.id) {
        runResult.current = null
        setRun(null)
      }
      setTasks((prev) => prev.filter((item) => item.id !== task.id))
      setCalls((prev) => {
        const next = { ...prev }
        delete next[task.id]
        return next
      })
      setMaterials((prev) => prev.filter((item) => !data.materials.includes(item.id)))
      setChecked((prev) => prev.filter((id) => id !== task.id))
      setModal(null)
      if (activeId === task.id && (page === "detail" || page === "form")) {
        setEditingId(null)
        setPage("tasks")
      }
      notify(`已删除 ${task.id}`)
    } catch (error) {
      notify((error as ApiError).message || "删除失败", true)
    }
  }
  async function startGeneration(task = current, retry = false) {
    if (role === "主编" || (role === "编辑" && task.creator !== user))
      return denied("发起 AI 处理", task.id)
    if (run) return notify("已有任务正在处理，请等待完成。", true)
    if (!["待处理", "退回", "待审核", "失败", "运行中"].includes(task.status))
      return notify("当前任务状态不支持发起生成。", true)
    if (
      task.intro.length < 50 ||
      !task.styles.length ||
      !task.title ||
      !task.author ||
      !task.material
    )
      return notify(
        "信息不足：请补充书名、作者、至少 50 字简介、风格及书稿数据 ID。",
        true,
      )
    if (retry && task.retries >= 2)
      return notify("已达到最大重试次数 R = 2，请检查资料或联系管理员。", true)
    if ((calls[task.id] || []).length + 4 > 12)
      return notify("已达到单任务调用次数上限 N = 12，请新建教学任务。", true)
    setActiveId(task.id)
    setPage("detail")
    setTab(0)
    setScan(null)
    setTasks((prev) =>
      prev.map((t) =>
        t.id === task.id
          ? { ...t, status: "运行中", submitted: false, selected: -1 }
          : t,
      ),
    )
    setRun({ id: task.id, step: 0, fail: failureMode })
    setModal(null)
    try {
      const data = await api.runTask(task.id, {
        retry,
        simulate_fail: failureMode,
        styles: task.styles,
        material: task.material,
        prompt: task.prompt || "",
      })
      runResult.current = data
    } catch (error) {
      setRun(null)
      notify((error as ApiError).message || "发起失败", true)
    }
  }
  async function runScan() {
    if (!canEdit) return denied("发起合规筛查")
    if (current.selected < 0)
      return notify("请先选定一组候选文案，再进行合规筛查。", true)
    if (!current.versions.length)
      return notify("请先完成 AI 生成并选择候选文案。", true)
    if (!scanText.trim()) return notify("请输入待检文本。", true)
    if ((calls[current.id] || []).length >= 12)
      return notify("已达到单任务调用次数上限 N = 12，请新建教学任务。", true)
    setScanning(true)
    setScan(null)
    try {
      const data = await api.scanTask(current.id, {
        text: scanText,
        rule_version: dictVersion,
        simulate_timeout: scanFailure,
      })
      setScan(data.scan)
      setTasks((prev) => prev.map((t) => (t.id === data.task.id ? data.task : t)))
      setCalls((prev) => ({ ...prev, [data.task.id]: data.calls }))
      notify(data.message, !!(data.scan.error || data.scan.hits.length))
    } catch (error) {
      notify((error as ApiError).message || "筛查失败", true)
    } finally {
      setScanning(false)
    }
  }
  async function submitCopy() {
    if (role !== "编辑" || current.creator !== user)
      return denied("人工微调提交")
    if (!["待处理", "退回"].includes(current.status))
      return notify("请先完成编辑与合规筛查，再确认提交。提交前状态不会变为待审核。", true)
    if (!current.copy.trim() || !current.reason.trim())
      return setErrors({
        copy: !current.copy.trim() ? "请输入提交文案" : "",
        reason: !current.reason.trim() ? "请填写采用理由" : "",
      })
    if (
      !scan ||
      scan.error ||
      scan.hits.length ||
      scan.text !== current.copy ||
      scan.version !== dictVersion
    )
      return notify("请对当前提交文案执行合规筛查，并取得通过结论。", true)
    try {
      const task = await api.submitTask(current.id, {
        copy: current.copy,
        reason: current.reason,
        rule_version: dictVersion,
      })
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
      setErrors({})
      notify("提交成功，已进入待审核。可切换主编角色进行审核。")
      setTab(4)
    } catch (error) {
      const err = error as ApiError
      if (err.fields) setErrors(err.fields)
      notify(err.message || "提交失败", true)
    }
  }
  async function reviewTask(approve: boolean) {
    if (!["主编", "管理员"].includes(role)) return denied("审核任务")
    if (current.status !== "待审核" || !current.submitted)
      return notify("仅可审核已人工确认提交的待审核任务。", true)
    if (!approve && !reviewOpinion.trim()) {
      setOpinionError("退回意见不能为空，请说明需要修改的内容。")
      return
    }
    try {
      const task = await api.reviewTask(current.id, {
        approve,
        opinion: reviewOpinion.trim(),
      })
      setTasks((prev) => prev.map((t) => (t.id === task.id ? task : t)))
      notify(approve ? "审核已通过，任务已完成。" : "任务已退回，全部历史版本均已保留。")
      setOpinionError("")
    } catch (error) {
      const err = error as ApiError
      if (err.fields?.opinion) setOpinionError(err.fields.opinion)
      notify(err.message || "审核失败", true)
    }
  }
  function exportTasks() {
    const rows = [
      ["任务ID", "书名", "作者", "状态", "创建人", "更新时间"],
      ...filtered.map((t) => [
        t.id,
        t.title,
        t.author,
        t.status,
        t.creator,
        t.time,
      ]),
    ]
    const csv =
      "\uFEFF" +
      rows
        .map((row) =>
          row.map((cell) => `"${cell.replace(/"/g, '""')}"`).join(","),
        )
        .join("\n")
    const url = URL.createObjectURL(
      new Blob([csv], { type: "text/csv;charset=utf-8;" }),
    )
    const link = document.createElement("a")
    link.href = url
    link.download = "墨舟AI-任务列表.csv"
    link.click()
    URL.revokeObjectURL(url)
    notify(`已导出 ${filtered.length} 条教学模拟任务。`)
  }
  const listSource =
    page === "review" ? visibleTasks.filter((t) => t.submitted) : visibleTasks
  const filtered = listSource.filter(
    (t) =>
      (status === "全部" || t.status === status) &&
      (creator === "全部创建人" || t.creator === creator) &&
      (dateFilter !== "今天" || t.time.slice(0, 10) === now().slice(0, 10)) &&
      `${t.id}${t.title}${t.author}`
        .toLowerCase()
        .includes(keyword.toLowerCase()),
  )
  const pageTasks = filtered.slice(
    (listPage - 1) * pageSize,
    listPage * pageSize,
  )
  function resetFilters() {
    setStatus(page === "review" ? "待审核" : "全部")
    setKeyword("")
    setCreator("全部创建人")
    setDateFilter("近 30 天")
    setListPage(1)
    setTableState("normal")
  }
  function changeStatus(value: string) {
    setStatus(value)
    setListPage(1)
    setChecked([])
  }

  function pageHeader(title: string, description: string, actions?: ReactNode) {
    return (
      <div className="page-heading">
        <div>
          <Heading level={1}>{title}</Heading>
          <p>{description}</p>
        </div>
        <div className="actions">{actions}</div>
      </div>
    )
  }
  function pagination(
    count: number,
    currentPage: number,
    onChange: (page: number) => void,
    size = pageSize,
  ) {
    const pages = Math.max(1, Math.ceil(count / size))
    return (
      <div className="pagination">
        <span>
          共 <strong>{count}</strong> 条记录
          {checked.length > 0 && (
            <span className="selected-count"> · 已选 {checked.length} 项</span>
          )}
        </span>
        <div className="pagination-controls">
          <Select
            aria-label="每页显示条数"
            value={size}
            onChange={(e) => {
              setPageSize(+e.target.value)
              onChange(1)
            }}
          >
            <option value={8}>8 条 / 页</option>
            <option value={16}>16 条 / 页</option>
            <option value={24}>24 条 / 页</option>
          </Select>
          <Button
            variant="ghost"
            icon="back"
            aria-label="上一页"
            disabled={currentPage <= 1}
            onClick={() => onChange(currentPage - 1)}
          />
          {Array.from({ length: pages }, (_, i) => (
            <Button
              key={i}
              className={`page-number ${
                currentPage === i + 1 ? "current" : ""
              }`}
              variant="ghost"
              onClick={() => onChange(i + 1)}
            >
              {i + 1}
            </Button>
          ))}
          <Button
            variant="ghost"
            icon="chevron"
            aria-label="下一页"
            disabled={currentPage >= pages}
            onClick={() => onChange(currentPage + 1)}
          />
        </div>
      </div>
    )
  }

  function renderTaskList() {
    const isReview = page === "review"
    return (
      <>
        {pageHeader(
          isReview ? "审核工作台" : "任务管理",
          isReview
            ? "让每一次表达都经得起审视，待审核文案尽在此处。"
            : "从灵感到定稿，让每一份好文案都有迹可循。",
          <>
            <Button icon="download" onClick={exportTasks}>
              导出任务
            </Button>
            {!isReview && (
              <Button
                icon="plus"
                variant="primary"
                disabled={role === "主编"}
                title={
                  role === "主编" ? "主编不可创建任务" : "创建新的文案任务"
                }
                onClick={() => openForm()}
              >
                新建任务
              </Button>
            )}
          </>,
        )}
        {!isReview && (
          <div className="welcome-banner">
            <div className="banner-icon">
              <Icon name="sparkles" size={25} />
            </div>
            <div>
              <Heading>让灵感更高效，让表达更合规</Heading>
              <p>AI 辅助创作，本地规则把关。把更多时间留给真正的好内容。</p>
            </div>
            <div className="banner-workflow">
              <span>
                <Icon name="book" size={17} />
                书稿资料
              </span>
              <i />
              <span>
                <Icon name="sparkles" size={17} />
                智能生成
              </span>
              <i />
              <span>
                <Icon name="shield" size={17} />
                合规保障
              </span>
            </div>
            <span className="banner-orbit orbit-one" />
            <span className="banner-orbit orbit-two" />
          </div>
        )}
        <div className="stats-grid">
          {[
            {
              label: "全部任务",
              value: visibleTasks.length,
              icon: "tasks" as IconName,
              tone: "indigo",
              desc: "本周新增",
              detail: "+3",
              filter: "全部",
            },
            {
              label: "运行中",
              value: visibleTasks.filter((t) => t.status === "运行中").length,
              icon: "sparkles" as IconName,
              tone: "blue",
              desc: "AI 正在为你创作",
              detail: "",
              filter: "运行中",
            },
            {
              label: "待审核",
              value: visibleTasks.filter((t) => t.status === "待审核").length,
              icon: "review" as IconName,
              tone: "amber",
              desc: "等待主编确认",
              detail: "",
              filter: "待审核",
            },
            {
              label: "已完成",
              value: visibleTasks.filter((t) => t.status === "完成").length,
              icon: "shield" as IconName,
              tone: "green",
              desc: "已通过合规审核",
              detail: "",
              filter: "完成",
            },
          ].map((stat) => (
            <div
              className={`stat-card stat-${stat.tone}`}
              key={stat.label}
              role="button"
              tabIndex={0}
              onClick={() => changeStatus(stat.filter)}
              onKeyDown={(e) => e.key === "Enter" && changeStatus(stat.filter)}
            >
              <div className="stat-top">
                <span>{stat.label}</span>
                <span className="stat-icon">
                  <Icon name={stat.icon} size={19} />
                </span>
              </div>
              <div className="stat-number">
                {stat.value}
                <span>项</span>
              </div>
              <div className="stat-description">
                {stat.detail && (
                  <span className="trend">
                    <Icon name="arrow" size={12} />
                    {stat.detail}
                  </span>
                )}
                {stat.desc}
                {stat.filter === "运行中" && <span className="live-dot" />}
              </div>
            </div>
          ))}
        </div>
        <section className="panel task-panel">
          <div className="table-tabs">
            <div className="tab-list">
              {["全部", ...statuses].map((s) => (
                <Button
                  key={s}
                  variant="ghost"
                  className={`table-tab ${status === s ? "active" : ""}`}
                  onClick={() => changeStatus(s)}
                >
                  {s === "全部" ? "全部任务" : s === "完成" ? "已完成" : s}
                  <span>
                    {s === "全部"
                      ? listSource.length
                      : listSource.filter((t) => t.status === s).length}
                  </span>
                </Button>
              ))}
            </div>
            <div className="table-options">
              <Button
                variant="ghost"
                icon="refresh"
                aria-label="刷新列表"
                title="刷新列表"
                onClick={() => {
                  setTableState("loading")
                  const timer = setTimeout(() => {
                    setTableState("normal")
                    notify("任务列表已更新。")
                  }, 700)
                  timers.current.push(timer)
                }}
              />
              <Button
                variant="ghost"
                icon="more"
                aria-label="列表展示状态"
                title="切换空、加载或错误状态"
                onClick={() => setModal("table-state")}
              />
            </div>
          </div>
          <div className="filter-row">
            <div className="search-input">
              <Icon name="search" size={17} />
              <Input
                aria-label="搜索任务"
                placeholder="搜索任务 ID、书名或作者"
                value={keyword}
                onChange={(e) => {
                  setKeyword(e.target.value)
                  setListPage(1)
                }}
              />
              <kbd>⌘ K</kbd>
            </div>
            <Select
              aria-label="任务状态"
              value={status}
              onChange={(e) => changeStatus(e.target.value)}
            >
              <option value="全部">全部状态</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
            <Select
              aria-label="创建人"
              value={creator}
              onChange={(e) => {
                setCreator(e.target.value)
                setListPage(1)
              }}
            >
              <option>全部创建人</option>
              <option>林晓</option>
              <option>陈妍</option>
              <option>王珂</option>
            </Select>
            <div className="date-filter">
              <Icon name="calendar" size={15} />
              <Select
                aria-label="时间范围"
                value={dateFilter}
                onChange={(e) => {
                  setDateFilter(e.target.value)
                  setListPage(1)
                }}
              >
                <option>近 30 天</option>
                <option>全部时间</option>
                <option>今天</option>
              </Select>
            </div>
            <Button variant="text" onClick={resetFilters}>
              重置
            </Button>
            <span className="filter-spacer" />
            <Button
              icon="filter"
              variant="ghost"
              title="高级筛选"
              onClick={() => setModal("filters")}
            >
              筛选
            </Button>
          </div>
          {tableState !== "normal" ? (
            <EmptyState
              type={tableState === "empty" ? "empty" : tableState}
              onAction={
                tableState !== "loading"
                  ? () => {
                      resetFilters()
                    }
                  : undefined
              }
            />
          ) : !pageTasks.length ? (
            <EmptyState
              title="未找到匹配的任务"
              description="试试其他关键词，或重置筛选条件。"
              onAction={resetFilters}
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table task-table">
                <thead>
                  <tr>
                    <th className="checkbox-cell">
                      <Input
                        type="checkbox"
                        aria-label="选择本页全部任务"
                        checked={
                          pageTasks.length > 0 &&
                          pageTasks.every((t) => checked.includes(t.id))
                        }
                        onChange={(e) =>
                          setChecked(
                            e.target.checked ? pageTasks.map((t) => t.id) : [],
                          )
                        }
                      />
                    </th>
                    <th>任务 ID</th>
                    <th>书名</th>
                    <th>{isReview ? "编辑" : "作者"}</th>
                    <th>状态</th>
                    <th>{isReview ? "版本数" : "创建人"}</th>
                    <th>
                      {isReview ? "提交时间" : "更新时间"}
                      <Icon name="down" size={11} />
                    </th>
                    <th className="operations-head">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {pageTasks.map((task, i) => (
                    <tr
                      key={task.id}
                      className={
                        checked.includes(task.id) ? "row-selected" : ""
                      }
                    >
                      <td className="checkbox-cell">
                        <Input
                          type="checkbox"
                          aria-label={`选择 ${task.id}`}
                          checked={checked.includes(task.id)}
                          onChange={(e) =>
                            setChecked((prev) =>
                              e.target.checked
                                ? [...prev, task.id]
                                : prev.filter((id) => id !== task.id),
                            )
                          }
                        />
                      </td>
                      <td>
                        <span
                          className="task-id"
                          onClick={() => openTask(task)}
                        >
                          {task.id}
                        </span>
                      </td>
                      <td>
                        <div className="book-cell">
                          <span className={`book-cover cover-${i % 8}`}>
                            <span>{task.title.slice(0, 2)}</span>
                            <i />
                          </span>
                          <span
                            className="book-title"
                            onClick={() => openTask(task)}
                          >
                            {task.title}
                          </span>
                        </div>
                      </td>
                      <td className="muted-cell">
                        {isReview ? task.creator : task.author}
                      </td>
                      <td>
                        <Badge status={task.status} />
                        {task.status === "退回" && rejectionReason(task) && (
                          <div className="muted return-reason">{rejectionReason(task)}</div>
                        )}
                      </td>
                      <td>
                        {isReview ? (
                          <span className="muted-cell">
                            {task.versions.length} 个版本
                          </span>
                        ) : (
                          <span className="creator-cell">
                            <Avatar name={task.creator} small />
                            {task.creator}
                            <span className="self-label">
                              {task.creator === user ? "我" : ""}
                            </span>
                          </span>
                        )}
                      </td>
                      <td>
                        <span className="time-cell">{task.time}</span>
                      </td>
                      <td>
                        <div className="row-actions">
                          <Button
                            variant="text"
                            onClick={() =>
                              openTask(task, isReview && task.status === "待审核" ? 2 : 0)
                            }
                          >
                            {isReview
                              ? task.status === "待审核"
                                ? "审核"
                                : "查看"
                              : "查看"}
                          </Button>
                          {!isReview && (
                            <>
                              {task.status === "待处理" ? (
                                <Button
                                  variant="text"
                                  disabled={role === "主编"}
                                  title={
                                    role === "主编"
                                      ? "主编不可修改任务"
                                      : "编辑任务资料"
                                  }
                                  onClick={() => openForm(task)}
                                >
                                  修改
                                </Button>
                              ) : task.status === "失败" ? (
                                <Button
                                  variant="text"
                                  disabled={role === "主编"}
                                  onClick={() => {
                                    setActiveId(task.id)
                                    setModal("retry")
                                  }}
                                >
                                  重试
                                </Button>
                              ) : task.status === "退回" ? (
                                <Button
                                  variant="text"
                                  disabled={role !== "编辑"}
                                  title="仅编辑可微调提交"
                                  onClick={() => openTask(task, 2)}
                                >
                                  微调
                                </Button>
                              ) : task.status === "运行中" ? (
                                <span className="row-action-placeholder">
                                  处理中
                                </span>
                              ) : (
                                <Button
                                  variant="ghost"
                                  icon="more"
                                  aria-label={`${task.id} 更多操作`}
                                  onClick={() => {
                                    setActiveId(task.id)
                                    setModal("task-actions")
                                  }}
                                />
                              )}
                              {role === "编辑" && task.creator === user && task.status !== "完成" && (
                                <Button variant="text" onClick={() => removeTask(task)}>
                                  删除
                                </Button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {pagination(filtered.length, listPage, setListPage)}
        </section>
        <section className="process-panel">
          <div className="process-title">
            <span className="process-title-icon">
              <Icon name="grid" size={17} />
            </span>
            <Heading level={3}>创作流程</Heading>
            <span>每一步都有记录，每一版都可追溯</span>
            <Button variant="text" onClick={() => navigate("help")}>
              了解流程
              <Icon name="chevron" size={13} />
            </Button>
          </div>
          <div className="process-steps">
            {[
              { icon: "tasks", label: "创建任务", sub: "录入书目信息" },
              { icon: "folder", label: "资料读取", sub: "关联书稿与模板" },
              { icon: "sparkles", label: "AI 生成", sub: "3 组候选文案" },
              { icon: "shield", label: "合规筛查", sub: "本地规则校验" },
              { icon: "edit", label: "人工确认", sub: "微调并保留版本" },
              { icon: "review", label: "主编审核", sub: "通过或退回" },
            ].map((step, i) => (
              <div className="process-step-wrap" key={step.label}>
                <div className="process-step">
                  <span className={`step-icon ${i === 2 ? "highlight" : ""}`}>
                    <Icon name={step.icon as IconName} size={19} />
                  </span>
                  <div>
                    <strong>{step.label}</strong>
                    <span>{step.sub}</span>
                  </div>
                </div>
                {i < 5 && (
                  <Icon name="chevron" size={14} className="step-arrow" />
                )}
              </div>
            ))}
          </div>
        </section>
        <div className="context-note">
          <Icon name="shield" size={13} />
          <span>所有业务结果与工具调用记录共用任务 ID，支持全流程追溯。</span>
          <span className="context-note-right">
            教学模拟数据 · 不连接真实模型或后端
          </span>
        </div>
      </>
    )
  }

  function renderForm() {
    return (
      <>
        <Button
          variant="text"
          icon="back"
          className="back-button"
          onClick={() => navigate("tasks")}
        >
          返回任务列表
        </Button>
        {pageHeader(
          editingId ? "编辑任务" : "新建文案任务",
          editingId
            ? `草稿 ${editingId} 已在任务列表中。可继续补全书名以外的资料，再发起 AI。`
            : "完善书稿信息。保存草稿只需书名，发起 AI 时再校验其余必填项。",
          <Badge tone="indigo" dot={false}>
            FR-01 · 任务管理
          </Badge>,
        )}
        <div className="form-layout">
          <section className="panel form-panel">
            <div className="section-heading">
              <Heading>基础信息</Heading>
              <span>
                标有 <em>*</em> 的字段为发起 AI 时必填项
              </span>
            </div>
            <div className="form-grid">
              <Field label="书名" required error={errors.title}>
                <Input
                  placeholder="例如：城市边缘的灯"
                  value={form.title}
                  onChange={(e) => setForm({ ...form, title: e.target.value })}
                />
              </Field>
              <Field label="作者" required error={errors.author}>
                <Input
                  placeholder="例如：李明"
                  value={form.author}
                  onChange={(e) => setForm({ ...form, author: e.target.value })}
                />
              </Field>
              <div className="full-span">
                <Field
                  label="内容简介"
                  required
                  error={errors.intro}
                  hint={
                    <span className="spread">
                      <span>至少 50 字，请说明核心内容、人物及主题。</span>
                      <span>{form.intro.length} 字</span>
                    </span>
                  }
                >
                  <Textarea
                    rows={7}
                    placeholder="本书讲述……请提供真实书稿信息，AI 不会补造缺失的书目信息。"
                    value={form.intro}
                    onChange={(e) =>
                      setForm({ ...form, intro: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="full-span">
                <Field label="目录" hint="选填。补充章节结构有助于提炼内容。">
                  <Textarea
                    rows={4}
                    placeholder="第一章：……&#10;第二章：……"
                    value={form.contents}
                    onChange={(e) =>
                      setForm({ ...form, contents: e.target.value })
                    }
                  />
                </Field>
              </div>
              <div className="full-span">
                <Field
                  label="风格标签"
                  required
                  error={errors.styles}
                  hint="支持多选，生成结果会引用所选模板的具体版本。"
                >
                  <div className="style-options">
                    {availableStyles.map((s) => (
                      <Button
                        key={s}
                        className={
                          form.styles.includes(s) ? "style-selected" : ""
                        }
                        icon={form.styles.includes(s) ? "check" : "plus"}
                        onClick={() =>
                          setForm({
                            ...form,
                            styles: form.styles.includes(s)
                              ? form.styles.filter((x) => x !== s)
                              : [...form.styles, s],
                          })
                        }
                      >
                        {s}
                      </Button>
                    ))}
                  </div>
                </Field>
              </div>
            </div>
            <div className="form-footer">
              <span>
                <Icon name="lock" size={14} />
                保存草稿只要求书名；发起 AI 时才校验作者、简介和风格
              </span>
              <div className="actions">
                <Button disabled={savingForm} onClick={() => saveForm(false)}>
                  {savingForm ? "正在保存…" : "保存草稿"}
                </Button>
                <Button
                  variant="primary"
                  icon="sparkles"
                  disabled={savingForm}
                  onClick={() => saveForm(true)}
                >
                  发起 AI 处理
                </Button>
              </div>
            </div>
          </section>
          <aside className="form-aside">
            <section className="panel aside-card">
              <span className="aside-icon">
                <Icon name="sparkles" size={24} />
              </span>
              <Heading>好文案，从好资料开始</Heading>
              <p>完整的输入，才能让每一次生成更接近你的期待。</p>
              <div className="tips-list">
                <span>
                  <Icon name="check" />
                  准确的书名与作者
                </span>
                <span>
                  <Icon name="check" />
                  不少于 50 字的书稿简介
                </span>
                <span>
                  <Icon name="check" />
                  至少一种目标风格
                </span>
              </div>
              <Button
                variant="text"
                icon="file"
                onClick={() =>
                  setForm({
                    title: "城市边缘的灯",
                    author: "李明",
                    intro,
                    contents:
                      "第一章：灯亮的时候\n第二章：深夜书店\n第三章：每个普通的你",
                    styles: ["温暖治愈", "文学叙事"],
                  })
                }
              >
                填入教学示例
              </Button>
            </section>
            <Notice>
              <strong>验收注释 · FR-01 / FR-03</strong>
              <p>
                AC-01-1 缺简介不可发起。
                <br />
                AC-03-3 信息不足时明确列出缺失项，不虚构内容。
              </p>
            </Notice>
          </aside>
        </div>
      </>
    )
  }

  function renderDetail() {
    const candidates = current.candidates || []
    const taskCalls = calls[current.id] || []
    const reviewing = role === "主编" || role === "管理员"
    return (
      <>
        <Button
          variant="text"
          icon="back"
          className="back-button"
          onClick={() => navigate(role === "主编" ? "review" : "tasks")}
        >
          返回{role === "主编" ? "审核工作台" : "任务列表"}
        </Button>
        {pageHeader(
          current.title,
          `${current.id}　/　作者：${current.author}　/　创建人：${current.creator}　/　更新于 ${current.time}`,
          <>
            <Badge status={current.status} />
            {role === "编辑" && current.creator === user && current.status !== "完成" && (
              <Button onClick={() => removeTask(current)}>删除任务</Button>
            )}
            <Button icon="history" onClick={() => setTab(5)}>
              执行记录
            </Button>
          </>,
        )}
        {current.status === "退回" && rejectionReason(current) && (
          <Notice tone="warning" icon="alert">
            <strong>退回原因</strong>
            <p>{rejectionReason(current)}</p>
          </Notice>
        )}
        <div className="detail-stepper">
          {["资料与生成", "选择候选", "人工微调", "合规筛查", "审核与版本"].map(
            (s, i) => (
              <div key={s} className={tab >= i ? "stepper-active" : ""}>
                <span>{i + 1}</span>
                {s}
                {i < 4 && <i />}
              </div>
            ),
          )}
        </div>
        <div className="panel detail-panel">
          <div className="detail-tabs">
            {detailTabs.map((s, i) => (
              <Button
                variant="ghost"
                key={s}
                className={tab === i ? "active" : ""}
                onClick={() => setTab(i)}
              >
                {s}
                {i === 4 && <span>{current.versions.length}</span>}
              </Button>
            ))}
          </div>
          <div className="detail-body">
            {tab === 0 && (
              <div className="generation-grid">
                <section>
                  <div className="section-heading">
                    <Heading>关联书稿资料</Heading>
                    <Badge dot={false}>模拟数据</Badge>
                  </div>
                  <div className="material-card">
                    <div className="material-icon">
                      <Icon name="file" size={25} />
                    </div>
                    <div>
                      <Heading level={3}>
                        {current.title} ·{" "}
                        {materials.find((item) => item.id === current.material)?.type ||
                          "书稿摘要"}
                      </Heading>
                      <span className="mono">{current.material}</span>
                    </div>
                    <Badge status="完成">已关联</Badge>
                  </div>
                  <dl className="metadata">
                    <div>
                      <dt>数据类型</dt>
                      <dd>
                        {materials.find((item) => item.id === current.material)?.type ||
                          "书稿摘要"}
                      </dd>
                    </div>
                    <div>
                      <dt>资料来源</dt>
                      <dd>
                        {materials.find((item) => item.id === current.material)?.source ||
                          "—"}
                      </dd>
                    </div>
                    <div>
                      <dt>资料版本</dt>
                      <dd>
                        {materials.find((item) => item.id === current.material)?.version ||
                          "V1.0"}
                      </dd>
                    </div>
                    <div>
                      <dt>关联任务</dt>
                      <dd className="mono">{current.id}</dd>
                    </div>
                  </dl>
                  <Heading level={3}>内容预览</Heading>
                  <p className="manuscript-preview">
                    {materials.find((item) => item.id === current.material)?.content ||
                      current.intro ||
                      "暂无简介，请先完善任务资料。"}
                  </p>
                  {materials.find((item) => item.id === current.material)?.excerpt && (
                    <>
                      <Heading level={3}>精选片段</Heading>
                      <p className="manuscript-preview">
                        {materials.find((item) => item.id === current.material)?.excerpt}
                      </p>
                    </>
                  )}
                  <Button
                    icon="external"
                    variant="text"
                    onClick={() => {
                      const found = materials.find((item) => item.id === current.material)
                      if (!found) {
                        notify("未找到关联资料", true)
                        return
                      }
                      setMaterialDetail(found)
                      setModal("material")
                    }}
                  >
                    查看资料详情
                  </Button>
                </section>
                <section className="generation-controls">
                  <div className="section-heading">
                    <Heading>AI 文案生成</Heading>
                    <span>
                      <Icon name="sparkles" size={15} />
                      Agent 工作流
                    </span>
                  </div>
                  <Field label="书稿数据 ID" required>
                    <Select
                      value={current.material}
                      disabled={!canEdit || current.status === "运行中"}
                      onChange={(e) => {
                        const found = materials.find((item) => item.id === e.target.value)
                        patchTask({
                          material: e.target.value,
                          ...(found ? { title: found.title } : {}),
                        })
                      }}
                    >
                      {materials.map((item) => (
                        <option key={item.id} value={item.id}>
                          {item.id} · {item.title}
                        </option>
                      ))}
                      {current.material &&
                        !materials.some((item) => item.id === current.material) && (
                          <option value={current.material}>{current.material}</option>
                        )}
                    </Select>
                  </Field>
                  <Field label="目标风格" required>
                    <div className="style-options">
                      {availableStyles.map((s) => (
                        <Button
                          key={s}
                          disabled={!canEdit || current.status === "运行中"}
                          className={
                            current.styles.includes(s) ? "style-selected" : ""
                          }
                          icon={current.styles.includes(s) ? "check" : "plus"}
                          onClick={() =>
                            patchTask({
                              styles: current.styles.includes(s)
                                ? current.styles.filter((x) => x !== s)
                                : [...current.styles, s],
                            })
                          }
                        >
                          {s}
                        </Button>
                      ))}
                    </div>
                  </Field>
                  <Field
                    label="生成提示"
                    hint="选填。可写下希望强调的场景、语气或避免的说法，生成时会一并交给 Agent。"
                  >
                    <Textarea
                      rows={3}
                      placeholder="例如：突出深夜书店与读者相遇，语气克制，不要写成促销口号。"
                      value={current.prompt || ""}
                      disabled={!canEdit || current.status === "运行中"}
                      onChange={(e) => {
                        const value = e.target.value
                        setTasks((prev) =>
                          prev.map((item) =>
                            item.id === current.id ? { ...item, prompt: value } : item,
                          ),
                        )
                      }}
                      onBlur={(e) => {
                        if (!canEdit) return
                        patchTask({ prompt: e.target.value })
                      }}
                    />
                  </Field>
                  {run?.id === current.id ? (
                    <div className="run-progress">
                      <div className="spread">
                        <strong>
                          <Icon name="refresh" className="spin" size={16} />
                          Agent 正在执行
                        </strong>
                        <span>{(run.step + 1) * 25}%</span>
                      </div>
                      <progress max={4} value={run.step + 1} />
                      {[
                        "读取书稿资料",
                        "读取风格模板",
                        "校验信息完整性",
                        "生成 3 组候选文案",
                      ].map((s, i) => (
                        <div
                          className={`run-step ${
                            i <= run.step ? "is-running" : ""
                          }`}
                          key={s}
                        >
                          <Icon
                            name={
                              i < run.step
                                ? "check"
                                : i === run.step
                                  ? "refresh"
                                  : "clock"
                            }
                            size={14}
                            className={i === run.step ? "spin" : ""}
                          />
                          {s}
                          <span>
                            {i < run.step
                              ? "完成"
                              : i === run.step
                                ? "执行中"
                                : "待执行"}
                          </span>
                        </div>
                      ))}
                    </div>
                  ) : current.status === "失败" ? (
                    <>
                      <Notice tone="error" icon="alert">
                        <strong>
                          {taskCalls.find((c) => c.status === "失败")?.error ||
                            "E-MODEL-01"}{" "}
                          · 工具执行失败
                        </strong>
                        <p>
                          请求未完成，任务结果不判定为通过。可重试{" "}
                          {2 - current.retries} 次，人工版本不会被覆盖。
                        </p>
                      </Notice>
                      <Button
                        variant="primary"
                        icon="refresh"
                        disabled={!canEdit || current.retries >= 2}
                        onClick={() => setModal("retry")}
                      >
                        重试任务
                      </Button>
                    </>
                  ) : (
                    <>
                      <Notice>
                        <strong>仅依据已关联资料生成</strong>
                        <p>
                          读取书稿与风格模板 → 检查信息充分性 → 生成 3
                          组候选文案。信息缺失时停止，不编造内容。
                        </p>
                      </Notice>
                      <label className="check-label">
                        <Input
                          type="checkbox"
                          checked={failureMode}
                          disabled={!canEdit}
                          onChange={(e) => setFailureMode(e.target.checked)}
                        />
                        演示模型超时失败（E-MODEL-01）
                      </label>
                      <Button
                        variant="primary"
                        icon="sparkles"
                        disabled={!canEdit || current.status === "完成"}
                        title={!canEdit ? "当前角色不可发起 AI" : ""}
                        onClick={() => startGeneration()}
                      >
                        {current.versions.length
                          ? "重新生成 3 组候选"
                          : "发起 AI 处理"}
                      </Button>
                    </>
                  )}
                  <div className="runtime-limits">
                    <Icon name="info" size={14} />
                    调用上限 N = 12 · 超时 T = 30 秒 · 重试 R ≤ 2
                  </div>
                </section>
              </div>
            )}
            {tab === 1 && (
              <>
                <div className="section-heading">
                  <div>
                    <Heading>选择最合适的表达</Heading>
                    <p>每批严格生成 3 组候选，请选定一条后进行合规筛查。</p>
                  </div>
                  <Badge dot={false} tone="indigo">
                    {current.batch}
                  </Badge>
                </div>
                {current.versions.length === 0 ? (
                  <EmptyState
                    title="候选文案尚未生成"
                    description="请先在「资料与生成」中发起 AI 处理。"
                  />
                ) : (
                  <>
                    <div className="candidate-grid">
                      {candidates.map((c, i) => (
                        <section
                          className={`candidate-card ${
                            current.selected === i ? "candidate-selected" : ""
                          }`}
                          key={i}
                        >
                          <div className="spread">
                            <span className="candidate-index">
                              方案 0{i + 1}
                            </span>
                            <Badge
                              tone={["indigo", "green", "purple"][i]}
                              dot={false}
                            >
                              {c.label}
                            </Badge>
                          </div>
                          <span className="candidate-book">《{c.title}》</span>
                          <Heading>{c.headline}</Heading>
                          <p className="candidate-copy">{c.body}</p>
                          <div className="candidate-points">
                            <span>
                              <Icon name="file" size={13} />
                              内容提炼依据
                            </span>
                            {c.points.map((p) => (
                              <p key={p}>• {p}</p>
                            ))}
                          </div>
                          <span className="candidate-batch">
                            {current.batch} · {current.material} · TPL-001@V1.2
                          </span>
                          <Button
                            variant={
                              current.selected === i ? "primary" : "secondary"
                            }
                            icon={current.selected === i ? "check" : undefined}
                            disabled={
                              !canEdit ||
                              ["完成", "运行中"].includes(current.status)
                            }
                            onClick={async () => {
                              try {
                                const task = await api.selectCandidate(current.id, i)
                                setTasks((prev) =>
                                  prev.map((t) => (t.id === task.id ? task : t)),
                                )
                                setScanText(task.copy)
                                setScan(null)
                                notify(`已选定方案 0${i + 1}。`)
                              } catch (error) {
                                notify((error as ApiError).message || "选定失败", true)
                              }
                            }}
                          >
                            {current.selected === i ? "已选定此条" : "选定此条"}
                          </Button>
                        </section>
                      ))}
                    </div>
                    <div className="section-bottom">
                      <span>
                        <Icon name="info" size={14} />
                        候选结果用于教学演示，不代表真实模型输出。
                      </span>
                      <Button
                        variant="primary"
                        icon="arrow"
                        disabled={current.selected < 0}
                        onClick={() => setTab(2)}
                      >
                        下一步：人工微调
                      </Button>
                    </div>
                  </>
                )}
              </>
            )}
            {tab === 3 && (
              <>
                <div className="section-heading">
                  <div>
                    <Heading>敏感词合规筛查</Heading>
                    <p>由本地规则工具执行词表匹配，大模型不参与合规判定。</p>
                  </div>
                  <Badge tone="amber" dot={false}>
                    模拟数据，仅用于教学演示
                  </Badge>
                </div>
                <div className="scan-layout">
                  <div>
                    <Field label="待检文本" required>
                      <Textarea
                        rows={8}
                        value={scanText}
                        disabled={!canEdit || current.status === "完成"}
                        onChange={(e) => {
                          setScanText(e.target.value)
                          setScan(null)
                        }}
                      />
                    </Field>
                    <div className="scan-controls">
                      <Field label="词库版本">
                        <Select
                          aria-label="词库版本"
                          value={dictVersion}
                          disabled={!canEdit}
                          onChange={(e) => {
                            setDictVersion(e.target.value)
                            setScan(null)
                          }}
                        >
                          <option value={ossMeta.version}>
                            {ossMeta.version}（开源 · {ossMeta.name}）
                          </option>
                          {Object.keys(dictionaries).map((version) => (
                            <option key={version}>{version}</option>
                          ))}
                          <option value="DICT-V0">
                            DICT-V0（不存在 · 异常演示）
                          </option>
                        </Select>
                      </Field>
                      <Button
                        variant="primary"
                        icon={scanning ? "refresh" : "shield"}
                        disabled={
                          scanning || !canEdit || current.status === "完成"
                        }
                        onClick={runScan}
                      >
                        {scanning ? "筛查中…" : "开始规则筛查"}
                      </Button>
                    </div>
                    <label className="check-label">
                      <Input
                        type="checkbox"
                        checked={scanFailure}
                        disabled={!canEdit}
                        onChange={(e) => setScanFailure(e.target.checked)}
                      />
                      模拟本地规则工具超时（E-TOOL-01）
                    </label>
                  </div>
                  <div className="scan-help">
                    <Icon name="shield" size={30} />
                    <Heading level={3}>可解释的规则判断</Heading>
                    <p>
                      自定义 DICT-V1：最佳、第一、绝对
                      <br />
                      自定义 DICT-V2：另含“治愈”
                      <br />
                      开源 {ossMeta.version}：{ossMeta.name} 广告类词表（{ossMeta.license}）
                    </p>
                    <p>
                      匹配方式：词表精确匹配
                      <br />
                      字符位置从 1 开始，包含末位。
                    </p>
                    <Button
                      variant="text"
                      onClick={() => {
                        setScanText(
                          dictVersion.startsWith("OSS")
                            ? current.copy + "\n详情请点击进入本店，低价出售。"
                            : current.copy + "\n年度最佳治愈故事，值得阅读。",
                        )
                        setScan(null)
                      }}
                    >
                      填入命中词演示文本
                    </Button>
                  </div>
                </div>
                {scanning ? (
                  <EmptyState
                    type="loading"
                    title="本地规则工具执行中"
                    description="正在匹配模拟敏感词库，请稍候。"
                  />
                ) : (
                  scan && (
                    <div className="scan-results">
                      {scan.error ? (
                        <Notice tone="error" icon="alert">
                          <strong>
                            {scan.error} ·{" "}
                            {scan.error === "E-DATA-01"
                              ? "词库版本不存在"
                              : "本地规则工具超时"}
                          </strong>
                          <p>
                            未取得有效筛查结果，不显示“通过”。请切换有效版本或关闭异常模拟后重试。
                          </p>
                        </Notice>
                      ) : (
                        <>
                          <Notice
                            tone={scan.hits.length ? "warning" : "success"}
                            icon={scan.hits.length ? "alert" : "check"}
                          >
                            <strong>
                              {scan.hits.length
                                ? `发现 ${scan.hits.length} 处敏感词 · 不通过`
                                : "规则筛查通过 · 未发现敏感词"}
                            </strong>
                            <p>
                              判定来源：本地规则工具 · 词库版本 {scan.version} ·
                              模拟数据
                            </p>
                          </Notice>
                          <div className="highlight-text">
                            {highlightHits(scan.text, scan.hits)}
                          </div>
                          <table className="data-table">
                            <thead>
                              <tr>
                                <th>命中词</th>
                                <th>字符位置</th>
                                <th>规则版本</th>
                                <th>是否通过</th>
                                <th>判定来源</th>
                              </tr>
                            </thead>
                            <tbody>
                              {scan.hits.length ? (
                                scan.hits.map((h, i) => (
                                  <tr key={i}>
                                    <td className="error-text">{h.word}</td>
                                    <td>
                                      第 {h.start}–{h.end} 位
                                    </td>
                                    <td>{scan.version}</td>
                                    <td>
                                      <Badge tone="red">不通过</Badge>
                                    </td>
                                    <td>本地规则工具</td>
                                  </tr>
                                ))
                              ) : (
                                <tr>
                                  <td>未命中</td>
                                  <td>—</td>
                                  <td>{scan.version}</td>
                                  <td>
                                    <Badge status="完成">通过</Badge>
                                  </td>
                                  <td>本地规则工具</td>
                                </tr>
                              )}
                            </tbody>
                          </table>
                        </>
                      )}
                    </div>
                  )
                )}
                <div className="section-bottom">
                  <span>
                    AC-04-1 定位命中词 · AC-04-2 版本切换 · AC-04-3 失败不误判
                  </span>
                  <Button
                    variant="primary"
                    icon="send"
                    disabled={
                      role !== "编辑" ||
                      current.creator !== user ||
                      !["待处理", "退回"].includes(current.status) ||
                      !scan ||
                      !!scan.error ||
                      scan.hits.length > 0 ||
                      scan.text !== current.copy ||
                      scan.version !== dictVersion
                    }
                    onClick={submitCopy}
                  >
                    确认并提交审核
                  </Button>
                </div>
              </>
            )}
            {tab === 2 && (
              <>
                <div className="section-heading">
                  <div>
                    <Heading>
                      {reviewing ? "文案审核" : "人工微调与提交"}
                    </Heading>
                    <p>
                      {reviewing
                        ? "结合文案内容、采用理由与规则结论进行审核。"
                        : "先在这里改文案并暂存。合规筛查放在下一步，通过后再确认提交。"}
                    </p>
                  </div>
                  <Badge dot={false}>FR-06 · 版本与确认</Badge>
                </div>
                <div className="compare-grid">
                  <section className="comparison-column">
                    <div className="comparison-heading">
                      <Badge dot={false}>原始生成版</Badge>
                      <span>AI Agent · {current.batch}</span>
                    </div>
                    <div className="original-copy">
                      {current.versions.find((v) => v.name === "原始生成版")
                        ?.copy || "尚未生成原始文案"}
                    </div>
                  </section>
                  <section className="comparison-column">
                    <div className="comparison-heading">
                      <Badge tone="indigo" dot={false}>
                        {reviewing ? "人工提交版" : "当前提交版"}
                      </Badge>
                      <span>{current.creator}</span>
                    </div>
                    <Field label="文案内容" required error={errors.copy}>
                      <Textarea
                        rows={6}
                        value={current.copy}
                        disabled={
                          role !== "编辑" ||
                          current.creator !== user ||
                          !["待处理", "退回"].includes(current.status)
                        }
                        onChange={(e) => {
                          const value = e.target.value
                          setTasks((prev) =>
                            prev.map((item) =>
                              item.id === current.id ? { ...item, copy: value } : item,
                            ),
                          )
                          setScanText(value)
                          setScan(null)
                        }}
                      />
                    </Field>
                    <Field label="采用理由" required error={errors.reason}>
                      <Textarea
                        rows={3}
                        value={current.reason}
                        disabled={
                          role !== "编辑" ||
                          current.creator !== user ||
                          !["待处理", "退回"].includes(current.status)
                        }
                        placeholder="说明采用此文案的原因与人工调整依据"
                        onChange={(e) => {
                          const value = e.target.value
                          setTasks((prev) =>
                            prev.map((item) =>
                              item.id === current.id ? { ...item, reason: value } : item,
                            ),
                          )
                        }}
                      />
                    </Field>
                  </section>
                </div>
                <div className="review-summary">
                  <div>
                    <Icon name="shield" />
                    <strong>敏感词筛查结论</strong>
                    {(scan &&
                      !scan.error &&
                      !scan.hits.length &&
                      scan.text === current.copy) ||
                    current.submitted ? (
                      <Badge status="完成">本地规则筛查通过</Badge>
                    ) : (
                      <Badge tone="amber">需对当前文案筛查</Badge>
                    )}
                    <span>{scan?.version || "DICT-V1"} · 模拟数据</span>
                  </div>
                  <div>
                    <Icon name="code" />
                    <strong>执行记录摘要</strong>
                    <span>
                      {current.id} · {taskCalls.length} 次调用 ·{" "}
                      {taskCalls.filter((c) => c.status === "失败").length}{" "}
                      次失败
                    </span>
                    <Button variant="text" onClick={() => setTab(5)}>
                      查看调用详情
                      <Icon name="chevron" size={12} />
                    </Button>
                  </div>
                </div>
                {reviewing ? (
                  current.status === "待审核" && current.submitted ? (
                  <div className="review-actions">
                    <Field
                      label="审核意见"
                      required
                      error={opinionError}
                      hint="退回时必填；通过时选填，留痕至当前提交版本。"
                    >
                      <Textarea
                        rows={3}
                        disabled={current.status !== "待审核"}
                        placeholder="请填写审核意见，例如：请精炼腰封文案，并去除夸大表达。"
                        value={reviewOpinion}
                        onChange={(e) => {
                          setReviewOpinion(e.target.value)
                          setOpinionError("")
                        }}
                      />
                    </Field>
                    <div className="section-bottom">
                      <span>审核后原始生成版与提交版均继续保留。</span>
                      <div className="actions">
                        <Button
                          variant="danger"
                          disabled={
                            current.status !== "待审核" || !current.submitted
                          }
                          onClick={() => reviewTask(false)}
                        >
                          退回修改
                        </Button>
                        <Button
                          variant="primary"
                          icon="check"
                          disabled={
                            current.status !== "待审核" || !current.submitted
                          }
                          onClick={() => reviewTask(true)}
                        >
                          审核通过
                        </Button>
                      </div>
                    </div>
                  </div>
                  ) : (
                    <p className="muted">
                      当前状态为「{current.status}」，不能执行审核。
                    </p>
                  )
                ) : (
                  <div className="section-bottom">
                    <Button
                      disabled={
                        role !== "编辑" ||
                        current.creator !== user ||
                        !["待处理", "退回"].includes(current.status)
                      }
                      onClick={async () => {
                        try {
                          const task = await api.patchTask(current.id, {
                            copy: current.copy,
                            reason: current.reason,
                          })
                          setTasks((prev) =>
                            prev.map((item) => (item.id === task.id ? task : item)),
                          )
                          notify("进度已暂存。状态仍未进入待审核。")
                        } catch (error) {
                          notify((error as ApiError).message || "暂存失败", true)
                        }
                      }}
                    >
                      暂存进度
                    </Button>
                    <Button
                      variant="primary"
                      icon="arrow"
                      disabled={current.selected < 0 || !current.copy.trim()}
                      onClick={() => {
                        setScanText(current.copy)
                        setScan(null)
                        setTab(3)
                      }}
                    >
                      下一步：合规筛查
                    </Button>
                  </div>
                )}
              </>
            )}
            {tab === 4 && <VersionPanel task={current} />}
            {tab === 5 && (
              <>
                <div className="section-heading">
                  <div>
                    <Heading>Agent 执行记录</Heading>
                    <p>
                      业务结果与工具调用共用{" "}
                      <span className="mono">{current.id}</span>
                      ，所有参数均为脱敏展示。
                    </p>
                  </div>
                  <Badge tone="indigo" dot={false}>
                    {taskCalls.length} / 12 次调用
                  </Badge>
                </div>
                <Notice>
                  执行策略：单任务调用上限 N = 12；单次工具超时 T = 30
                  秒；最大重试 R =
                  2。模型只选择工具与参数，工具结果由校验与模拟执行层返回。
                </Notice>
                <div className="table-scroll">
                  <table className="data-table calls-table">
                    <thead>
                      <tr>
                        <th>顺序 / 工具名</th>
                        <th>输入参数</th>
                        <th>返回摘要 / 来源</th>
                        <th>状态</th>
                        <th>错误码</th>
                        <th>耗时</th>
                      </tr>
                    </thead>
                    <tbody>
                      {taskCalls.map((c, i) => (
                        <tr key={c.id}>
                          <td>
                            <span className="call-sequence">{i + 1}</span>
                            <code>{c.tool}</code>
                            <small>{c.task}</small>
                          </td>
                          <td>
                            <code className="param-code">{c.params}</code>
                          </td>
                          <td>
                            {c.summary}
                            <small>{c.data}</small>
                          </td>
                          <td>
                            <Badge status={c.status} />
                          </td>
                          <td className={c.error !== "—" ? "error-text" : ""}>
                            {c.error}
                          </td>
                          <td className="mono">{c.duration}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
                <div className="section-bottom">
                  <span>
                    AC-05-1 连续多工具调用 · AC-05-2 参数可追溯 · AC-05-3
                    失败可见
                  </span>
                  <Button
                    icon="download"
                    onClick={() => {
                      const url = URL.createObjectURL(
                        new Blob([JSON.stringify(taskCalls, null, 2)], {
                          type: "application/json",
                        }),
                      )
                      const a = document.createElement("a")
                      a.href = url
                      a.download = `${current.id}-Agent执行记录.json`
                      a.click()
                      URL.revokeObjectURL(url)
                      notify("Agent 执行记录已导出。")
                    }}
                  >
                    导出 Agent 执行记录
                  </Button>
                </div>
              </>
            )}
          </div>
        </div>
      </>
    )
  }

  function renderResources() {
    const titles: Record<string, [string, string]> = {
      materials: ["资料管理", "管理书稿资料与来源，让每一个创作依据都可查询。"],
      templates: [
        "风格模板库",
        "让风格有章可循。模板修改生成新版本，历史内容始终保留。",
      ],
      dictionary: [
        "敏感词库",
        "基于本地规则的透明筛查，多版本词库并存、可追溯。",
      ],
      accounts: ["账号与角色", "明确协作边界，为不同角色配置合适的操作权限。"],
      audit: ["审计日志", "记录关键操作与权限拒绝，让协作过程全程可追溯。"],
    }
    const [title, description] = titles[page]
    const materialRows = materials.filter((item) =>
      `${item.id}${item.title}${item.type}${item.source}`
        .toLowerCase()
        .includes(resourceQuery.toLowerCase()),
    )
    const templateRows = templateVersions.filter((t) =>
      `${t.id}${t.style}${t.content}`
        .toLowerCase()
        .includes(resourceQuery.toLowerCase()),
    )
    const accountRows = accounts.filter((a) =>
      `${a.name}${a.email}${a.role}`.includes(resourceQuery),
    )
    const auditRows = audit.filter((a) =>
      `${a.user}${a.role}${a.action}${a.object}${a.result}`
        .toLowerCase()
        .includes(resourceQuery.toLowerCase()),
    )
    const dictionaryRows = (
      dictSource === "oss" ? ossWords : dictionaries[dictVersion] || []
    ).filter((word) => word.includes(resourceQuery))
    const count =
      page === "materials"
        ? materialRows.length
        : page === "templates"
          ? templateRows.length
          : page === "accounts"
            ? accountRows.length
            : page === "audit"
              ? auditRows.length
              : dictionaryRows.length
    const slice = <T,>(rows: T[]) =>
      rows.slice((resourcePage - 1) * pageSize, resourcePage * pageSize)
    return (
      <>
        {pageHeader(
          title,
          description,
          page === "materials" ? (
            <Button
              icon="plus"
              variant="primary"
              disabled={role === "主编"}
              onClick={() => {
                setMaterialForm(emptyMaterial())
                setModal("material-form")
              }}
            >
              创建教学资料
            </Button>
          ) : page === "templates" ? (
            <Button
              icon="plus"
              variant="primary"
              onClick={() => {
                setNewStyle("")
                setTemplateContent("")
                setModal("template-new")
              }}
            >
              新建模板
            </Button>
          ) : page === "dictionary" && dictSource === "custom" ? (
            <Button
              variant="primary"
              icon="plus"
              onClick={() => {
                setDictionaryDraft(
                  (dictionaries[dictVersion] || dictionaries["DICT-V1"]).join(
                    "\n",
                  ),
                )
                setModal("dictionary")
              }}
            >
              创建词库新版本
            </Button>
          ) : page === "audit" ? null : (
            <Badge tone="indigo" dot={false}>
              管理员工作空间
            </Badge>
          ),
        )}
        {page === "dictionary" && (
          <Notice tone="warning" icon="alert">
            <strong>
              {dictSource === "oss"
                ? `开源词库 ${ossMeta.name}（${ossMeta.license}）· 广告类`
                : "自定义词库 · 模拟数据，仅用于教学演示"}
            </strong>
            <p>
              {dictSource === "oss"
                ? "匹配由 Sensitive-lexicon 广告类词表完成，词表只读。自定义词库仍按版本维护，两者可在筛查时切换。"
                : "词条用于演示规则命中，不代表真实敏感词标准；不用于实际出版审核或合规结论。"}
            </p>
          </Notice>
        )}
        {page === "accounts" && (
          <div className="permission-matrix">
            {([
              {
                role: "编辑",
                desc: "创建任务、导入资料、AI 生成、人工微调与提交",
                icon: "edit",
              },
              {
                role: "主编",
                desc: "审核通过 / 退回、查看全部版本与执行记录",
                icon: "review",
              },
              {
                role: "管理员",
                desc: "维护词库、模板与账号；可生成、重试及审核",
                icon: "settings",
              },
            ] as const).map((r) => (
              <div className="panel" key={r.role}>
                <Icon name={r.icon} size={23} />
                <Heading>{r.role}</Heading>
                <p>{r.desc}</p>
              </div>
            ))}
          </div>
        )}
        <section className="panel resource-panel">
          <div className="resource-toolbar">
            <div className="search-input">
              <Icon name="search" size={17} />
              <Input
                aria-label={`搜索${title}`}
                placeholder={
                  page === "materials"
                    ? "搜索数据 ID、书名"
                    : `搜索${title}关键词`
                }
                value={resourceQuery}
                onChange={(e) => {
                  setResourceQuery(e.target.value)
                  setResourcePage(1)
                }}
              />
            </div>
            {page === "dictionary" && (
              <>
                <div className="dict-switch">
                  <Button
                    variant={dictSource === "custom" ? "primary" : "secondary"}
                    onClick={() => {
                      setDictSource("custom")
                      setDictVersion((value) =>
                        value.startsWith("OSS") ? "DICT-V1" : value,
                      )
                      setResourcePage(1)
                    }}
                  >
                    自定义
                  </Button>
                  <Button
                    variant={dictSource === "oss" ? "primary" : "secondary"}
                    onClick={() => {
                      setDictSource("oss")
                      setDictVersion(ossMeta.version)
                      setResourcePage(1)
                    }}
                  >
                    开源
                  </Button>
                </div>
                {dictSource === "custom" && (
                  <Select
                    aria-label="敏感词库版本"
                    value={dictVersion}
                    onChange={(e) => {
                      setDictVersion(e.target.value)
                      setResourcePage(1)
                    }}
                  >
                    {Object.keys(dictionaries).map((version) => (
                      <option key={version}>{version}</option>
                    ))}
                  </Select>
                )}
              </>
            )}
            <span className="filter-spacer" />
            <Badge dot={false}>{count} 条记录</Badge>
            <Button
              icon="more"
              variant="ghost"
              aria-label="表格状态设置"
              onClick={() => setModal("table-state")}
            />
          </div>
          {tableState !== "normal" ? (
            <EmptyState
              type={tableState === "empty" ? "empty" : tableState}
              onAction={
                tableState !== "loading"
                  ? () => setTableState("normal")
                  : undefined
              }
            />
          ) : count === 0 ? (
            <EmptyState
              title="没有匹配的记录"
              description="请尝试其他关键词。"
            />
          ) : (
            <div className="table-scroll">
              <table className="data-table resource-table">
                {page === "materials" && (
                  <>
                    <thead>
                      <tr>
                        <th>数据 ID</th>
                        <th>资料名称</th>
                        <th>类型</th>
                        <th>来源</th>
                        <th>版本</th>
                        <th>关联任务</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice(materialRows).map((item) => (
                        <tr key={item.id}>
                          <td className="mono">{item.id}</td>
                          <td>
                            <span className="inline-icon">
                              <Icon name="file" size={16} />
                              {item.title}
                            </span>
                          </td>
                          <td>{item.type}</td>
                          <td>{item.source}</td>
                          <td>{item.version}</td>
                          <td className="mono">{item.taskId || "—"}</td>
                          <td>
                            <Button
                              variant="text"
                              onClick={() => {
                                setMaterialDetail(item)
                                setModal("material")
                              }}
                            >
                              查看
                            </Button>
                            {role !== "主编" && (
                              <Button
                                variant="text"
                                onClick={() => {
                                  setMaterialForm(item)
                                  setModal("material-form")
                                }}
                              >
                                修改
                              </Button>
                            )}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
                {page === "templates" && (
                  <>
                    <thead>
                      <tr>
                        <th>模板 ID</th>
                        <th>风格</th>
                        <th>模板内容</th>
                        <th>版本</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice(templateRows).map((t) => (
                        <tr key={`${t.id}-${t.version}`}>
                          <td className="mono">{t.id}</td>
                          <td>
                            <Badge tone="indigo" dot={false}>
                              {t.style}
                            </Badge>
                          </td>
                          <td className="template-content">{t.content}</td>
                          <td>{t.version}</td>
                          <td>
                            <Button
                              variant="text"
                              icon="edit"
                              onClick={() => {
                                setTemplateIndex(templateVersions.indexOf(t))
                                setTemplateContent(t.content)
                                setModal("template")
                              }}
                            >
                              创建新版本
                            </Button>
                            <Button
                              variant="text"
                              onClick={async () => {
                                if (!t.rowId) return
                                if (!window.confirm(`删除模板 ${t.style} ${t.version}？`)) return
                                try {
                                  setTemplateVersions(await api.deleteTemplate(t.rowId))
                                  notify(`已删除 ${t.id} ${t.version}`)
                                } catch (error) {
                                  notify((error as ApiError).message || "删除失败", true)
                                }
                              }}
                            >
                              删除
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
                {page === "dictionary" && (
                  <>
                    <thead>
                      <tr>
                        <th>词条 ID</th>
                        <th>词条</th>
                        <th>匹配方式</th>
                        <th>规则版本</th>
                        <th>来源</th>
                        <th>用途</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice(dictionaryRows).map((word, i) => (
                        <tr key={word}>
                          <td className="mono">
                            WORD-{String(i + 1).padStart(3, "0")}
                          </td>
                          <td>
                            <span className="dictionary-word">{word}</span>
                          </td>
                          <td>
                            {dictSource === "oss" ? "Sensitive-lexicon 词表匹配" : "词表精确匹配"}
                          </td>
                          <td className="mono">
                            {dictSource === "oss" ? ossMeta.version : dictVersion}
                          </td>
                          <td>
                            <Badge tone={dictSource === "oss" ? "indigo" : "amber"} dot={false}>
                              {dictSource === "oss" ? "开源" : "自定义 · 模拟数据"}
                            </Badge>
                          </td>
                          <td>
                            {dictSource === "oss" ? "开源引擎筛查" : "教学规则匹配演示"}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
                {page === "accounts" && (
                  <>
                    <thead>
                      <tr>
                        <th>账号</th>
                        <th>邮箱</th>
                        <th>角色</th>
                        <th>状态</th>
                        <th>操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice(accountRows).map((a) => (
                        <tr key={a.email}>
                          <td>
                            <span className="creator-cell">
                              <Avatar name={a.name} small />
                              {a.name}
                            </span>
                          </td>
                          <td>{a.email}</td>
                          <td>
                            <Select
                              aria-label={`${a.name}的角色`}
                              value={a.role}
                              disabled={a.name === user}
                              onChange={async (e) => {
                                try {
                                  const next = await api.updateAccount(a.email, {
                                    role: e.target.value,
                                  })
                                  setAccounts(next)
                                  notify("账号角色已更新。")
                                } catch (error) {
                                  notify((error as ApiError).message || "更新失败", true)
                                }
                              }}
                            >
                              <option>编辑</option>
                              <option>主编</option>
                              <option>管理员</option>
                            </Select>
                          </td>
                          <td>
                            <Badge tone={a.active ? "green" : "neutral"}>
                              {a.active ? "正常" : "已停用"}
                            </Badge>
                          </td>
                          <td>
                            <Button
                              variant="text"
                              disabled={a.name === user}
                              title={a.name === user ? "不可停用当前账号" : ""}
                              onClick={async () => {
                                try {
                                  const next = await api.updateAccount(a.email, {
                                    active: !a.active,
                                  })
                                  setAccounts(next)
                                  notify("账号状态已更新。")
                                } catch (error) {
                                  notify((error as ApiError).message || "更新失败", true)
                                }
                              }}
                            >
                              {a.active ? "停用" : "启用"}
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
                {page === "audit" && (
                  <>
                    <thead>
                      <tr>
                        <th>操作人</th>
                        <th>角色</th>
                        <th>操作</th>
                        <th>对象</th>
                        <th>时间</th>
                        <th>结果</th>
                      </tr>
                    </thead>
                    <tbody>
                      {slice(auditRows).map((a, i) => (
                        <tr key={i}>
                          <td>
                            <span className="creator-cell">
                              <Avatar name={a.user} small />
                              {a.user}
                            </span>
                          </td>
                          <td>{a.role}</td>
                          <td>{a.action}</td>
                          <td className="mono">{a.object}</td>
                          <td className="time-cell">{a.time}</td>
                          <td>
                            <Badge
                              tone={
                                a.result.includes("403")
                                  ? "red"
                                  : a.result === "成功" || a.result === "通过"
                                    ? "green"
                                    : "amber"
                              }
                            >
                              {a.result}
                            </Badge>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </>
                )}
              </table>
            </div>
          )}
          {pagination(count, resourcePage, setResourcePage)}
        </section>
        <Notice>
          {page === "materials"
            ? "AC-02-1：每条书稿均保留数据 ID、来源、具体版本与关联任务，可按 ID 查询。"
            : page === "templates"
              ? "AC-02-3：修改以新版本保存，不覆盖已有模板。生成记录引用当时使用的具体版本。"
              : page === "dictionary"
                ? "AC-02-2：DICT-V1 与 DICT-V2 并存。切换版本查看词条；筛查记录始终保留当次规则版本。"
                : page === "audit"
                  ? "所有权限响应均为前端模拟，不发送真实 HTTP 请求。越权演示会新增 403 审计记录，不展示密钥或敏感参数。"
                  : "角色管理为教学模拟，不关联真实账户或认证系统。主编不可创建 / 修改 / 生成 / 重试；管理员不可代替编辑进行人工微调提交。"}
        </Notice>
      </>
    )
  }

  function renderDesign() {
    return (
      <>
        {pageHeader(
          "设计系统",
          "墨舟 AI · 一套清晰、一致、可复用的桌面工作台设计语言。",
          <Badge tone="indigo" dot={false}>
            Design System · V1.0
          </Badge>,
        )}
        <div className="design-grid">
          <section className="panel design-card">
            <Heading>语义色彩与状态</Heading>
            <p>靛蓝主色 · 浅色界面 · 中高信息密度</p>
            <div className="color-swatches">
              {[
                "primary",
                "running",
                "review",
                "success",
                "danger",
                "returned",
              ].map((c) => (
                <div key={c}>
                  <span className={`swatch swatch-${c}`} />
                  <small>
                    {
                      {
                        primary: "品牌靛蓝",
                        running: "运行蓝",
                        review: "审核橙",
                        success: "完成绿",
                        danger: "失败红",
                        returned: "退回紫",
                      }[c]
                    }
                  </small>
                </div>
              ))}
            </div>
            <div className="style-options">
              {statuses.map((s) => (
                <Badge key={s} status={s} />
              ))}
            </div>
          </section>
          <section className="panel design-card">
            <Heading>字体与间距</Heading>
            <p>中文无衬线 · 8pt 间距体系 · 12 列布局</p>
            <Heading level={1}>20 / 页面标题</Heading>
            <Heading>16 / 区块标题</Heading>
            <p className="body-example">
              14 / 正文：让每一份好文案都有迹可循。
            </p>
            <small>12 / 辅助信息与来源注释</small>
            <div className="spacing-demo">
              {[8, 16, 24, 32].map((n) => (
                <span key={n} className={`spacing-${n}`}>
                  {n}
                </span>
              ))}
            </div>
          </section>
          <section className="panel design-card">
            <Heading>按钮 Variants</Heading>
            <div className="style-options">
              <Button variant="primary" icon="plus">
                主要按钮
              </Button>
              <Button>次要按钮</Button>
              <Button variant="danger">危险操作</Button>
              <Button variant="text">文字按钮</Button>
              <Button disabled>禁用状态</Button>
            </div>
            <div className="style-options">
              <Button variant="primary" icon="refresh">
                处理中
              </Button>
              <Button icon="check">已选定</Button>
              <Button variant="ghost" icon="more" aria-label="更多按钮示例" />
            </div>
          </section>
          <section className="panel design-card">
            <Heading>字段 Variants</Heading>
            <div className="form-grid">
              <Field label="默认" required>
                <Input placeholder="请输入内容" />
              </Field>
              <Field label="聚焦状态">
                <Input className="input-focus" placeholder="等待输入" />
              </Field>
              <Field label="字段错误" error="此字段不能为空">
                <Input placeholder="必填内容" />
              </Field>
              <Field label="禁用状态">
                <Input disabled value="不可修改" readOnly />
              </Field>
            </div>
          </section>
          <section className="panel design-card">
            <Heading>消息与权限提示</Heading>
            <Notice tone="success" icon="check">
              提交成功，任务已进入待审核。
            </Notice>
            <Notice tone="error" icon="alert">
              E-TOOL-01 · 工具超时，不判定为通过。
            </Notice>
            <Notice icon="lock">403 · 当前角色没有此操作权限。</Notice>
          </section>
          <section className="panel design-card">
            <Heading>交互与组件预览</Heading>
            <p>
              所有组件由统一 Tokens 驱动，以 Flex / Grid 自动布局，适配 1280px
              及以上桌面。
            </p>
            <div className="style-options">
              <Button
                onClick={() => {
                  setActiveId("TASK-005")
                  setModal("retry")
                }}
              >
                重试 Modal
              </Button>
              <Button onClick={() => notify("操作成功，变更已保存。")}>
                成功 Toast
              </Button>
              <Button onClick={() => notify("操作失败，请稍后重试。", true)}>
                失败 Toast
              </Button>
              <Button onClick={() => navigate("states")}>全局状态</Button>
            </div>
          </section>
        </div>
      </>
    )
  }
  function renderHelp() {
    return (
      <>
        {pageHeader(
          "帮助与验收",
          "按功能逐项演示，验证角色边界、业务状态与完整的版本留痕。",
          <Badge tone="amber" dot={false}>
            教学演示 · 前端原型
          </Badge>,
        )}
        <Notice>
          <strong>原型使用说明</strong>
          <p>
            从「新建任务」开始，点击「填入教学示例」快速体验；通过右上角切换角色完成审核。数据只保留在本次页面会话，刷新会重置。此交付为可编辑
            React 前端，不是 Figma 原生画板、Auto Layout 节点或原生 Prototype
            连线。
          </p>
        </Notice>
        <div className="acceptance-grid">
          {acceptance.map((a) => (
            <section className="panel acceptance-card" key={a.id}>
              <span className="eyebrow">{a.id}</span>
              <Heading>{a.title}</Heading>
              {a.items.map((i) => (
                <p key={i}>
                  <Icon name="check" size={15} />
                  {i}
                </p>
              ))}
            </section>
          ))}
        </div>
        <section className="panel design-card">
          <Heading>演示快捷入口</Heading>
          <div className="style-options">
            <Button icon="plus" onClick={() => openForm()}>
              创建与字段校验
            </Button>
            <Button
              icon="sparkles"
              onClick={() => openTask(tasks.find((t) => t.id === "TASK-003")!)}
            >
              生成 3 组候选
            </Button>
            <Button icon="shield" onClick={() => openTask(tasks[0], 3)}>
              敏感词规则演示
            </Button>
            <Button icon="compare" onClick={() => openTask(tasks[0], 4)}>
              版本对比
            </Button>
            <Button
              icon="lock"
              onClick={() => denied("修改他人任务", "TASK-025", true)}
            >
              越权修改演示
            </Button>
            <Button icon="palette" onClick={() => navigate("design")}>
              设计系统
            </Button>
            <Button icon="alert" onClick={() => navigate("states")}>
              全局状态
            </Button>
          </div>
        </section>
      </>
    )
  }
  function renderStates() {
    return (
      <>
        {pageHeader(
          "全局状态与原型",
          "清晰反馈每一种结果，让正常与异常流程同样完整。",
        )}
        <div className="states-grid">
          <section className="panel">
            <EmptyState />
          </section>
          <section className="panel">
            <EmptyState type="loading" />
          </section>
          <section className="panel">
            <EmptyState
              type="error"
              onAction={() => notify("模拟重新加载成功。")}
            />
          </section>
          <section className="panel">
            <EmptyState type="forbidden" onAction={() => navigate("tasks")} />
          </section>
        </div>
        <section className="panel design-card">
          <Heading>Toast、Modal 与权限演示</Heading>
          <div className="style-options">
            <Button onClick={() => notify("提交成功，已进入待审核。")}>
              成功 Toast
            </Button>
            <Button
              onClick={() => notify("E-TOOL-01 · 本地规则工具超时。", true)}
            >
              失败 Toast
            </Button>
            <Button
              icon="refresh"
              onClick={() => {
                setActiveId("TASK-005")
                setModal("retry")
              }}
            >
              重试 Modal
            </Button>
            <Button
              icon="lock"
              onClick={() => denied("模拟越权修改", "TASK-025", true)}
            >
              403 页面 + 审计记录
            </Button>
          </div>
        </section>
      </>
    )
  }

  if (!signedIn) return <Login onLogin={completeLogin} />

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-symbol">
            <Icon name="edit" size={23} />
            <span />
          </span>
          <div>
            <strong>
              墨舟<span> AI</span>
            </strong>
            <small>AI 文案与合规工作台</small>
          </div>
        </div>
        <div className="workspace-switch">
          <span className="workspace-icon">
            <Icon name="book" size={17} />
          </span>
          <div>
            <strong>出版创作工作空间</strong>
            <small>教学演示项目</small>
          </div>
          <Icon name="down" size={13} />
        </div>
        <nav>
          {navGroups.map((group) => (
            <div className="nav-group" key={group.label}>
              <div className="nav-group-label">{group.label}</div>
              {group.items
                .filter((item) => item.id !== "review" || role !== "编辑")
                .map((item) => (
                <Button
                  key={item.id}
                  variant="ghost"
                  className={`nav-item ${
                    page === item.id ||
                    (["form", "detail"].includes(page) &&
                      item.id === (role === "主编" ? "review" : "tasks"))
                      ? "nav-active"
                      : ""
                  }`}
                  onClick={() => navigate(item.id)}
                >
                  <Icon name={item.icon} size={19} />
                  <span>{item.label}</span>
                  {item.id === "review" && totalReview > 0 && (
                    <span className="nav-count">{totalReview}</span>
                  )}
                  {["templates", "dictionary", "accounts", "audit"].includes(
                    item.id,
                  ) &&
                    role !== "管理员" && (
                      <Icon name="lock" size={12} className="nav-lock" />
                    )}
                </Button>
              ))}
            </div>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <div className="demo-card">
            <div>
              <span className="demo-dot" />
              <strong>教学演示模式</strong>
              <span>DEMO</span>
            </div>
            <p>
              所有内容均为模拟数据
              <br />
              放心探索，体验完整创作流程
            </p>
            <Button variant="text" onClick={() => navigate("help")}>
              查看演示指南
              <Icon name="arrow" size={13} />
            </Button>
          </div>
          <Button
            variant="ghost"
            className={`nav-item help-nav ${
              ["help", "design", "states"].includes(page) ? "nav-active" : ""
            }`}
            onClick={() => navigate("help")}
          >
            <Icon name="help" size={18} />
            <span>帮助与验收</span>
            <Icon name="external" size={13} />
          </Button>
          <div className="sidebar-user">
            <Avatar name={user} />
            <div>
              <strong>
                {user}
                <span>{role}</span>
              </strong>
              <small>内容创作团队</small>
            </div>
            <Button
              variant="ghost"
              icon="settings"
              aria-label="角色与工作空间设置"
              onClick={() => setModal("role-info")}
            />
          </div>
        </div>
      </aside>
      <div className="main-shell">
        <header className="topbar">
          <div className="breadcrumbs">
            <Icon name="grid" size={16} />
            <span>工作空间</span>
            <Icon name="chevron" size={12} />
            <strong>{pageNames[page]}</strong>
          </div>
          <div className="topbar-right">
            <span className="environment-label">
              <span />
              教学演示环境
            </span>
            <div className="topbar-divider" />
            <div className="role-switch">
              <Icon name="users" size={15} />
              <span>当前角色</span>
              <Select
                aria-label="切换角色"
                value={role}
                onChange={(e) => switchRole(e.target.value as Role)}
              >
                <option>编辑</option>
                <option>主编</option>
                <option>管理员</option>
              </Select>
            </div>
            <div className="topbar-divider" />
            <div className="notification-wrap">
              <Button
                variant="ghost"
                icon="bell"
                aria-label="通知"
                className="notification-button"
                onClick={() => setNotificationOpen(!notificationOpen)}
              />
              <i />
              {notificationOpen && (
                <div className="notification-popover">
                  <Heading>工作通知</Heading>
                  <p>
                    <span className="live-dot" />
                    {totalReview} 项任务等待审核
                  </p>
                  <small>教学演示通知 · 当前会话</small>
                  {role !== "编辑" && (
                    <Button
                      variant="text"
                      onClick={() => {
                        setNotificationOpen(false)
                        navigate("review")
                      }}
                    >
                      查看审核工作台
                      <Icon name="arrow" size={13} />
                    </Button>
                  )}
                </div>
              )}
            </div>
            <Avatar name={user} small />
            <Button
              variant="ghost"
              icon="logout"
              aria-label="退出登录"
              title="退出登录"
              onClick={signOut}
            />
          </div>
        </header>
        <main className="main-content">
          {["tasks", "review"].includes(page) ? (
            renderTaskList()
          ) : page === "form" ? (
            renderForm()
          ) : page === "detail" ? (
            renderDetail()
          ) : [
              "materials",
              "templates",
              "dictionary",
              "accounts",
              "audit",
            ].includes(page) ? (
            renderResources()
          ) : page === "design" ? (
            renderDesign()
          ) : page === "help" ? (
            renderHelp()
          ) : page === "states" ? (
            renderStates()
          ) : (
            <div className="panel forbidden-panel">
              <EmptyState
                type="forbidden"
                description={`当前「${role}」角色没有此操作权限。模拟 403 响应已记录到审计日志，可切换管理员查看。`}
                onAction={() => navigate("tasks")}
              />
              <Button
                variant="text"
                onClick={() => {
                  switchRole("管理员")
                  setPage("audit")
                }}
              >
                切换管理员并查看审计日志
                <Icon name="arrow" size={14} />
              </Button>
            </div>
          )}
        </main>
        <footer className="app-footer">
          <span>
            © 2025 墨舟 AI<span className="footer-divider">|</span>
            让好内容，被看见。
          </span>
          <div>
            <span className="system-dot" />
            系统运行正常<span className="footer-divider">·</span>前端模拟原型
            V1.0
            <Button variant="text" onClick={() => navigate("design")}>
              设计系统
            </Button>
          </div>
        </footer>
      </div>
      {toast && (
        <div
          className={`toast ${toast.error ? "toast-error" : "toast-success"}`}
          role="status"
        >
          <span className="toast-icon">
            <Icon name={toast.error ? "alert" : "check"} size={17} />
          </span>
          <span>{toast.text}</span>
          <Button
            variant="ghost"
            icon="close"
            aria-label="关闭消息"
            onClick={() => setToast(null)}
          />
        </div>
      )}
      {modal === "retry" && (
        <Modal
          title="重新执行 AI 任务"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>取消</Button>
              <Button
                variant="primary"
                icon="refresh"
                disabled={!canEdit || current.retries >= 2}
                onClick={() => startGeneration(current, true)}
              >
                确认重试
              </Button>
            </>
          }
        >
          <Notice icon="shield">
            <strong>已有人工修改版本不会被覆盖</strong>
            <p>重试结果将创建新的原始生成版，与历史版本独立保存。</p>
          </Notice>
          <dl className="metadata">
            <div>
              <dt>任务</dt>
              <dd>
                {current.id} · {current.title}
              </dd>
            </div>
            <div>
              <dt>重试次数</dt>
              <dd>{current.retries} / 2</dd>
            </div>
            <div>
              <dt>已有版本</dt>
              <dd>{current.versions.length} 个 · 全部保留</dd>
            </div>
          </dl>
          <label className="check-label">
            <Input
              type="checkbox"
              checked={failureMode}
              onChange={(e) => setFailureMode(e.target.checked)}
            />
            继续模拟超时失败
          </label>
        </Modal>
      )}
      {modal === "task-actions" && (
        <Modal
          title={`${current.id} · 任务操作`}
          onClose={() => setModal(null)}
          footer={<Button onClick={() => setModal(null)}>关闭</Button>}
        >
          <div className="modal-action-list">
            <Button
              icon="file"
              onClick={() => {
                openTask(current)
                setModal(null)
              }}
            >
              查看资料与生成
            </Button>
            <Button
              icon="compare"
              onClick={() => {
                openTask(current, 4)
                setModal(null)
              }}
            >
              版本列表与对比
            </Button>
            <Button
              icon="code"
              onClick={() => {
                openTask(current, 5)
                setModal(null)
              }}
            >
              Agent 执行记录
            </Button>
            <Button
              icon="sparkles"
              disabled={
                !canEdit ||
                !["待处理", "退回", "待审核"].includes(current.status)
              }
              onClick={() => {
                setModal(null)
                startGeneration()
              }}
            >
              发起 AI 处理
            </Button>
            {role === "编辑" && current.creator === user && current.status !== "完成" && (
              <Button
                icon="alert"
                onClick={() => {
                  const task = current
                  setModal(null)
                  removeTask(task)
                }}
              >
                删除任务
              </Button>
            )}
          </div>
        </Modal>
      )}
      {modal === "table-state" && (
        <Modal title="表格状态演示" onClose={() => setModal(null)}>
          <p className="muted">仅改变当前页面的展示状态，不修改模拟任务。</p>
          <div className="style-options">
            {(["normal", "empty", "loading", "error"] as const).map((s) => (
              <Button
                key={s}
                variant={tableState === s ? "primary" : "secondary"}
                onClick={() => {
                  setTableState(s)
                  setModal(null)
                }}
              >
                {
                  {
                    normal: "正常数据",
                    empty: "空状态",
                    loading: "加载中",
                    error: "加载失败",
                  }[s]
                }
              </Button>
            ))}
          </div>
        </Modal>
      )}
      {modal === "filters" && (
        <Modal
          title="高级筛选"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={resetFilters}>重置条件</Button>
              <Button variant="primary" onClick={() => setModal(null)}>
                应用筛选
              </Button>
            </>
          }
        >
          <Field label="任务状态">
            <Select
              value={status}
              onChange={(e) => changeStatus(e.target.value)}
            >
              <option>全部</option>
              {statuses.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </Select>
          </Field>
          <Field label="创建人">
            <Select
              value={creator}
              onChange={(e) => {
                setCreator(e.target.value)
                setListPage(1)
              }}
            >
              <option>全部创建人</option>
              <option>林晓</option>
              <option>陈妍</option>
              <option>王珂</option>
            </Select>
          </Field>
          <Field label="关键词">
            <Input
              value={keyword}
              onChange={(e) => {
                setKeyword(e.target.value)
                setListPage(1)
              }}
              placeholder="任务 ID / 书名 / 作者"
            />
          </Field>
        </Modal>
      )}
      {modal === "material" && materialDetail && (
        <Modal
          title="书稿资料详情"
          onClose={() => setModal(null)}
          wide
          footer={
            <>
              {role !== "主编" && (
                <Button
                  onClick={() => {
                    setMaterialForm(materialDetail)
                    setModal("material-form")
                  }}
                >
                  修改
                </Button>
              )}
              <Button onClick={() => setModal(null)}>关闭</Button>
            </>
          }
        >
          <Badge tone="amber" dot={false}>
            教学模拟资料
          </Badge>
          <dl className="metadata">
            <div>
              <dt>数据 ID</dt>
              <dd>{materialDetail.id}</dd>
            </div>
            <div>
              <dt>名称</dt>
              <dd>{materialDetail.title}</dd>
            </div>
            <div>
              <dt>类型</dt>
              <dd>{materialDetail.type}</dd>
            </div>
            <div>
              <dt>来源</dt>
              <dd>{materialDetail.source}</dd>
            </div>
            <div>
              <dt>版本 / 关联任务</dt>
              <dd>
                {materialDetail.version} / {materialDetail.taskId || "—"}
              </dd>
            </div>
            <div>
              <dt>作者</dt>
              <dd>{materialDetail.author || "—"}</dd>
            </div>
            <div>
            {materialDetail.excerpt && (
              <div>
                <dt>片段出处</dt>
                <dd>{materialDetail.chapter || "—"}</dd>
              </div>
            )}
            </div>
            <dt>精选片段</dt>
            <dd>{materialDetail.excerpt ? "已填写" : "未填写"}</dd>
          </dl>
          <Heading>书稿摘要</Heading>
          <p className="manuscript-preview">{materialDetail.content}</p>
          {materialDetail.excerpt && (
            <>
              <Heading>精选片段</Heading>
              <p className="manuscript-preview">{materialDetail.excerpt}</p>
            </>
          )}
        </Modal>
      )}
      {modal === "material-form" && (
        <Modal
          title={materialForm.id ? "修改教学资料" : "创建教学资料"}
          onClose={() => setModal(null)}
          wide
          footer={
            <>
              <Button onClick={() => setModal(null)}>取消</Button>
              <Button
                variant="primary"
                onClick={async () => {
                  try {
                    const saved = await api.saveMaterial(
                      materialForm,
                      materialForm.id || undefined,
                    )
                    setMaterials((prev) => {
                      const exists = prev.some((item) => item.id === saved.id)
                      return exists
                        ? prev.map((item) => (item.id === saved.id ? saved : item))
                        : [...prev, saved]
                    })
                    setModal(null)
                    notify(materialForm.id ? "资料已更新。" : "教学资料已创建。")
                  } catch (error) {
                    notify((error as ApiError).message || "保存失败", true)
                  }
                }}
              >
                保存
              </Button>
            </>
          }
        >
          <Field label="资料名称" required>
            <Input
              value={materialForm.title}
              onChange={(e) =>
                setMaterialForm({ ...materialForm, title: e.target.value })
              }
            />
          </Field>
          <Field label="来源" required hint="教学模拟数据须注明用途">
            <Input
              value={materialForm.source}
              placeholder="例如：教学模拟书稿 · 手工录入"
              onChange={(e) =>
                setMaterialForm({ ...materialForm, source: e.target.value })
              }
            />
          </Field>
          <Field label="版本">
            <Input
              value={materialForm.version}
              onChange={(e) =>
                setMaterialForm({ ...materialForm, version: e.target.value })
              }
            />
          </Field>
          <Field label="作者">
            <Input
              value={materialForm.author}
              onChange={(e) =>
                setMaterialForm({ ...materialForm, author: e.target.value })
              }
            />
          </Field>
          <Field label="书稿摘要" required>
            <Textarea
              rows={6}
              value={materialForm.content}
              onChange={(e) =>
                setMaterialForm({ ...materialForm, content: e.target.value })
              }
            />
          </Field>
          <Field label="精选片段" hint="选填。可从书稿中摘一段，供生成时参考。">
            <Textarea
              rows={4}
              value={materialForm.excerpt}
              onChange={(e) =>
                setMaterialForm({ ...materialForm, excerpt: e.target.value })
              }
            />
          </Field>
          <Field label="片段出处" hint="选填。填写精选片段时建议注明章节或页码。">
            <Input
              value={materialForm.chapter}
              onChange={(e) =>
                setMaterialForm({ ...materialForm, chapter: e.target.value })
              }
            />
          </Field>
        </Modal>
      )}
      {modal === "template" && (
        <Modal
          title="创建风格模板新版本"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>取消</Button>
              <Button
                variant="primary"
                disabled={!templateContent.trim()}
                onClick={async () => {
                  const old = templateVersions[templateIndex]
                  try {
                    const templates = await api.createTemplate({
                      tpl_id: old.id,
                      content: templateContent,
                    })
                    setTemplateVersions(templates)
                    const created = templates[templates.length - 1]
                    notify(
                      `已保存 ${created.version}，旧版本 ${old.version} 保持不变。`,
                    )
                    setModal(null)
                  } catch (error) {
                    notify((error as ApiError).message || "保存失败", true)
                  }
                }}
              >
                保存新版本
              </Button>
            </>
          }
        >
          <Notice>
            当前版本 {templateVersions[templateIndex].version}{" "}
            只读保留，修改将保存为新版本。
          </Notice>
          <Field label="模板内容" required>
            <Textarea
              rows={6}
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
            />
          </Field>
        </Modal>
      )}
      {modal === "dictionary" && (
        <Modal
          title="创建敏感词库新版本"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>取消</Button>
              <Button
                variant="primary"
                disabled={!dictionaryDraft.trim()}
                onClick={async () => {
                  if (role !== "管理员")
                    return denied("创建敏感词库版本", "SensitiveDict")
                  const words = [
                    ...new Set(
                      dictionaryDraft
                        .split(/[\n，,]/)
                        .map((word) => word.trim())
                        .filter(Boolean),
                    ),
                  ]
                  try {
                    const data = await api.createDictionary(words)
                    setDictionaries(data.dictionaries)
                    setDictVersion(data.version)
                    setResourceQuery("")
                    setResourcePage(1)
                    setModal(null)
                    notify(`已发布 ${data.version}，所有旧版词库保持不变。`)
                  } catch (error) {
                    notify((error as ApiError).message || "发布失败", true)
                  }
                }}
              >
                发布新版本
              </Button>
            </>
          }
        >
          <Notice tone="warning">
            <strong>模拟数据，仅用于教学演示</strong>
            <p>新版本采用词表精确匹配。历史筛查记录继续引用原有规则版本。</p>
          </Notice>
          <Field
            label="模拟词条"
            required
            hint="每行一个词条，或使用逗号分隔。保存会去重，不覆盖旧版。"
          >
            <Textarea
              rows={7}
              value={dictionaryDraft}
              onChange={(e) => setDictionaryDraft(e.target.value)}
            />
          </Field>
        </Modal>
      )}
      {modal === "template-new" && (
        <Modal
          title="新建风格模板"
          onClose={() => setModal(null)}
          footer={
            <>
              <Button onClick={() => setModal(null)}>取消</Button>
              <Button
                variant="primary"
                disabled={!newStyle.trim() || !templateContent.trim()}
                onClick={async () => {
                  try {
                    setTemplateVersions(
                      await api.createStyleTemplate({
                        style: newStyle.trim(),
                        content: templateContent.trim(),
                      }),
                    )
                    setModal(null)
                    notify(`已新建风格模板「${newStyle.trim()}」。`)
                  } catch (error) {
                    notify((error as ApiError).message || "新建失败", true)
                  }
                }}
              >
                创建
              </Button>
            </>
          }
        >
          <Field label="风格名称" required>
            <Input value={newStyle} onChange={(e) => setNewStyle(e.target.value)} />
          </Field>
          <Field label="模板内容" required>
            <Textarea
              rows={6}
              value={templateContent}
              onChange={(e) => setTemplateContent(e.target.value)}
            />
          </Field>
        </Modal>
      )}
      {modal === "role-info" && (
        <Modal title="角色与工作空间" onClose={() => setModal(null)}>
          <Notice>
            角色切换会使用对应演示账号重新登录后端。请勿输入真实账号或密码。
          </Notice>
          <Field label="当前角色">
            <Select
              value={role}
              onChange={(e) => {
                switchRole(e.target.value as Role)
                setModal(null)
              }}
            >
              <option>编辑</option>
              <option>主编</option>
              <option>管理员</option>
            </Select>
          </Field>
          <p className="muted">
            编辑：创建、生成与提交；主编：只读与审核；管理员：系统维护、任务生成与审核，不执行人工微调提交。
          </p>
        </Modal>
      )}
    </div>
  )
}

function highlightHits(text: string, hits: SensitiveHit[]) {
  const nodes: ReactNode[] = []
  let cursor = 0
  hits.forEach((h, i) => {
    nodes.push(text.slice(cursor, h.start - 1))
    nodes.push(<mark key={i}>{text.slice(h.start - 1, h.end)}</mark>)
    cursor = h.end
  })
  nodes.push(text.slice(cursor))
  return nodes
}

function VersionPanel({ task }: { task: Task }) {
  const [left, setLeft] = useState(0)
  const [right, setRight] = useState(Math.max(0, task.versions.length - 1))
  const a = task.versions[Math.min(left, task.versions.length - 1)],
    b = task.versions[Math.min(right, task.versions.length - 1)]
  return (
    <>
      <div className="section-heading">
        <div>
          <Heading>版本列表与对比</Heading>
          <p>原始生成版与人工提交版独立保留，审核退回不会删除历史。</p>
        </div>
        <Badge tone="indigo" dot={false}>
          {task.versions.length} 个版本
        </Badge>
      </div>
      {!task.versions.length ? (
        <EmptyState
          title="暂无版本记录"
          description="AI 生成完成后将保存第一个原始版本。"
        />
      ) : (
        <>
          <table className="data-table">
            <thead>
              <tr>
                <th>版本</th>
                <th>版本类型</th>
                <th>操作人</th>
                <th>时间</th>
                <th>理由 / 审核意见</th>
                <th>对比</th>
              </tr>
            </thead>
            <tbody>
              {task.versions.map((v, i) => (
                <tr key={v.id}>
                  <td className="mono">{v.id}</td>
                  <td>
                    <Badge
                      tone={v.name === "原始生成版" ? "neutral" : "indigo"}
                      dot={false}
                    >
                      {v.name}
                    </Badge>
                  </td>
                  <td>{v.user}</td>
                  <td className="time-cell">{v.time}</td>
                  <td>
                    {v.reason}
                    <small>{v.opinion}</small>
                  </td>
                  <td>
                    <Button
                      variant="text"
                      onClick={() => {
                        setRight(i)
                        if (left === i)
                          setLeft(
                            i === 0 ? Math.min(1, task.versions.length - 1) : 0,
                          )
                      }}
                    >
                      对比此版
                    </Button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="version-compare">
            <div className="section-heading">
              <Heading>双栏差异对比</Heading>
              <span>
                <i className="diff-legend diff-deleted" />
                原版内容
                <i className="diff-legend diff-added" />
                修改内容
              </span>
            </div>
            <div className="compare-grid">
              {[a, b].map((v, col) => (
                <section className="comparison-column" key={col}>
                  <div className="comparison-heading">
                    <Select
                      aria-label={col === 0 ? "左侧对比版本" : "右侧对比版本"}
                      value={col === 0 ? left : right}
                      onChange={(e) =>
                        col === 0
                          ? setLeft(+e.target.value)
                          : setRight(+e.target.value)
                      }
                    >
                      {task.versions.map((version, i) => (
                        <option key={version.id} value={i}>
                          {version.id} · {version.name}
                        </option>
                      ))}
                    </Select>
                    <span>{v.user}</span>
                  </div>
                  <div className="version-copy">
                    {diffCopy(
                      v.copy,
                      col === 0 ? b.copy : a.copy,
                      col === 0 ? "deleted" : "added",
                    )}
                  </div>
                  <small>
                    {v.time} · {v.opinion}
                  </small>
                </section>
              ))}
            </div>
          </div>
        </>
      )}
      <div className="acceptance-note">
        AC-06-1 至少两版可查 · AC-06-2 退回保留原版 · AC-06-3 操作留痕完整
      </div>
    </>
  )
}
function diffCopy(text: string, other: string, kind: string) {
  if (text === other) return text
  let prefix = 0,
    suffix = 0
  while (
    prefix < Math.min(text.length, other.length) &&
    text[prefix] === other[prefix]
  )
    prefix++
  while (
    suffix < Math.min(text.length, other.length) - prefix &&
    text[text.length - 1 - suffix] === other[other.length - 1 - suffix]
  )
    suffix++
  return (
    <>
      {text.slice(0, prefix)}
      <mark className={`diff-${kind}`}>
        {text.slice(prefix, text.length - suffix)}
      </mark>
      {suffix > 0 ? text.slice(-suffix) : ""}
    </>
  )
}
