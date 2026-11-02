# 墨舟 AI 文案生成及合规审核

编辑创建书稿任务，系统读取资料和风格模板，由大模型选择工具生成 3 组腰封文案。编辑选定并完成本地敏感词筛查后提交，主编审核通过或退回。版本和工具调用记录按任务保存。

前端在 `AI文案合规审核原型`（React + Vite）。后端为 FastAPI + SQLite，数据库文件是 `backend/publishing_ai.db`。首次启动会自动建表并写入教学模拟数据。数据均标注为教学用途。

## 已经完成

- 账号与角色：编辑、主编、管理员。创建、生成、提交、审核和查看他人任务由后端校验，越权返回 403。
- 任务管理：保存草稿、修改、删除和列表查询。缺书名、作者、简介或风格时返回字段级提示。
- 资料与模板词库：书稿资料、风格模板和敏感词库保留数据 ID、来源和版本。模板修改生成新版本，不覆盖旧版。词库可多版本并存。书稿可从表单录入，也可导入 `.txt`、`.docx`。
- AI 文案生成：`live` 模式下由 DeepSeek 选择工具和参数，后端校验后执行。工具为 `read_manuscript`、`read_style_template`、`check_completeness`、`generate_copy`。成功时写入恰好 3 组候选和一条「原始生成版」，状态回到待处理；原来是退回则保持退回。
- 资料不足与失败：简介不足 50 字时任务记为失败，错误码 `E-DATA-01`，不生成候选。模型超时或输出无法使用时记 `E-MODEL-01`，不覆盖已有人工版本。单次模型调用超时 30 秒，单任务调用上限 30 次，重试上限 2 次。
- 敏感词筛查：使用本地词表，不由大模型判断是否合规。工具超时记 `E-TOOL-01`，不显示为通过。
- 人工确认与版本：编辑选定一条、修改、填写理由并提交。主编通过或退回，退回意见必填。原始生成版和编辑修改版都可查询、对比。
- 执行记录：按任务 ID 记录工具名、参数、摘要、数据 ID、状态、错误码和耗时。记录中不保存书稿正文和密钥。
- 验收测试：`backend/tests/test_acceptance.py` 覆盖正常生成、必填项缺失、资料不足、工具参数错误、超时、结果依据不一致、越权、重复提交、版本查询和敏感词工具超时。记录见 `backend/tests/验收测试记录.md`。

## 启动

```powershell
cd backend
python -m pip install -r requirements.txt
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
cd AI文案合规审核原型
npm install
npm run dev
```

打开 Vite 提示的本地地址。接口经 `/api` 代理到 `8000`。

## 模型配置与切换

密钥和模型名放在 `backend/.env`，不要写入源码，也不要提交这个文件。修改后需重启后端。

```text
DEEPSEEK_API_KEY=
DEEPSEEK_MODEL=deepseek-v4-flash
DEEPSEEK_API_URL=https://api.deepseek.com/chat/completions
AGENT_MODE=live
```

更换模型时只改 `DEEPSEEK_MODEL`。当前接入的是 DeepSeek 接口，例如 `deepseek-v4-flash` 或 `deepseek-chat`。思考模型容易超过 30 秒，现场演示不建议使用。

| AGENT_MODE | 行为 |
| --- | --- |
| `live` | 调用 `DEEPSEEK_MODEL` 指定的模型。未填写密钥时改为 `stub` |
| `mock` | 不调用模型，写入 3 组模拟候选和工具记录，供页面联调 |
| `stub` | 不调用模型，任务失败，错误码 `E-AGENT-TODO` |

当前终端也可以临时覆盖，只对这一次启动有效：

```powershell
$env:AGENT_MODE="mock"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

## 演示账号

密码均为 `demo123456`

| 邮箱 | 角色 |
| --- | --- |
| linxiao@example.com | 编辑 |
| zhouming@example.com | 主编 |
| wangke@example.com | 管理员 |
| chenyan@example.com | 编辑（另一人任务，用于越权） |

## 测试

```powershell
cd backend
python tests/test_acceptance.py
```

该脚本使用临时数据库和 `mock`。现场验收需要把 `AGENT_MODE` 设为 `live`，演示一次真实模型调用。
