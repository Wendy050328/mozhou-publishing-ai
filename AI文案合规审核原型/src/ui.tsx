import {
  useEffect,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react"

export type IconName = "grid" | "tasks" | "review" | "folder" | "template" | "shield" | "users" | "history" | "help" | "chevron" | "down" | "plus" | "search" | "bell" | "download" | "arrow" | "back" | "check" | "close" | "sparkles" | "clock" | "refresh" | "filter" | "calendar" | "file" | "book" | "edit" | "external" | "more" | "info" | "alert" | "lock" | "play" | "code" | "compare" | "upload" | "logout" | "palette" | "settings" | "send"
const paths: Record<IconName, ReactNode> = {
  grid: (
    <>
      <rect x="3" y="3" width="7" height="7" rx="1.5" />
      <rect x="14" y="3" width="7" height="7" rx="1.5" />
      <rect x="3" y="14" width="7" height="7" rx="1.5" />
      <rect x="14" y="14" width="7" height="7" rx="1.5" />
    </>
  ),
  tasks: (
    <>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 4V2h6v2M9 9h6M9 13h6M9 17h4" />
    </>
  ),
  review: (
    <>
      <path d="M13 3H5v18h14v-9M14 3l5 5M10 11l2 2 7-7" />
      <path d="M9 17h6" />
    </>
  ),
  folder: (
    <path d="M3 7V5a2 2 0 0 1 2-2h5l2 3h7a2 2 0 0 1 2 2v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V7h18" />
  ),
  template: (
    <>
      <rect x="3" y="3" width="18" height="18" rx="3" />
      <path d="M3 9h18M9 9v12M6 6h.01M9 6h.01" />
    </>
  ),
  shield: (
    <>
      <path d="M12 3 3 6v6c0 5 9 9 9 9s9-4 9-9V6l-9-3Z" />
      <path d="m8 12 3 3 5-6" />
    </>
  ),
  users: (
    <>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 21v-3a6 6 0 0 1 12 0v3M16 5a3 3 0 0 1 0 6M18 15a5 5 0 0 1 3 5" />
    </>
  ),
  history: (
    <>
      <path d="M3 10a9 9 0 1 1 1 7M3 4v6h6M12 7v5l3 2" />
    </>
  ),
  help: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M9.5 9a2.5 2.5 0 1 1 3.7 2.2c-.8.5-1.2.8-1.2 2.3M12 17h.01" />
    </>
  ),
  chevron: <path d="m9 5 7 7-7 7" />,
  down: <path d="m6 9 6 6 6-6" />,
  plus: <path d="M12 5v14M5 12h14" />,
  search: (
    <>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="m16 16 5 5" />
    </>
  ),
  bell: (
    <>
      <path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </>
  ),
  download: (
    <>
      <path d="M12 3v12m-5-5 5 5 5-5M4 16v5h16v-5" />
    </>
  ),
  arrow: <path d="M4 12h16m-6-6 6 6-6 6" />,
  back: <path d="M20 12H4m6-6-6 6 6 6" />,
  check: <path d="m5 12 4 4L19 6" />,
  close: <path d="m6 6 12 12M6 18 18 6" />,
  sparkles: (
    <>
      <path d="m12 3 2.5 6.5L21 12l-6.5 2.5L12 21l-2.5-6.5L3 12l6.5-2.5L12 3ZM20 2v4m-2-2h4" />
    </>
  ),
  clock: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 7v5l3 2" />
    </>
  ),
  refresh: (
    <>
      <path d="M20 7a9 9 0 0 0-15-2L3 8m0-5v5h5M4 17a9 9 0 0 0 15 2l2-3m0 5v-5h-5" />
    </>
  ),
  filter: (
    <>
      <path d="M4 6h16M4 12h16M4 18h16" />
      <circle cx="8" cy="6" r="2" />
      <circle cx="16" cy="12" r="2" />
      <circle cx="10" cy="18" r="2" />
    </>
  ),
  calendar: (
    <>
      <rect x="3" y="5" width="18" height="16" rx="2" />
      <path d="M7 3v4M17 3v4M3 11h18M8 15h2M14 15h2" />
    </>
  ),
  file: (
    <>
      <path d="M14 3H5v18h14V8l-5-5Zm0 0v6h5M8 13h8M8 17h5" />
    </>
  ),
  book: (
    <>
      <path d="M12 6c-4-3-9-2-9-2v15s5-1 9 2c4-3 9-2 9-2V4s-5-1-9 2Zm0 0v15" />
    </>
  ),
  edit: (
    <>
      <path d="m15 4 5 5M4 20l5-1L21 7l-5-5L4 14v6Z" />
    </>
  ),
  external: (
    <>
      <path d="M14 3h7v7M21 3 11 13M10 4H3v17h17v-7" />
    </>
  ),
  more: (
    <>
      <circle cx="5" cy="12" r="1" />
      <circle cx="12" cy="12" r="1" />
      <circle cx="19" cy="12" r="1" />
    </>
  ),
  info: (
    <>
      <circle cx="12" cy="12" r="9" />
      <path d="M12 11v6M12 7h.01" />
    </>
  ),
  alert: (
    <>
      <path d="m12 3 10 18H2L12 3Z" />
      <path d="M12 9v5M12 17h.01" />
    </>
  ),
  lock: (
    <>
      <rect x="5" y="10" width="14" height="11" rx="2" />
      <path d="M8 10V6a4 4 0 0 1 8 0v4M12 14v3" />
    </>
  ),
  play: <path d="m7 3 14 9-14 9V3Z" />,
  code: (
    <>
      <path d="m7 6-5 6 5 6m10-12 5 6-5 6M14 3l-4 18" />
    </>
  ),
  compare: (
    <>
      <path d="M9 3H3v18h6M15 3h6v18h-6M12 3v18M6 8h3M15 8h3M6 13h3M15 13h3" />
    </>
  ),
  upload: (
    <>
      <path d="M12 16V3m-5 5 5-5 5 5M4 16v5h16v-5" />
    </>
  ),
  logout: (
    <>
      <path d="M9 3H3v18h6M9 12h12m-5-5 5 5-5 5" />
    </>
  ),
  palette: (
    <>
      <circle cx="8" cy="8" r="1" />
      <circle cx="15" cy="7" r="1" />
      <circle cx="6" cy="14" r="1" />
      <path d="M12 3a9 9 0 1 0 0 18c3 0-1-5 2-5h3c7 0 4-13-5-13Z" />
    </>
  ),
  settings: (
    <>
      <path d="m9 3-1 3-3 1-2 4 2 3v4l4 2 3-1 3 1 4-2v-4l2-3-2-4-3-1-1-3H9Z" />
      <circle cx="12" cy="12" r="3" />
    </>
  ),
  send: (
    <>
      <path d="m22 2-7 20-4-9L2 9 22 2ZM11 13 22 2" />
    </>
  ),
}
export function Icon({
  name,
  size = 18,
  className = "",
}: {
  name: IconName
  size?: number
  className?: string
}) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.65"
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
      aria-hidden="true"
    >
      {paths[name]}
    </svg>
  )
}
export function Button({
  children,
  variant = "secondary",
  icon,
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "primary" | "secondary" | "ghost" | "danger" | "text"
  icon?: IconName
}) {
  return (
    <button
      type="button"
      className={`btn btn-${variant} ${className}`}
      {...props}
    >
      {icon && <Icon name={icon} size={16} />}
      {children}
    </button>
  )
}
export function Input({
  className = "",
  ...props
}: InputHTMLAttributes<HTMLInputElement>) {
  return <input className={`input ${className}`} {...props} />
}
export function Textarea({
  className = "",
  ...props
}: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return <textarea className={`input textarea ${className}`} {...props} />
}
export function Select({
  className = "",
  children,
  ...props
}: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <div className={`select-wrap ${className}`}>
      <select className="input select" {...props}>
        {children}
      </select>
      <Icon name="down" size={13} />
    </div>
  )
}
export function Heading({
  children,
  level = 2,
  className = "",
}: {
  children: ReactNode
  level?: 1 | 2 | 3
  className?: string
}) {
  const Tag = `h${level}` as "h1" | "h2" | "h3"
  return (
    <Tag className={`heading heading-${level} ${className}`}>{children}</Tag>
  )
}
export const statuses = [
  "待处理",
  "运行中",
  "待审核",
  "完成",
  "失败",
  "退回",
] as const
export type Status = typeof statuses[number]
export function Badge({
  status,
  children,
  tone,
  dot = true,
}: {
  status?: Status
  children?: ReactNode
  tone?: string
  dot?: boolean
}) {
  const tones = {
    待处理: "neutral",
    运行中: "blue",
    待审核: "amber",
    完成: "green",
    失败: "red",
    退回: "purple",
  }
  return (
    <span
      className={`badge badge-${tone || (status ? tones[status] : "neutral")}`}
    >
      {dot && <span className="status-dot" />}
      {children || status}
    </span>
  )
}
export function Avatar({
  name = "林晓",
  color = "indigo",
  small = false,
}: {
  name?: string
  color?: string
  small?: boolean
}) {
  return (
    <span className={`avatar avatar-${color} ${small ? "avatar-small" : ""}`}>
      {name.slice(-1)}
    </span>
  )
}
export function Field({
  label,
  required,
  error,
  hint,
  children,
}: {
  label: string
  required?: boolean
  error?: string
  hint?: ReactNode
  children: ReactNode
}) {
  return (
    <label className={`field ${error ? "field-error" : ""}`}>
      <span className="field-label">
        {required && <span className="required">*</span>}
        {label}
      </span>
      {children}
      {error ? (
        <span className="field-message error-text">
          <Icon name="info" size={13} />
          {error}
        </span>
      ) : (
        hint && <span className="field-message">{hint}</span>
      )}
    </label>
  )
}
export function Modal({
  title,
  children,
  footer,
  onClose,
  wide = false,
}: {
  title: string
  children: ReactNode
  footer?: ReactNode
  onClose: () => void
  wide?: boolean
}) {
  useEffect(() => {
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose()
      if (e.key === "Tab") {
        const elements = document.querySelectorAll<HTMLElement>(
          ".modal button:not(:disabled), .modal input:not(:disabled), .modal textarea:not(:disabled), .modal select:not(:disabled)",
        )
        const first = elements[0],
          last = elements[elements.length - 1]
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault()
          last?.focus()
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault()
          first?.focus()
        }
      }
    }
    document.addEventListener("keydown", listener)
    const previous = document.activeElement as HTMLElement | null
    const first = document.querySelector<HTMLElement>(".modal button")
    first?.focus()
    return () => {
      document.removeEventListener("keydown", listener)
      previous?.focus()
    }
  }, [])
  return (
    <div className="modal-backdrop" onClick={onClose}>
      <section
        className={`modal ${wide ? "modal-wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label={title}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <Heading>{title}</Heading>
          <Button
            variant="ghost"
            icon="close"
            aria-label="关闭弹窗"
            onClick={onClose}
          />
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </section>
    </div>
  )
}
export function EmptyState({
  type = "empty",
  title,
  description,
  onAction,
}: {
  type?: "empty" | "error" | "loading" | "forbidden"
  title?: string
  description?: string
  onAction?: () => void
}) {
  return (
    <div className={`empty-state empty-${type}`}>
      <div className="empty-illustration">
        <Icon
          name={
            type === "forbidden"
              ? "lock"
              : type === "error"
                ? "alert"
                : type === "loading"
                  ? "refresh"
                  : "folder"
          }
          size={34}
          className={type === "loading" ? "spin" : ""}
        />
      </div>
      <Heading>
        {title ||
          {
            empty: "还没有相关数据",
            error: "数据加载失败",
            loading: "正在加载数据…",
            forbidden: "403 · 暂无访问权限",
          }[type]}
      </Heading>
      <p>
        {description ||
          {
            empty: "试试调整筛选条件，或创建你的第一个任务。",
            error: "网络连接异常，请稍后重试。",
            loading: "正在整理你的工作空间，请稍候。",
            forbidden: "当前角色没有执行此操作的权限，该请求已记录至审计日志。",
          }[type]}
      </p>
      {onAction && (
        <Button icon={type === "error" ? "refresh" : "back"} onClick={onAction}>
          {type === "error" ? "重新加载" : "返回任务列表"}
        </Button>
      )}
    </div>
  )
}
export function Notice({
  children,
  tone = "info",
  icon = "info",
}: {
  children: ReactNode
  tone?: string
  icon?: IconName
}) {
  return (
    <div className={`notice notice-${tone}`}>
      <Icon name={icon} size={17} />
      <div>{children}</div>
    </div>
  )
}
