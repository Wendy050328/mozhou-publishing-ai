import type { Status } from "./ui"

export type Role = "编辑" | "主编" | "管理员"
export type Version = {
  id: string
  name: string
  copy: string
  reason: string
  user: string
  time: string
  opinion: string
}
export type Candidate = {
  title: string
  label: string
  headline: string
  body: string
  points: string[]
}
export type Task = {
  id: string
  title: string
  author: string
  intro: string
  contents?: string
  status: Status
  creator: string
  time: string
  styles: string[]
  material: string
  selected: number
  copy: string
  reason: string
  versions: Version[]
  candidates: Candidate[]
  batch: string
  retries: number
  submitted: boolean
  prompt?: string
}
export type AgentCall = {
  id: string
  task: string
  tool: string
  params: string
  summary: string
  data: string
  status: "完成" | "失败" | "运行中"
  error: string
  duration: string
}
export const intro =
  "本书讲述了普通青年陈默在城市边缘的生活与成长。他在老城区经营一家深夜书店，与不同的读者相遇，在离别、重逢与日常琐事中，重新理解人与城市的关系。作品以温暖细腻的笔触，描绘平凡生活中的微光，探讨孤独、归属与自我和解。"
export const initialCopy =
  "城市再大，总有一盏灯为你而亮。\n在喧嚣的边缘，遇见平凡生活的微光。一个关于相遇、告别与自我和解的温暖故事，陪你找到内心的归处。"
export const originalCopy =
  "城市再大，总有一盏灯为你而亮。\n年度最佳治愈故事，带你遇见平凡生活中的微光。在喧嚣的边缘，重新找到内心的归处。"
export const styleOptions = [
  "温暖治愈",
  "文学叙事",
  "悬念引导",
  "简洁有力",
  "生活美学",
]
const names = [
  ["城市边缘的灯", "李明", "待审核"],
  ["山海之间", "陈远", "运行中"],
  ["时间的褶皱", "周文", "待处理"],
  ["与自己好好相处", "苏宁", "完成"],
  ["消失的第七页", "许言", "失败"],
  ["风从旷野来", "沈青", "退回"],
  ["人间烟火慢慢尝", "林禾", "完成"],
  ["在群星之间", "顾川", "待审核"],
  ["写给明天的信", "许知远", "完成"],
  ["漫长的晴天", "刘佳", "完成"],
  ["沿着河流行走", "宋言", "运行中"],
  ["不被定义的人生", "周文", "待审核"],
  ["山野来信", "苏宁", "完成"],
  ["生活的另一种可能", "陈远", "完成"],
  ["看见时间", "李明", "待处理"],
  ["白日漫游", "沈青", "完成"],
  ["一万次日落", "顾川", "退回"],
  ["远方的回声", "许言", "完成"],
  ["植物的秘密", "林禾", "完成"],
  ["春天的来处", "刘佳", "运行中"],
  ["穿过寂静的森林", "陈远", "待审核"],
  ["万物有时", "宋言", "完成"],
  ["我的小小宇宙", "苏宁", "完成"],
  ["此刻即是生活", "周文", "完成"],
]
export const initialTasks: Task[] = names.map(
  ([title, author, status], index) => ({
    id: `TASK-${String(index + 1).padStart(3, "0")}`,
    title,
    author,
    intro,
    status: status as Status,
    creator: "林晓",
    time: `2025-05-${String(22 - Math.floor(index / 4)).padStart(2, "0")} ${["14:32", "14:18", "13:45", "11:26"][index % 4]}`,
    styles:
      index % 3 === 1 ? ["文学叙事", "悬念引导"] : ["温暖治愈", "文学叙事"],
    material: `MAT-${String(index + 1).padStart(3, "0")}`,
    selected: 0,
    copy: initialCopy,
    reason:
      "采用温暖治愈的表达方式，呼应书稿中“城市微光”与“自我和解”的核心主题，避免夸大宣传。",
    batch: "BATCH-001",
    retries: 0,
    candidates: [],
    submitted: ["待审核", "完成", "退回"].includes(status),
    versions: ["待审核", "完成", "退回", "失败"].includes(status)
      ? [
          {
            id: "V1",
            name: "原始生成版",
            copy: originalCopy,
            reason: "AI 生成 · 温暖治愈",
            user: "AI Agent",
            time: "2025-05-22 14:20",
            opinion: "保留原始生成结果",
          },
          {
            id: "V2",
            name: "人工提交版",
            copy: initialCopy,
            reason: "删除绝对化用语，突出书稿的真实内容。",
            user: "林晓",
            time: "2025-05-22 14:32",
            opinion:
              status === "退回"
                ? "请进一步精炼腰封文案，增强画面感。"
                : status === "完成"
                  ? "文案准确，符合风格规范，同意通过。"
                  : "等待主编审核",
          },
        ]
      : [],
  }),
)
export const otherTask: Task = {
  ...initialTasks[0],
  id: "TASK-025",
  title: "长街有风",
  author: "白芷",
  creator: "陈妍",
  status: "待处理",
  versions: [],
  submitted: false,
}
export function candidateCopies(task: Task) {
  const key = task.material === "MAT-002" ? "山海之间" : task.title
  return [
    {
      title: key,
      label: task.styles[0] || "温暖治愈",
      headline: "城市再大，总有一盏灯为你而亮。",
      body: `在《${key}》的故事里，遇见平凡生活中的微光。在喧嚣的边缘，重新找到内心的归处。`,
      points: [
        "深夜书店与普通人的相遇",
        "孤独、归属与自我和解",
        "温暖细腻的日常叙事",
      ],
    },
    {
      title: key,
      label: task.styles[1] || "文学叙事",
      headline: "把生活的褶皱，写成光的形状。",
      body: `《${key}》以细腻的笔触，记录人与城市的相遇。那些未曾言说的心事，终在字里行间找到回响。`,
      points: [
        "人与城市之间的关系",
        "人物内心的细腻刻画",
        "在离别与重逢中成长",
      ],
    },
    {
      title: key,
      label: "悬念引导",
      headline: "当最后一位读者离开，故事才刚刚开始。",
      body: `在《${key}》中，一间深夜书店，连接着不同的人生。推开这扇门，你会遇见怎样的自己？`,
      points: [
        "以深夜书店构建叙事入口",
        "读者故事与主角命运交织",
        "引导探索与情感共鸣",
      ],
    },
  ]
}
export function initialCalls(task: Task): AgentCall[] {
  if (task.status === "待处理") return []
  return [
    {
      id: "CALL-001",
      task: task.id,
      tool: "read_manuscript",
      params: `{"manuscript_id":"${task.material}"}`,
      summary: "成功读取简介及章节摘要，共 3,218 字",
      data: `${task.material} · V1.0 · 教学书稿`,
      status: "完成",
      error: "—",
      duration: "128 ms",
    },
    {
      id: "CALL-002",
      task: task.id,
      tool: "read_style_template",
      params: JSON.stringify({ styles: task.styles }),
      summary: `已获取 ${task.styles.length} 个风格模板，引用具体版本`,
      data: "TPL-001 · V1.2",
      status: "完成",
      error: "—",
      duration: "86 ms",
    },
    {
      id: "CALL-003",
      task: task.id,
      tool: "check_completeness",
      params: '{"text":"[书稿摘要，已脱敏]","min_length":50}',
      summary: "信息充足，未发现缺失项",
      data: task.material,
      status: "完成",
      error: "—",
      duration: "42 ms",
    },
    {
      id: "CALL-004",
      task: task.id,
      tool: "generate_copy",
      params: `{"points":["城市生活","自我和解"],"template":"TPL-001@V1.2","batch":"${task.batch}","count":3}`,
      summary: "已生成 3 组候选文案及内容提炼要点",
      data: task.batch,
      status: task.status === "失败" ? "失败" : "完成",
      error: task.status === "失败" ? "E-MODEL-01" : "—",
      duration: task.status === "失败" ? "30 s" : "4.2 s",
    },
    ...(task.submitted
      ? [
          {
            id: "CALL-005",
            task: task.id,
            tool: "sensitive_scan",
            params: '{"text":"[提交文案，已脱敏]","dict_version":"DICT-V1"}',
            summary: "命中 0 项，规则判定通过",
            data: "DICT-V1 · 模拟数据",
            status: "完成" as const,
            error: "—",
            duration: "63 ms",
          },
        ]
      : []),
  ]
}
export const acceptance = [
  {
    id: "FR-01",
    title: "任务管理",
    items: [
      "AC-01-1 缺简介不可发起，显示字段级错误",
      "AC-01-2 列表支持按状态过滤",
      "AC-01-3 越权修改被拒，记录模拟 403",
    ],
  },
  {
    id: "FR-02",
    title: "资料、词库与模板",
    items: [
      "AC-02-1 按数据 ID 查看来源与版本",
      "AC-02-2 词库多版本并存，可切换",
      "AC-02-3 模板修改生成新版本，保留旧版",
    ],
  },
  {
    id: "FR-03",
    title: "AI 文案生成",
    items: [
      "AC-03-1 每批严格生成 3 组不同风格候选",
      "AC-03-2 更换书稿或风格，输出与参数变化",
      "AC-03-3 简介不足显示缺失依据，不虚构书目信息",
    ],
  },
  {
    id: "FR-04",
    title: "敏感词合规筛查",
    items: [
      "AC-04-1 命中词高亮且展示字符位置",
      "AC-04-2 切换词库版本可看到不同结果",
      "AC-04-3 工具失败不显示通过",
    ],
  },
  {
    id: "FR-05",
    title: "Agent 执行记录",
    items: [
      "AC-05-1 同任务连续调用多类工具可见",
      "AC-05-2 输入改变，调用参数同步变化",
      "AC-05-3 失败状态、错误码及耗时可查",
    ],
  },
  {
    id: "FR-06",
    title: "人工确认与版本",
    items: [
      "AC-06-1 原始生成版和提交版至少两版可查",
      "AC-06-2 退回后原版本仍保留",
      "AC-06-3 操作人、时间与审核意见完整留痕",
    ],
  },
]
