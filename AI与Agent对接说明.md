# AI 与 Agent 对接说明

这份说明给负责大模型与 Agent 的成员。业务页面、权限、审核和敏感词筛查已经接通。需要替换的只有文案生成这条链路。

实现位置：`backend/app/services/agent_stub.py` 里的 `run_agent()`，以及文件末尾四个尚未实现的工具函数。不要改前端页面，也不要把合规筛查改成模型判断。

## 1. 你要完成的事

编辑点击「发起 AI 处理」或「重新生成」后，后端已经把任务准备好，然后同步调用：

```python
message = run_agent(db, task, simulate_fail=body.simulate_fail, origin_status=origin)
```

`run_agent` 返回的字符串会显示成前端提示。函数返回前必须把候选文案、版本和工具调用写入当前数据库会话。外层 `run_task` 会负责 `commit`，函数内部不要 `commit`，需要中间结果时用 `db.flush()`。

一次成功的生成固定调用下面 4 个工具，并按这个顺序各写一条 `AgentCall`：

1. `read_manuscript`：读取已关联的书稿资料
2. `read_style_template`：读取任务选中的风格模板
3. `check_completeness`：检查信息是否足够生成，不够就停止
4. `generate_copy`：生成恰好 3 组不同的候选文案

`sensitive_scan` 已由 `POST /api/tasks/{id}/scan` 用本地词表完成。生成流程里不要调用它，也不要让模型决定「是否通过合规」。

## 2. 调用前后端已经做完的事

`POST /api/tasks/{task_id}/run` 在进入 `run_agent` 之前会完成这些检查。工具里不要再改权限，也不要自行把次数或重试次数加一。

| 检查 | 不通过时 |
| --- | --- |
| 当前用户是任务创建人，或是管理员。主编不能发起 | 403 |
| 按书名关联资料。优先用 `task_id` 不是本任务的同名资料，否则用本任务自己的同名资料 | 422，字段 `material` |
| 书名、作者、至少一个风格，简介不少于 50 字 | 422，字段 `intro` |
| `retry=true` 且 `task.retries >= 2` | 400，`已达到最大重试次数 R = 2` |
| 本任务已有调用数 `+ 4 > 30` | 400，`已达到单任务调用次数上限 N = 30` |
| 状态属于 `待处理`、`退回`、`待审核`、`失败`、`运行中`。`完成` 不能生成 | 400 |

通过后，接口会先把这些字段写好，再调用你的函数：

- `task.status = "运行中"`
- `task.submitted = False`
- `task.selected = -1`
- `task.batch = "BATCH-00N"`，N 是已有「原始生成版」数量加 1
- 若本次是重试或任务原来就是 `失败`，`task.retries` 已经加 1
- `origin_status` 是进入「运行中」之前的状态。原来是「运行中」时，传入的是 `待处理`

请求体 `RunIn`：

```json
{
  "retry": false,
  "simulate_fail": false,
  "styles": ["温暖治愈", "文学叙事"],
  "material": "MAT-001",
  "prompt": "语气克制，不要写成促销口号"
}
```

`material` 只作展示。真正采用的资料 ID 以 `task.material_id` 为准，因为接口会按书名重新匹配。`styles` 和 `prompt` 在调用前已经写回任务。

前端在请求发出后会播放约 3 秒的步骤动画，等这个接口整个返回后才结束「运行中」。模型调用要放在 `run_agent` 里面，并自己处理超时。单次模型调用超过 30 秒视为失败，不要让 HTTP 请求一直挂着。

## 3. 可以读取的任务与资料

任务表 `tasks`：

| 字段 | 含义 | 生成时怎么用 |
| --- | --- | --- |
| `id` | 如 `TASK-012` | 只作关联，不要改 |
| `title` / `author` | 书名、作者 | 可写入文案，不要编造另一本书 |
| `intro` | 内容简介，至少 50 字 | 主要事实来源 |
| `contents` | 目录，可空 | 可参考，没有就不要虚构章节 |
| `prompt` | 编辑补充提示，可空 | 约束语气和侧重点，不能据此发明书里没有的情节 |
| `styles_json` | 风格名称数组 | 用 `styles_of(task)` 读取 |
| `material_id` | 已关联资料 ID | 用它读取 `materials` |
| `batch` | 本次批次，如 `BATCH-002` | 写入候选和版本 |
| `retries` | 已发生的重试次数 | 只读。上限 2 由接口保证 |

资料表 `materials`，用 `task.material_id` 查询：

| 字段 | 含义 |
| --- | --- |
| `id` | 如 `MAT-012` |
| `title` | 书名，应与任务书名一致 |
| `content` | 书稿摘要 |
| `source` | 来源 |
| `version` | 如 `V1.0` |
| `extra_json` | JSON：`author`、`chapter`（片段出处，可空）、`excerpt`（精选片段，可空） |

风格模板表 `style_templates`：

| 字段 | 含义 |
| --- | --- |
| `tpl_id` | 如 `TPL-001` |
| `style` | 风格名，与任务里的风格对应 |
| `content` | 该风格的写作要求 |
| `version` | 如 `V1.2`。同一 `tpl_id` 可能有多行，取该风格最新的一行 |

种子数据里已有「温暖治愈」「文学叙事」「悬念引导」。编辑还可能选「简洁有力」「生活美学」。找不到模板时，用风格名称本身作为约束，并在 `read_style_template` 的摘要里写明未找到模板。不要因此编造一套新的书籍内容。

## 4. 成功时必须写成什么样

成功后任务必须回到可编辑状态，不能直接变成待审核。待审核只在编辑后来点击「确认并提交审核」时由 `POST /api/tasks/{id}/submit` 设置。

```text
task.selected = -1
task.submitted = False
task.status = "退回"    # 仅当 origin_status == "退回"
task.status = "待处理"  # 其他成功情况
task.time = now_text()
```

如果已有 `name == "人工提交版"` 的版本，不要改 `task.copy` 和 `task.reason`。没有人工提交版时，可以把 `task.copy` 设为第 1 组候选的 `headline + "\n" + body`，供页面预览。`selected` 仍然必须是 `-1`，编辑必须自己点选一条。

候选表 `candidates`：先删除本任务旧候选，再写入恰好 3 条，`idx` 为 0、1、2。

| 字段 | 要求 |
| --- | --- |
| `title` | 任务书名，不要改成另一本书 |
| `label` | 这一组采用的风格名，三组之间应能区分 |
| `headline` | 标题句 |
| `body` | 腰封或简介文案 |
| `points_json` | JSON 字符串数组，每条说明依据来自简介、目录、片段还是编辑提示 |
| `batch` | 当前 `task.batch` |

三组都要能从本次读到的书稿里找到依据。信息里没有的人物、情节、奖项、销量不能写。编辑提示只影响语气和侧重点。`prompt` 非空时，可以在 `points` 里追加一条 `编辑提示：…`，提示过长要截断。

版本表 `versions`：追加一条，不要删除旧版本。

| 字段 | 成功时的值 |
| --- | --- |
| `seq` | 现有版本数 + 1 |
| `vid` | `V{seq}`，如 `V2` |
| `name` | 固定为 `原始生成版` |
| `copy` | 第 1 组候选的 `headline + "\n" + body` |
| `reason` | 说明这是本次生成，带上 `task.batch` |
| `user` | `AI Agent` |
| `time` | `now_text()`，格式 `YYYY-MM-DD HH:MM` |
| `opinion` | `待人工确认` |

返回给前端的 `message` 用中文说明已生成 3 组候选、请选择一条。不要写「已进入待审核」。

## 5. 工具调用记录

沿用 `_add_call()`。它会按该任务已有记录继续编号，`call_id` 形如 `TASK-012-CALL-5`。重试时不要把旧调用删掉。

| 参数 | 约定 |
| --- | --- |
| `tool` | 上面四个名字之一，不要自造同义名称 |
| `params` | 可序列化的 dict。书稿正文不要原样写入，摘要用「书稿摘要，已脱敏」这类说明 |
| `summary` | 给编辑看的一句话结果 |
| `data` | 不超过 200 字。成功时可写资料 ID、模板编号或批次号 |
| `status` | `完成` 或 `失败`。生成过程中不要长期停在 `运行中`，因为整个接口是同步返回的 |
| `error` | 成功写 `—`。失败写下面的错误码，不要写长句 |
| `duration` | 如 `128 ms`、`4.2 s`、`30 s` |

建议记录的参数：

```text
read_manuscript        {"manuscript_id": "MAT-012"}
read_style_template    {"styles": ["温暖治愈", "文学叙事"]}
check_completeness     {"min_length": 50}
generate_copy          {"batch": "BATCH-002", "count": 3, "template": ["温暖治愈"], "prompt": ""}
```

`data` 示例：`MAT-012 · V1.0`、`TPL-001@V1.2`、`BATCH-002`。

信息不足时，写完失败的 `check_completeness` 后立即停止，不要再调用 `generate_copy`，也不要写候选。任务 `status` 设为 `失败`。这种情况不增加 `retries`，接口在进入函数前已经处理过重试次数。

## 6. 失败与错误码

| 场景 | 任务状态 | 候选与版本 | 错误码 | 返回文案 |
| --- | --- | --- | --- | --- |
| `AGENT_MODE=stub`，真实实现尚未接上 | `失败` | 不产生新候选、不产生新版本 | `E-AGENT-TODO` | `E-AGENT-TODO · AI/Agent 尚未实现，任务已置为失败，可稍后重试。` |
| `simulate_fail=true`，页面上的「演示模型超时失败」 | `失败` | 不覆盖已有候选和人工版本。仍写 4 条调用，前 3 条完成，`generate_copy` 失败 | `E-MODEL-01` | `E-MODEL-01 · 模型响应超时，任务失败，可重试。` |
| 模型超时、接口报错、输出无法解析成 3 组 | `失败` | 不写入半成品候选，不新增「原始生成版」 | `E-MODEL-01` | 以 `E-MODEL-01` 开头，说明可以重试 |
| 书稿摘要缺失或短到无法支撑文案 | `失败` | 不调用模型，不写候选 | 记在 `check_completeness` 的 `error`，可用 `E-DATA-01` | 说明缺少哪一项，并写明没有编造内容 |

`simulate_fail=true` 时必须在真正请求模型之前返回。这条路径用于课堂演示，即使真实模型已经接上，也要保留。

前端看到 `task.status == "失败"` 会把 `message` 当作错误提示，并且不会切到候选页。

这些错误码不属于生成流程，不要在 `run_agent` 里使用：

| 错误码 | 归属 |
| --- | --- |
| `E-TOOL-01` | 敏感词工具超时，由筛查接口处理 |
| `E-DATA-01` | 筛查时词库版本不存在。生成阶段只有资料本身缺失时才可以复用这个码 |

## 7. 四个工具的建议签名

文件末尾已有占位，现在调用会抛出 `AgentNotImplementedError`。实现后由 `run_agent` 调用，不要新增一套平行入口。

```python
def tool_read_manuscript(manuscript_id: str) -> dict:
    # 返回 title、content、version、source、author、chapter、excerpt
    # 找不到资料时抛出明确异常，由 run_agent 记为失败

def tool_read_style_template(style_tag: str) -> dict:
    # 返回 tpl_id、style、version、content
    # run_agent 按任务中的每个风格各读一次，对外仍合并成一条 AgentCall

def tool_check_completeness(text: str, min_length: int) -> dict:
    # 返回 {"ok": true/false, "missing": ["简介", "书稿摘要"]}
    # ok 为 false 时 run_agent 停止，不调用 generate_copy

def tool_generate_copy(points: str, template: str, batch_params: dict) -> dict:
    # 返回 {"candidates": [三组]}
    # 每组含 title、label、headline、body、points
    # 超时或无法解析时抛出异常，错误码 E-MODEL-01
```

`points` 应是从书稿中抽出的事实要点，不是模型自由发挥的卖点。`batch_params` 至少包含 `batch`、`count=3`、`styles`、`prompt`。

模型输出若多于或少于 3 组，先在函数内修正或判失败。不要把 1 组或 4 组写进数据库。前端按数组下标选定，选定接口要求下标落在候选长度内，业务要求始终是 3 组。

## 8. 环境变量

| `AGENT_MODE` | 现在的行为 | 接上真实模型后 |
| --- | --- | --- |
| `stub`（默认） | 不调模型，一条失败记录，状态改为失败 | 未配置密钥或尚未发布时保持这个行为 |
| `mock` | 不调模型，写 4 条模拟调用和 3 组占位候选 | 保留，供没有密钥时联调页面 |
| 建议新增 `live` | 尚无此值 | 只有这个值才请求真实模型 |

不要把密钥写进仓库、前端或 `AgentCall.params`。用本机环境变量读取。未设置密钥时退回 `stub`，不要发一个必定失败的外部请求。

当前课堂联调启动方式：

```powershell
cd backend
$env:AGENT_MODE="mock"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

数据库是 `backend/publishing_ai.db`，SQLite。表结构由 SQLAlchemy 创建，没有 Alembic。不要手改已有列的含义。

## 9. 和页面的对应关系

生成成功后，编辑在「修改」页看到：

1. 「候选文案」列出 3 组。每组显示 `label`、`headline`、`body` 和 `points`。
2. 编辑必须点「选定此条」。接口把 `selected` 设为 0、1 或 2，并把 `task.copy` 设为该组的 `headline` 加换行加 `body`。
3. 编辑在「人工微调」里修改文案、填写采用理由。
4. 「敏感词筛查」走本地词表。这一步不是 Agent 的工作。
5. 「确认并提交审核」成功后，状态才变为 `待审核`，`submitted` 变为 `true`。
6. 「Agent 执行记录」按 `seq` 展示 `tool`、`params`、`summary`、`data`、`status`、`error`、`duration`。

主编审核时只看最终提交文案，不看生成过程。因此生成阶段不要把中间推理写进 `task.copy`。

## 10. 不要改的边界

- 不要在生成成功时把状态写成 `待审核` 或 `完成`。
- 不要删除或改写 `人工提交版`，也不要在已有人工提交版时覆盖 `task.copy` 和 `task.reason`。
- 不要在 `run_agent` 里做敏感词判断，不要调用大模型决定是否合规。
- 不要因为模型返回了别的书名就改 `task.title` 或 `task.material_id`。
- 不要把整段书稿、密钥或用户密码写入 `agent_calls`。
- 不要增加第 5 个生成工具。一次生成按 4 次调用计入上限，上限 N = 30，筛查另外再记 1 次。
- 前端 `src/App.tsx` 不需要为了换模型而修改。只要 `/api/tasks/{id}/run` 的返回仍是 `{ task, calls, message }`。

## 11. 自测

1. `AGENT_MODE=stub` 时，发起生成后任务变为 `失败`，执行记录里有 `E-AGENT-TODO`，没有新候选。
2. `AGENT_MODE=mock` 或 `live` 成功时，候选正好 3 条，`selected` 为 `-1`，状态为 `待处理`。原状态是 `退回` 时，成功后仍是 `退回`。
3. 勾选「演示模型超时失败」后，不出现新候选，记录里 `generate_copy` 的错误码是 `E-MODEL-01`，已有人工版本还在。
4. 把简介改到不足 50 字时，请求在进入 `run_agent` 前就被 422 拒绝。把资料摘要清空但简介仍超过 50 字时，由 `check_completeness` 失败，并且没有候选。
5. 连续失败可重试。第 3 次重试被接口拒绝，文案含 `R = 2`。
6. 生成后选定第 2 组，`task.copy` 应等于该组标题句和正文，而不是第 1 组。
7. 提交审核仍由现有提交接口完成。生成接口的响应里 `submitted` 必须是 `false`。
