"""
文案生成 Agent。

AGENT_MODE:
- stub（默认）：不调用模型，写入未实现记录，任务置为失败
- mock：不调用模型，写入模拟工具链与 3 组候选，便于联调选定/审核
- live：由 DeepSeek 逐步选择工具和参数，后端校验后执行。未设置 DEEPSEEK_API_KEY 时退回 stub

密钥只从环境变量读取。对接约定见仓库根目录《AI与Agent对接说明.md》。
"""

from __future__ import annotations

import contextvars
import json
import os
import time
import urllib.error
import urllib.request
from pathlib import Path

from dotenv import load_dotenv
from sqlalchemy.orm import Session

from ..models import AgentCall, Candidate, Material, StyleTemplate, Task, Version
from ..serialize import now_text, styles_of

load_dotenv(Path(__file__).resolve().parents[2] / ".env")

DEEPSEEK_API_URL = "https://api.deepseek.com/chat/completions"
MODEL_TIMEOUT_SECONDS = 30
CALL_LIMIT = 30
MAX_TOOL_ROUNDS = 8
ALLOWED_TOOLS = ("read_manuscript", "read_style_template", "check_completeness", "generate_copy")
_db_ctx: contextvars.ContextVar[Session | None] = contextvars.ContextVar("agent_db", default=None)
_LABELS = ["温暖治愈", "文学叙事", "悬念引导", "简洁有力", "生活美学"]


class AgentNotImplementedError(NotImplementedError):
    pass


class DataMissingError(Exception):
    def __init__(self, code: str, message: str):
        self.code = code
        super().__init__(message)


class ModelCallError(Exception):
    def __init__(self, code: str = "E-MODEL-01"):
        self.code = code
        super().__init__(code)


def record_short_intro(db: Session, task: Task) -> str:
    """简介过短时不调用模型，只在当前任务记一条资料不足失败。"""
    length = len((task.intro or "").strip())
    _add_call(
        db,
        task,
        "check_completeness",
        {"min_length": 50},
        f"信息不足，内容简介仅 {length} 字，少于 50 字。",
        task.material_id or "",
        "失败",
        "E-DATA-01",
        "1 ms",
    )
    task.status = "失败"
    task.submitted = False
    task.time = now_text()
    db.flush()
    return f"E-DATA-01 · 内容简介过短（当前 {length} 字，至少 50 字），未生成文案，也没有编造内容。"


def run_agent(
    db: Session,
    task: Task,
    simulate_fail: bool = False,
    origin_status: str = "待处理",
) -> str:
    mode = os.getenv("AGENT_MODE", "stub").lower()
    if simulate_fail:
        return _fail_model(db, task)
    if mode == "mock":
        return _mock(db, task, origin_status)
    if mode == "live":
        if not os.getenv("DEEPSEEK_API_KEY", "").strip():
            return _stub(db, task)
        return _live(db, task, origin_status)
    return _stub(db, task)


def _next_seq(db: Session, task: Task) -> int:
    last = (
        db.query(AgentCall)
        .filter(AgentCall.task_id == task.id)
        .order_by(AgentCall.seq.desc())
        .first()
    )
    return (last.seq if last else 0) + 1


def _add_call(db: Session, task: Task, tool: str, params: dict, summary: str, data: str, status: str, error: str, duration: str):
    seq = _next_seq(db, task)
    db.add(
        AgentCall(
            task_id=task.id,
            seq=seq,
            call_id=f"{task.id}-CALL-{seq}",
            tool=tool,
            params=json.dumps(params, ensure_ascii=False),
            summary=summary,
            data=data,
            status=status,
            error=error or "—",
            duration=duration,
        )
    )
    db.flush()


def _stub(db: Session, task: Task) -> str:
    _add_call(
        db,
        task,
        "agent_pipeline",
        {
            "task_id": task.id,
            "styles": styles_of(task),
            "material_id": task.material_id,
            "note": "AI/Agent 待实现",
        },
        "AI/Agent 编排尚未实现，未调用大模型。",
        task.material_id or "",
        "失败",
        "E-AGENT-TODO",
        "0 ms",
    )
    task.status = "失败"
    task.time = now_text()
    return "E-AGENT-TODO · AI/Agent 尚未实现，任务已置为失败，可稍后重试。"


def _fail_model(db: Session, task: Task) -> str:
    """演示超时失败，不调用模型，不覆盖已有人工版本。"""
    styles = styles_of(task)
    _add_call(db, task, "read_manuscript", {"manuscript_id": task.material_id}, "读取书稿（模拟失败路径）", f"{task.material_id} · V1.0 · 教学书稿", "完成", "—", "40 ms")
    _add_call(db, task, "read_style_template", {"styles": styles}, "读取风格模板（模拟失败路径）", "TPL · 教学模板", "完成", "—", "30 ms")
    _add_call(db, task, "check_completeness", {"min_length": 50}, "信息检查完成（模拟）", task.material_id or "", "完成", "—", "20 ms")
    _add_call(
        db,
        task,
        "generate_copy",
        {"batch": task.batch, "count": 3},
        "模型响应超时，未生成候选",
        task.batch,
        "失败",
        "E-MODEL-01",
        "30 s",
    )
    task.status = "失败"
    task.time = now_text()
    return "E-MODEL-01 · 模型响应超时，任务失败，可重试。"


def _mock(db: Session, task: Task, origin_status: str = "待处理") -> str:
    styles = styles_of(task) or ["温暖治愈"]
    batch_n = len([v for v in task.versions if v.name == "原始生成版"]) + 1
    task.batch = f"BATCH-{batch_n:03d}"
    _add_call(db, task, "read_manuscript", {"manuscript_id": task.material_id}, "成功读取简介（模拟，非模型）", f"{task.material_id} · V1.0 · 教学书稿", "完成", "—", "128 ms")
    _add_call(db, task, "read_style_template", {"styles": styles}, f"已获取 {len(styles)} 个风格模板（模拟）", "TPL · 教学模板", "完成", "—", "86 ms")
    _add_call(db, task, "check_completeness", {"text": "[书稿摘要，已脱敏]", "min_length": 50}, "信息充足，未发现缺失项（模拟）", task.material_id or "", "完成", "—", "42 ms")
    hint = (task.prompt or "").strip()
    _add_call(
        db,
        task,
        "generate_copy",
        {"batch": task.batch, "count": 3, "template": styles, "prompt": hint},
        "已按编辑提示生成 3 组候选（模拟，非模型输出）" if hint else "已生成 3 组候选（模拟，非模型输出）",
        task.batch,
        "完成",
        "—",
        "4.2 s",
    )

    db.query(Candidate).filter(Candidate.task_id == task.id).delete()
    items = _mock_items(task.title, styles)
    if hint:
        note = hint if len(hint) <= 24 else hint[:24] + "…"
        for item in items:
            item["points"] = [*item["points"], f"编辑提示：{note}"]
    for i, item in enumerate(items):
        db.add(
            Candidate(
                task_id=task.id,
                idx=i,
                title=item["title"],
                label=item["label"],
                headline=item["headline"],
                body=item["body"],
                points_json=json.dumps(item["points"], ensure_ascii=False),
                batch=task.batch,
            )
        )
    text = f"{items[0]['headline']}\n{items[0]['body']}"
    seq = len(task.versions) + 1
    db.add(
        Version(
            task_id=task.id,
            seq=seq,
            vid=f"V{seq}",
            name="原始生成版",
            copy=text,
            reason=f"AI 生成占位 · {task.batch}",
            user="AI Agent",
            time=now_text(),
            opinion="待人工确认",
        )
    )
    has_human = any(v.name in ("人工提交版", "编辑修改版") for v in task.versions)
    if not has_human:
        task.copy = text
    task.selected = -1
    task.submitted = False
    task.status = "退回" if origin_status == "退回" else "待处理"
    task.time = now_text()
    db.flush()
    return "已生成 3 组候选文案（模拟），请选择一条继续。"


_UNSOURCED_CLAIMS = ("国际大奖", "销量第一", "获奖无数", "畅销冠军", "诺贝尔")


def _mock_items(title: str, styles: list[str]) -> list[dict]:
    labels = _labels_for_styles(styles)
    return [
        {
            "title": title,
            "label": labels[0],
            "headline": f"《{title}》里，总有一盏灯为你而亮。",
            "body": f"在《{title}》的故事里，遇见平凡生活中的微光。风格：{labels[0]}。",
            "points": ["依据书稿简介，不编造未提供情节", f"风格 {labels[0]}", "教学模拟生成"],
        },
        {
            "title": title,
            "label": labels[1],
            "headline": f"把《{title}》的褶皱，写成光的形状。",
            "body": f"《{title}》以细腻笔触记录人与故事的相遇。风格：{labels[1]}。",
            "points": ["人物与主题来自简介", f"风格 {labels[1]}", "教学模拟生成"],
        },
        {
            "title": title,
            "label": labels[2],
            "headline": f"翻开《{title}》，故事才刚刚开始。",
            "body": f"《{title}》留下一个入口，邀请读者自己走进去。风格：{labels[2]}。",
            "points": ["不虚构书目信息", f"风格 {labels[2]}", "教学模拟生成"],
        },
    ]


def _require_db() -> Session:
    db = _db_ctx.get()
    if db is None:
        raise RuntimeError("工具需在 run_agent 内调用")
    return db


def _ver_num(version: str) -> float:
    try:
        return float((version or "").lstrip("Vv"))
    except ValueError:
        return 0


def _duration(started: float) -> str:
    ms = (time.perf_counter() - started) * 1000
    if ms < 1000:
        return f"{max(int(ms), 0)} ms"
    seconds = ms / 1000
    if seconds >= 10:
        return f"{seconds:.0f} s"
    return f"{seconds:.1f} s"


def _clip(text: str, limit: int = 200) -> str:
    text = text or ""
    return text if len(text) <= limit else text[: limit - 1] + "…"


def _fact_points(task: Task, manuscript: dict) -> str:
    lines = [
        f"书名：{task.title}",
        f"作者：{task.author}",
        f"内容简介：{(task.intro or '').strip()}",
    ]
    contents = (task.contents or "").strip()
    if contents:
        lines.append(f"目录：{contents}")
    excerpt = (manuscript.get("excerpt") or "").strip()
    if excerpt:
        chapter = (manuscript.get("chapter") or "").strip()
        where = f"（{chapter}）" if chapter else ""
        lines.append(f"精选片段{where}：{excerpt}")
    summary = (manuscript.get("content") or "").strip()
    if summary and summary != (task.intro or "").strip():
        lines.append(f"书稿摘要：{summary}")
    return "\n".join(lines)


def _planned_labels(styles: list[str]) -> list[str]:
    labels: list[str] = []
    for name in [*styles, *_LABELS]:
        if name and name not in labels:
            labels.append(name)
        if len(labels) == 3:
            break
    while len(labels) < 3:
        labels.append(f"方案{len(labels) + 1}")
    return labels


def _labels_for_styles(styles: list[str]) -> list[str]:
    names = [str(style).strip() for style in styles if str(style).strip()]
    if not names:
        return _planned_labels([])
    if len(names) >= 3:
        return names[:3]
    if len(names) == 2:
        return [names[0], names[1], f"{names[0]} + {names[1]}"]
    return [names[0], f"{names[0]}·2", f"{names[0]}·3"]


def _label_allowed(label: str, styles: list[str]) -> bool:
    return any(label == style or label.startswith(f"{style}·") or label.startswith(f"{style} +") for style in styles)


def _extract_chat_text(payload: dict) -> str:
    if not isinstance(payload, dict):
        raise ModelCallError()
    choices = payload.get("choices")
    if not isinstance(choices, list) or not choices or not isinstance(choices[0], dict):
        raise ModelCallError()
    message = choices[0].get("message")
    content = message.get("content") if isinstance(message, dict) else None
    if not isinstance(content, str) or not content.strip():
        raise ModelCallError()
    return content.strip()


def _parse_candidate_payload(text: str) -> list[dict]:
    raw = text.strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        raise ModelCallError()
    try:
        data = json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ModelCallError() from exc
    items = data.get("candidates") if isinstance(data, dict) else None
    if not isinstance(items, list) or len(items) < 3:
        raise ModelCallError()
    return [item for item in items[:3] if isinstance(item, dict)]


def _unsourced_claims(source: str, texts: list[str]) -> list[str]:
    blob = "\n".join(texts)
    basis = source or ""
    return [claim for claim in _UNSOURCED_CLAIMS if claim in blob and claim not in basis]


def _normalize_candidates(items: list[dict], batch_params: dict) -> list[dict]:
    if len(items) < 3:
        raise ModelCallError()
    styles = [str(item).strip() for item in (batch_params.get("styles") or []) if str(item).strip()]
    planned = _labels_for_styles(styles)
    title = str(batch_params.get("title") or "").strip()
    hint = str(batch_params.get("prompt") or "").strip()
    note = hint if len(hint) <= 40 else hint[:40] + "…"
    used: set[str] = set()
    normalized = []
    for index, item in enumerate(items[:3]):
        headline = str(item.get("headline") or "").strip()
        body = str(item.get("body") or "").strip()
        if not headline or not body:
            raise ModelCallError()
        label = str(item.get("label") or "").strip()
        if styles and not _label_allowed(label, styles):
            label = planned[index]
        if not label or label in used:
            label = planned[index] if planned[index] not in used else f"{planned[index]}·{index + 1}"
        used.add(label)
        raw_points = item.get("points")
        if isinstance(raw_points, str):
            raw_points = [raw_points]
        points = [str(point).strip() for point in raw_points or [] if str(point).strip()]
        if not points:
            points = ["依据内容简介，不编造未提供情节"]
        if note and not any(point.startswith("编辑提示：") for point in points):
            points.append(f"编辑提示：{note}")
        conflicts = _unsourced_claims(str(batch_params.get("source") or ""), [headline, body, *points])
        if conflicts:
            raise ModelCallError()
        normalized.append(
            {
                "title": title,
                "label": label,
                "headline": headline,
                "body": body,
                "points": points,
            }
        )
    return normalized


def _build_prompt(points: str, template: str, batch_params: dict) -> str:
    styles = [str(item).strip() for item in (batch_params.get("styles") or []) if str(item).strip()]
    labels = _labels_for_styles(styles)
    hint = str(batch_params.get("prompt") or "").strip()
    extra = f"\n编辑补充提示只影响语气和侧重点，不能据此发明书中没有的情节：{hint}" if hint else ""
    return (
        "你是图书营销文案编辑。只根据给定事实和下面的完整风格要求写腰封文案，不要编造人物、情节、奖项、销量或另一本书。\n"
        f"书名必须使用：{batch_params.get('title') or ''}\n"
        f"批次：{batch_params.get('batch') or ''}\n"
        "请生成恰好 3 组候选。每组的 headline 和 body 都要落实对应风格模板的全部要求，三组语气必须能区分。\n"
        f"label 必须依次是：{'、'.join(labels)}。不要使用这些名称以外的风格。\n\n"
        f"已读取的完整风格要求：\n{template}\n\n"
        f"事实要点（文案依据只能来自这里）：\n{points}{extra}\n\n"
        "只输出 JSON，不要 Markdown。格式："
        '{"candidates":[{"label":"风格名","headline":"标题句","body":"腰封正文","points":["依据简介：……","风格要求：……"]}]}\n'
        "candidates 长度必须是 3。points 要写明依据来自简介、目录、片段、编辑提示，以及用了风格要求中的哪一点。"
    )


def _call_deepseek_messages(messages: list[dict], temperature: float = 0.7) -> str:
    api_key = os.getenv("DEEPSEEK_API_KEY", "").strip()
    if not api_key:
        raise ModelCallError()
    model = os.getenv("DEEPSEEK_MODEL", "deepseek-chat").strip() or "deepseek-chat"
    body = {"model": model, "messages": messages, "stream": False}
    if "reasoner" not in model:
        body["temperature"] = temperature
        body["response_format"] = {"type": "json_object"}
    # v4-pro 默认会长时间思考，文案生成容易超过 30 秒。关闭思考后仍由模型选择工具。
    if "v4" in model:
        body["thinking"] = {"type": "disabled"}
    request = urllib.request.Request(
        os.getenv("DEEPSEEK_API_URL", DEEPSEEK_API_URL).strip() or DEEPSEEK_API_URL,
        data=json.dumps(body, ensure_ascii=False).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=MODEL_TIMEOUT_SECONDS) as response:
            payload = json.loads(response.read().decode("utf-8"))
    except (TimeoutError, urllib.error.URLError, json.JSONDecodeError) as exc:
        raise ModelCallError() from exc
    return _extract_chat_text(payload)


def _call_deepseek(prompt: str) -> str:
    return _call_deepseek_messages(
        [
            {"role": "system", "content": "你是图书营销文案编辑。只输出 JSON 对象，不要 Markdown。"},
            {"role": "user", "content": prompt},
        ]
    )


def _parse_tool_choice(text: str) -> tuple[str, dict]:
    raw = text.strip()
    start = raw.find("{")
    end = raw.rfind("}")
    if start < 0 or end <= start:
        raise ValueError("模型没有返回工具 JSON")
    try:
        data = json.loads(raw[start : end + 1])
    except json.JSONDecodeError as exc:
        raise ValueError("模型返回的工具 JSON 无法解析") from exc
    if not isinstance(data, dict):
        raise ValueError("模型返回的工具 JSON 无法解析")
    name = str(data.get("tool") or data.get("name") or "").strip()
    arguments = data.get("arguments") if "arguments" in data else data.get("args")
    if not isinstance(arguments, dict):
        arguments = {}
    return name, arguments


def _tool_rejection(name: str, arguments: dict, material_id: str, styles: list[str], state: dict) -> str:
    if name not in ALLOWED_TOOLS:
        return "工具不在允许范围内"
    if name == "read_manuscript":
        manuscript_id = str(arguments.get("manuscript_id") or "").strip()
        if manuscript_id != material_id or not material_id:
            return "manuscript_id 必须是当前任务已关联的资料 ID"
        return ""
    if name == "read_style_template":
        style_tag = str(arguments.get("style_tag") or "").strip()
        if style_tag not in styles:
            return "style_tag 必须是当前任务已选择的风格"
        return ""
    if name == "check_completeness":
        if not state.get("manuscript"):
            return "尚未读取书稿，不能检查完整性"
        if arguments.get("min_length") not in (50, "50", 50.0):
            return "min_length 只能是 50"
        return ""
    styles = [str(style).strip() for style in (state.get("styles") or []) if str(style).strip()]
    read_styles = {item.get("style") for item in state.get("templates") or []}
    missing_styles = [style for style in styles if style not in read_styles]
    reasons = []
    if not state.get("manuscript"):
        reasons.append("尚未读取书稿")
    if not state.get("completeness_ok"):
        reasons.append("完整性尚未通过")
    if missing_styles:
        reasons.append("还没有读到这些风格的完整要求：" + "、".join(missing_styles))
    if reasons:
        return "；".join(reasons) + "。请先完成缺失步骤，不要生成"
    if arguments.get("count") not in (3, "3", 3.0):
        return "count 只能是 3"
    batch = str(arguments.get("batch") or "").strip()
    if batch and batch != state.get("batch"):
        return "batch 必须是当前任务批次"
    return ""


def _public_params(name: str, arguments: dict, task: Task) -> dict:
    if name == "read_manuscript":
        return {"manuscript_id": str(arguments.get("manuscript_id") or "")[:32]}
    if name == "read_style_template":
        return {"style_tag": str(arguments.get("style_tag") or "")[:32]}
    if name == "check_completeness":
        return {"min_length": arguments.get("min_length")}
    if name == "generate_copy":
        template = arguments.get("template")
        if isinstance(template, list):
            template = [str(item)[:32] for item in template[:5]]
        elif template is not None:
            template = str(template)[:200]
        prompt = arguments.get("prompt")
        return {
            "batch": task.batch,
            "count": arguments.get("count"),
            "template": template if template is not None else "",
            "prompt": str(prompt)[:80] if prompt is not None else (task.prompt or ""),
        }
    return {}


def _planner_messages(task: Task, styles: list[str]) -> list[dict]:
    hint = (task.prompt or "").strip() or "无"
    return [
        {
            "role": "system",
            "content": (
                "你是出版文案 Agent。每一步只选择一个工具，调用顺序和参数都由你决定。\n"
                "只输出一个 JSON 对象，不要 Markdown。格式："
                '{"tool":"工具名","arguments":{...}}\n'
                "允许的工具只有 read_manuscript、read_style_template、check_completeness、generate_copy。\n"
                "read_manuscript 的 arguments 是 {\"manuscript_id\":\"资料ID\"}。\n"
                "read_style_template 的 arguments 是 {\"style_tag\":\"风格名\"}。\n"
                "check_completeness 的 arguments 是 {\"min_length\":50}。\n"
                "generate_copy 的 arguments 是 {\"count\":3,\"batch\":\"批次号\",\"template\":\"风格要求\",\"prompt\":\"编辑提示\"}。\n"
                "不要调用敏感词筛查，不要编造工具名、书稿内容、人物、情节、奖项或销量。\n"
                "未成功读取书稿前，不要检查完整性，也不要生成。\n"
                "任务列出的每一个风格都要单独调用一次 read_style_template，读到该风格的完整要求后才能生成。\n"
                "不要把风格要求缩写后再写入 generate_copy。完整性结果为不足时，不要再调用 generate_copy。"
            ),
        },
        {
            "role": "user",
            "content": (
                f"任务 {task.id}，书名《{task.title}》，作者 {task.author}。\n"
                f"已关联资料 ID：{task.material_id or ''}。读取书稿时只能使用这个 ID。\n"
                f"必须逐个读完的风格：{'、'.join(styles) if styles else '无'}。每个风格都要调用 read_style_template，不能只读其中一个。\n"
                f"编辑提示：{hint}\n"
                f"批次：{task.batch}。生成数量必须是 3，三条候选都要符合已读到的完整风格要求。\n"
                "请自行选择第一个工具。生成前要确认每个风格的完整要求都已经返回。"
            ),
        },
    ]


def _call_count(db: Session, task: Task) -> int:
    return db.query(AgentCall).filter(AgentCall.task_id == task.id).count()


def _fail_task(db: Session, task: Task, message: str) -> str:
    task.status = "失败"
    task.time = now_text()
    db.flush()
    return message


def _live(db: Session, task: Task, origin_status: str) -> str:
    token = _db_ctx.set(db)
    try:
        return _live_pipeline(db, task, origin_status)
    finally:
        _db_ctx.reset(token)


def _live_pipeline(db: Session, task: Task, origin_status: str) -> str:
    styles = styles_of(task)
    state = {"manuscript": None, "templates": [], "completeness_ok": False, "batch": task.batch, "styles": styles}
    messages = _planner_messages(task, styles)
    invalid = 0
    for _ in range(MAX_TOOL_ROUNDS):
        if _call_count(db, task) >= CALL_LIMIT:
            return _fail_task(db, task, "E-MODEL-01 · 已达到单任务调用次数上限 N = 30。")
        started = time.perf_counter()
        try:
            name, arguments = _parse_tool_choice(_call_deepseek_messages(messages, temperature=0.2))
        except ModelCallError:
            _add_call(
                db,
                task,
                "generate_copy",
                {"batch": task.batch, "count": 3},
                "模型响应超时，未能选择下一步工具。",
                _clip(task.batch),
                "失败",
                "E-MODEL-01",
                _duration(started),
            )
            return _fail_task(db, task, "E-MODEL-01 · 模型响应超时，任务失败，可重试。")
        except ValueError as exc:
            invalid += 1
            _add_call(
                db,
                task,
                "invalid_tool",
                {},
                f"{exc}，未执行。",
                _clip(task.batch),
                "失败",
                "E-MODEL-01",
                _duration(started),
            )
            messages.append({"role": "user", "content": f"上一次调用未执行：{exc}。请重新选择允许的工具和参数。"})
            if invalid >= 3:
                return _fail_task(db, task, "E-MODEL-01 · 模型连续给出无效工具调用，任务失败，可重试。")
            continue

        reason = _tool_rejection(name, arguments, task.material_id or "", styles, state)
        params = _public_params(name, arguments, task)
        if reason:
            invalid += 1
            shown_name = name if name in ALLOWED_TOOLS else _clip(name or "invalid_tool", 64)
            _add_call(db, task, shown_name, params, f"{reason}，未执行。", _clip(task.batch), "失败", "E-MODEL-01", _duration(started))
            messages.append({"role": "user", "content": f"上一次调用未执行：{reason}。请重新选择工具和参数。"})
            if invalid >= 3:
                return _fail_task(db, task, "E-MODEL-01 · 模型连续给出无效工具调用，任务失败，可重试。")
            continue

        invalid = 0
        finished = _run_chosen_tool(db, task, name, arguments, state, origin_status, started)
        if finished is not None:
            return finished
        messages.append({"role": "user", "content": state["observation"] + "请选择下一个工具。"})
    return _fail_task(db, task, "E-MODEL-01 · 模型未在限定步数内完成生成，任务失败，可重试。")


def _run_chosen_tool(
    db: Session,
    task: Task,
    name: str,
    arguments: dict,
    state: dict,
    origin_status: str,
    started: float,
) -> str | None:
    params = _public_params(name, arguments, task)
    if name == "read_manuscript":
        try:
            manuscript = tool_read_manuscript(task.material_id or "")
        except DataMissingError:
            _add_call(
                db,
                task,
                name,
                params,
                "未找到关联书稿，已停止生成。",
                _clip(task.material_id or ""),
                "失败",
                "E-DATA-01",
                _duration(started),
            )
            return _fail_task(db, task, "E-DATA-01 · 未找到关联书稿，没有编造书目内容。")
        state["manuscript"] = manuscript
        _add_call(
            db,
            task,
            name,
            params,
            "已读取书稿摘要。",
            _clip(f"{manuscript['id']} · {manuscript['version']}"),
            "完成",
            "—",
            _duration(started),
        )
        excerpt = manuscript.get("excerpt") or ""
        state["observation"] = (
            f"已读取 {manuscript['id']} {manuscript['version']}。摘要：{_clip(manuscript.get('content') or '', 800)}。"
            f"片段出处：{manuscript.get('chapter') or '无'}。精选片段：{_clip(excerpt, 300) or '无'}。"
        )
        return None

    if name == "read_style_template":
        style_tag = str(arguments.get("style_tag") or "").strip()
        template = tool_read_style_template(style_tag)
        state["templates"] = [item for item in state["templates"] if item["style"] != style_tag]
        state["templates"].append(template)
        found = bool(template["tpl_id"])
        summary = "已读取风格模板。" if found else f"未找到模板：{style_tag}，已改用风格名称作为约束。"
        data = f"{template['tpl_id']}@{template['version']}" if found else "未找到模板"
        _add_call(db, task, name, params, summary, _clip(data), "完成", "—", _duration(started))
        read_styles = {item["style"] for item in state["templates"]}
        missing_styles = [style for style in state.get("styles") or [] if style not in read_styles]
        remaining = (
            f"还未读取：{'、'.join(missing_styles)}。请继续调用 read_style_template，不要缩写要求。"
            if missing_styles
            else "所选风格的完整要求都已返回。"
        )
        state["observation"] = f"{summary}风格「{style_tag}」的完整要求：{template['content']}\n{remaining}"
        return None

    if name == "check_completeness":
        manuscript = state["manuscript"]
        check = tool_check_completeness(manuscript.get("content") or "", 50)
        if not check["ok"]:
            missing_text = "、".join(check["missing"])
            _add_call(
                db,
                task,
                name,
                {"min_length": 50},
                f"信息不足，缺少{missing_text}。",
                _clip(manuscript["id"]),
                "失败",
                "E-DATA-01",
                _duration(started),
            )
            return _fail_task(db, task, f"E-DATA-01 · 缺少{missing_text}，信息不足，未生成文案，也没有编造内容。")
        state["completeness_ok"] = True
        _add_call(db, task, name, {"min_length": 50}, "信息充足，可以生成文案。", _clip(manuscript["id"]), "完成", "—", _duration(started))
        state["observation"] = "完整性检查通过。信息足够生成文案。"
        return None

    hint = (task.prompt or "").strip()
    style_order = state.get("styles") or [item["style"] for item in state["templates"]]
    by_style = {item["style"]: item for item in state["templates"]}
    template_text = "\n".join(
        f"{style}（必须遵守）：{by_style[style]['content']}" for style in style_order if style in by_style
    )
    batch_params = {
        "batch": task.batch,
        "count": 3,
        "styles": list(style_order),
        "prompt": hint,
        "title": task.title,
    }
    try:
        generated = tool_generate_copy(_fact_points(task, state["manuscript"]), template_text, batch_params)
    except ModelCallError:
        _add_call(
            db,
            task,
            name,
            params,
            "模型响应超时或输出无法解析，未生成候选。",
            _clip(task.batch),
            "失败",
            "E-MODEL-01",
            _duration(started),
        )
        return _fail_task(db, task, "E-MODEL-01 · 模型响应超时或输出无法解析，任务失败，可重试。")
    _add_call(
        db,
        task,
        name,
        params,
        "已按完整风格要求生成 3 组候选文案。" if hint else "已生成 3 组候选文案。",
        _clip(task.batch),
        "完成",
        "—",
        _duration(started),
    )
    _store_generation(db, task, generated["candidates"], origin_status)
    return "已生成 3 组候选文案，请选择一条继续。"


def _store_generation(db: Session, task: Task, items: list[dict], origin_status: str) -> None:
    has_human = any(version.name in ("人工提交版", "编辑修改版") for version in task.versions)
    db.query(Candidate).filter(Candidate.task_id == task.id).delete(synchronize_session=False)
    for index, item in enumerate(items):
        db.add(
            Candidate(
                task_id=task.id,
                idx=index,
                title=item["title"],
                label=item["label"],
                headline=item["headline"],
                body=item["body"],
                points_json=json.dumps(item["points"], ensure_ascii=False),
                batch=task.batch,
            )
        )
    text = f"{items[0]['headline']}\n{items[0]['body']}"
    seq = len(task.versions) + 1
    db.add(
        Version(
            task_id=task.id,
            seq=seq,
            vid=f"V{seq}",
            name="原始生成版",
            copy=text,
            reason=f"AI 生成 · {task.batch}",
            user="AI Agent",
            time=now_text(),
            opinion="待人工确认",
        )
    )
    if not has_human:
        task.copy = text
    task.selected = -1
    task.submitted = False
    task.status = "退回" if origin_status == "退回" else "待处理"
    task.time = now_text()
    db.flush()


def tool_read_manuscript(manuscript_id: str) -> dict:
    db = _require_db()
    if not manuscript_id:
        raise DataMissingError("E-DATA-01", "缺少书稿资料")
    item = db.query(Material).filter(Material.id == manuscript_id).first()
    if item is None:
        raise DataMissingError("E-DATA-01", "找不到资料")
    try:
        extra = json.loads(item.extra_json or "{}")
    except json.JSONDecodeError:
        extra = {}
    if not isinstance(extra, dict):
        extra = {}
    return {
        "id": item.id,
        "title": item.title or "",
        "content": item.content or "",
        "version": item.version or "V1.0",
        "source": item.source or "",
        "author": str(extra.get("author") or ""),
        "chapter": str(extra.get("chapter") or ""),
        "excerpt": str(extra.get("excerpt") or ""),
    }


def tool_read_style_template(style_tag: str) -> dict:
    db = _require_db()
    rows = db.query(StyleTemplate).filter(StyleTemplate.style == style_tag).all()
    if not rows:
        return {"tpl_id": "", "style": style_tag, "version": "", "content": style_tag}
    latest = max(rows, key=lambda row: _ver_num(row.version))
    return {
        "tpl_id": latest.tpl_id,
        "style": latest.style,
        "version": latest.version,
        "content": latest.content or style_tag,
    }


def tool_check_completeness(text: str, min_length: int) -> dict:
    missing = ["书稿摘要"] if len((text or "").strip()) < min_length else []
    return {"ok": not missing, "missing": missing}


def tool_generate_copy(points: str, template: str, batch_params: dict) -> dict:
    """调用 DeepSeek 生成恰好 3 组书名与腰封。失败码 E-MODEL-01。"""
    text = _call_deepseek(_build_prompt(points, template, batch_params))
    payload = dict(batch_params)
    payload["source"] = points
    candidates = _normalize_candidates(_parse_candidate_payload(text), payload)
    return {"candidates": candidates}
