import { useEffect, useRef, useState, type FormEvent } from "react"
import {
  Badge,
  Button,
  Field,
  Heading,
  Icon,
  Input,
  Notice,
  type IconName,
} from "./ui"
import type { Role } from "./data"

interface DemoAccount {
  role: Role
  email: string
  name: string
  description: string
  icon: IconName
}

const demoAccounts: DemoAccount[] = [
  {
    role: "编辑",
    email: "linxiao@example.com",
    name: "林晓",
    description: "创作与提交",
    icon: "edit",
  },
  {
    role: "主编",
    email: "zhouming@example.com",
    name: "周明",
    description: "审校与定稿",
    icon: "review",
  },
  {
    role: "管理员",
    email: "wangke@example.com",
    name: "王珂",
    description: "配置与管理",
    icon: "settings",
  },
]
const demoPassword = "demo123456"

export default function Login({
  onLogin,
}: {
  onLogin: (role: Role) => void | Promise<void>
}) {
  const [selectedRole, setSelectedRole] = useState<Role>("编辑")
  const account = demoAccounts.find((item) => item.role === selectedRole)!
  const [email, setEmail] = useState(demoAccounts[0].email)
  const [password, setPassword] = useState(demoPassword)
  const [showPassword, setShowPassword] = useState(false)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [showHelp, setShowHelp] = useState(false)
  const [loading, setLoading] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  function fillAccount(next = selectedRole) {
    const preset = demoAccounts.find((item) => item.role === next)!
    setSelectedRole(next)
    setEmail(preset.email)
    setPassword(demoPassword)
    setErrors({})
    setShowHelp(false)
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (loading) return
    const next: Record<string, string> = {}
    if (!email.trim()) next.email = "请输入演示账号"
    else if (email.trim().toLowerCase() !== account.email)
      next.email = `当前角色请使用演示账号 ${account.email}`
    if (!password) next.password = "请输入演示密码"
    else if (password !== demoPassword)
      next.password = "演示密码不正确，请使用 demo123456"
    setErrors(next)
    if (Object.keys(next).length) {
      const field = event.currentTarget.elements.namedItem(
        next.email ? "account" : "password",
      ) as HTMLInputElement | null
      field?.focus()
      return
    }
    setLoading(true)
    Promise.resolve(onLogin(selectedRole))
      .catch((error: Error) => {
        setErrors({ email: error.message || "登录失败，请确认后端已启动" })
        setLoading(false)
      })
  }

  return (
    <main className="login-screen">
      <section className="login-story" aria-label="墨舟 AI 产品介绍">
        <div className="brand login-brand">
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
        <div className="login-story-content">
          <div className="login-eyebrow">
            <span />
            为好内容，开启更多可能
          </div>
          <Heading level={1} className="login-slogan">
            让灵感落笔，
            <br />
            <span>让表达安心。</span>
          </Heading>
          <p className="login-story-description">
            从书稿到文案，从创作到审核。
            <br />让 AI 提升创作效率，让规则守护每一次表达。
          </p>
          <div className="login-preview-wrap" aria-hidden="true">
            <div className="login-preview">
              <div className="login-preview-heading">
                <span>
                  <Icon name="file" size={16} />
                  文案创作任务
                </span>
                <span className="mono">TASK-001</span>
              </div>
              <div className="login-preview-book">
                <span className="login-book-icon">
                  <Icon name="book" size={22} />
                </span>
                <div>
                  <strong>城市边缘的灯</strong>
                  <small>李明 · 书稿资料已关联</small>
                </div>
                <Badge tone="indigo" dot={false}>
                  温暖治愈
                </Badge>
              </div>
              <div className="login-preview-copy">
                <span>
                  <Icon name="sparkles" size={13} />
                  AI 辅助创作
                </span>
                <p>
                  城市再大，
                  <br />
                  总有一盏灯为你而亮。
                </p>
                <div className="login-copy-line" />
                <div className="login-copy-line short" />
              </div>
              <div className="login-preview-steps">
                <span>
                  <Icon name="check" size={13} />
                  资料读取
                </span>
                <i />
                <span>
                  <Icon name="check" size={13} />
                  生成候选
                </span>
                <i />
                <span>
                  <Icon name="shield" size={13} />
                  规则筛查
                </span>
              </div>
            </div>
            <div className="login-verified">
              <span>
                <Icon name="shield" size={19} />
              </span>
              <div>
                <strong>本地规则筛查通过</strong>
                <small>DICT-V1 · 教学模拟数据</small>
              </div>
              <Icon name="check" size={14} />
            </div>
            <span className="login-preview-dot dot-one" />
            <span className="login-preview-dot dot-two" />
          </div>
        </div>
        <div className="login-story-footer">
          <span>
            <Icon name="sparkles" size={15} />
            AI 辅助创作
          </span>
          <i />
          <span>
            <Icon name="shield" size={15} />
            规则合规把关
          </span>
          <i />
          <span>
            <Icon name="history" size={15} />
            全流程可追溯
          </span>
        </div>
        <div className="login-orbit login-orbit-one" />
        <div className="login-orbit login-orbit-two" />
      </section>
      <section className="login-form-side" aria-label="模拟登录">
        <div className="login-environment">
          <span className="environment-label">
            <span />
            教学演示环境
          </span>
          <Badge dot={false}>DEMO</Badge>
        </div>
        <div className="login-form-container">
          <div className="login-form-heading">
            <span className="login-welcome-label">WELCOME BACK</span>
            <Heading level={2}>欢迎回到墨舟</Heading>
            <p>登录工作台，让好内容从这里启航。</p>
          </div>
          <form onSubmit={submit} noValidate aria-busy={loading}>
            <div className="login-role-label">选择演示角色</div>
            <div className="login-roles" role="group" aria-label="选择演示角色">
              {demoAccounts.map((item) => (
                <Button
                  key={item.role}
                  className={`login-role ${
                    selectedRole === item.role ? "login-role-selected" : ""
                  }`}
                  aria-pressed={selectedRole === item.role}
                  disabled={loading}
                  onClick={() => fillAccount(item.role)}
                >
                  <Icon name={item.icon} size={20} />
                  <strong>{item.role}</strong>
                  <small>{item.description}</small>
                  {selectedRole === item.role && (
                    <span className="login-role-check">
                      <Icon name="check" size={9} />
                    </span>
                  )}
                </Button>
              ))}
            </div>
            <div className="login-demo-helper">
              <Icon name="info" size={13} />
              <span>已为你填入{account.name}的教学演示账号</span>
            </div>
            <Field label="演示账号" required error={errors.email}>
              <div className="login-input-wrap">
                <Icon name="users" size={17} />
                <Input
                  aria-label="演示账号"
                  name="account"
                  type="email"
                  autoComplete="off"
                  placeholder="请输入演示账号"
                  value={email}
                  disabled={loading}
                  aria-invalid={!!errors.email}
                  spellCheck={false}
                  onChange={(event) => {
                    setEmail(event.target.value)
                    setErrors({ ...errors, email: "" })
                  }}
                />
              </div>
            </Field>
            <Field label="演示密码" required error={errors.password}>
              <div className="login-input-wrap login-password">
                <Icon name="lock" size={17} />
                <Input
                  aria-label="演示密码"
                  name="password"
                  type={showPassword ? "text" : "password"}
                  autoComplete="off"
                  placeholder="请输入演示密码"
                  value={password}
                  disabled={loading}
                  aria-invalid={!!errors.password}
                  onChange={(event) => {
                    setPassword(event.target.value)
                    setErrors({ ...errors, password: "" })
                  }}
                />
                <Button
                  variant="ghost"
                  className="login-password-toggle"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                  aria-pressed={showPassword}
                  disabled={loading}
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? "隐藏" : "显示"}
                </Button>
              </div>
            </Field>
            <div className="login-password-help">
              <span>
                演示密码：<code>{demoPassword}</code>
              </span>
              <Button
                variant="text"
                disabled={loading}
                onClick={() => setShowHelp(!showHelp)}
              >
                忘记密码？
              </Button>
            </div>
            {showHelp && (
              <Notice>
                教学环境不提供真实密码找回。点击下方「恢复演示账号」即可重新填入当前角色的账号与密码。
              </Notice>
            )}
            <div className="sr-only" role="alert">
              {Object.values(errors).filter(Boolean).join("；")}
            </div>
            <Button
              className="login-submit"
              type="submit"
              variant="primary"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Icon name="refresh" size={17} className="spin" />
                  正在进入工作台…
                </>
              ) : (
                <>
                  登录工作台
                  <Icon name="arrow" size={17} />
                </>
              )}
            </Button>
            <div className="login-reset">
              <span>账号或密码被修改了？</span>
              <Button
                variant="text"
                disabled={loading}
                onClick={() => fillAccount()}
              >
                恢复演示账号
              </Button>
            </div>
          </form>
          <div className="login-safety">
            <Icon name="shield" size={16} />
            <div>
              <strong>教学演示环境，已连接本地后端</strong>
              <p>请使用页面中的演示账号。不要输入真实凭据。</p>
            </div>
          </div>
        </div>
        <footer className="login-footer">
          <span>© 2025 墨舟 AI · 让好内容，被看见。</span>
          <span>前端模拟原型 V1.0</span>
        </footer>
      </section>
    </main>
  )
}
