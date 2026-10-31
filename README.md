# 墨舟 AI 文案合规审核

前端使用 `AI文案合规审核原型`（React）。后端为 FastAPI + SQLite。AI / Agent 的真实调用留在 `backend/app/services/agent_stub.py`，由其他成员实现。

## 启动

```powershell
cd backend
python -m pip install -r requirements.txt
# 联调选定/审核时可模拟 3 组候选（不调用大模型）
$env:AGENT_MODE="mock"
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

```powershell
cd AI文案合规审核原型
npm install
npm run dev
```

打开 Vite 提示的本地地址。接口经 `/api` 代理到 `8000`。

## 演示账号

密码均为 `demo123456`

| 邮箱 | 角色 |
|------|------|
| linxiao@example.com | 编辑 |
| zhouming@example.com | 主编 |
| wangke@example.com | 管理员 |
| chenyan@example.com | 编辑（另一人任务，用于越权） |

## AI 占位

| AGENT_MODE | 行为 |
|------------|------|
| `stub`（默认） | 不调模型，任务失败，错误码 `E-AGENT-TODO` |
| `mock` | 不调模型，写入 3 组候选和工具记录，任务进入待审核 |

敏感词筛查是本地词表，不经过大模型。接入说明见 `backend/app/services/agent_stub.py`。
