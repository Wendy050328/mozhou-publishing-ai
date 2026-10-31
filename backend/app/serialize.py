import json
from datetime import datetime

from .models import AgentCall, Candidate, Task, Version


def now_text() -> str:
    return datetime.now().strftime("%Y-%m-%d %H:%M")


def styles_of(task: Task) -> list[str]:
    try:
        data = json.loads(task.styles_json or "[]")
        return data if isinstance(data, list) else []
    except json.JSONDecodeError:
        return []


def task_dict(task: Task) -> dict:
    creator = task.creator.name if task.creator else ""
    return {
        "id": task.id,
        "title": task.title,
        "author": task.author,
        "intro": task.intro,
        "contents": task.contents or "",
        "status": task.status,
        "creator": creator,
        "time": task.time,
        "styles": styles_of(task),
        "material": task.material_id or "",
        "selected": task.selected if task.selected is not None else -1,
        "copy": task.copy or "",
        "reason": task.reason or "",
        "batch": task.batch,
        "retries": task.retries,
        "submitted": bool(task.submitted),
        "prompt": task.prompt or "",
        "versions": [version_dict(v) for v in task.versions],
        "candidates": [candidate_dict(c) for c in task.candidates],
    }


def version_dict(v: Version) -> dict:
    return {
        "id": v.vid,
        "name": v.name,
        "copy": v.copy,
        "reason": v.reason,
        "user": v.user,
        "time": v.time,
        "opinion": v.opinion,
    }


def candidate_dict(c: Candidate) -> dict:
    try:
        points = json.loads(c.points_json or "[]")
    except json.JSONDecodeError:
        points = []
    return {
        "title": c.title,
        "label": c.label,
        "headline": c.headline,
        "body": c.body,
        "points": points,
    }


def call_dict(c: AgentCall) -> dict:
    return {
        "id": c.call_id,
        "task": c.task_id,
        "tool": c.tool,
        "params": c.params,
        "summary": c.summary,
        "data": c.data,
        "status": c.status,
        "error": c.error or "—",
        "duration": c.duration,
    }
