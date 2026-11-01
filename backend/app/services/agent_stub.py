"""
AI / Agent 占位。具体编排与大模型调用由其他成员实现。

AGENT_MODE:
- stub（默认）：不调用模型，写入未实现记录，任务置为失败
- mock：不调用模型，写入模拟工具链与 3 组候选，便于联调选定/审核

真实实现请替换 run_agent()，并继续把每次工具调用写入 AgentCall。
对接约定见仓库根目录《AI与Agent对接说明.md》。工具签名见文件末尾。
"""

from __future__ import annotations

import json
import os

from sqlalchemy.orm import Session

from ..models import AgentCall, Candidate, Task, Version
from ..serialize import now_text, styles_of


class AgentNotImplementedError(NotImplementedError):
    pass


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
    has_human = any(v.name == "人工提交版" for v in task.versions)
    if not has_human:
        task.copy = text
    task.selected = -1
    task.submitted = False
    task.status = "退回" if origin_status == "退回" else "待处理"
    task.time = now_text()
    db.flush()
    return "已生成 3 组候选文案（模拟），请选择一条继续。"


def _mock_items(title: str, styles: list[str]) -> list[dict]:
    labels = [
        styles[0] if styles else "温暖治愈",
        styles[1] if len(styles) > 1 else "文学叙事",
        styles[2] if len(styles) > 2 else "悬念引导",
    ]
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


def tool_read_manuscript(manuscript_id: str) -> dict:
    raise AgentNotImplementedError("read_manuscript 待实现")


def tool_read_style_template(style_tag: str) -> dict:
    raise AgentNotImplementedError("read_style_template 待实现")


def tool_check_completeness(text: str, min_length: int) -> dict:
    raise AgentNotImplementedError("check_completeness 待实现")


def tool_generate_copy(points: str, template: str, batch_params: dict) -> dict:
    """应生成 3 组书名+腰封。失败码 E-MODEL-01。"""
    raise AgentNotImplementedError("generate_copy 待实现")
