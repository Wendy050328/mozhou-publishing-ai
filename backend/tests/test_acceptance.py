"""验收场景筛查。使用临时数据库，不读取演示库，也不调用大模型。

在 backend 目录执行：

    python tests/test_acceptance.py
"""

from __future__ import annotations

import os
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DB_PATH = Path(tempfile.mkdtemp(prefix="publishing-ai-test-")) / "acceptance.db"
os.environ["DATABASE_URL"] = "sqlite:///" + DB_PATH.as_posix()
os.environ["AGENT_MODE"] = "mock"
sys.path.insert(0, str(ROOT))

from fastapi.testclient import TestClient  # noqa: E402

from app.main import app  # noqa: E402
from app.services.agent_stub import (  # noqa: E402
    ModelCallError,
    _normalize_candidates,
    _tool_rejection,
)

LONG_INTRO = (
    "验收测试用书稿简介。主人公在城南旧书店遇见一本没有结局的笔记，"
    "由此追查作者留下的三条线索。主题是记忆与原谅，人物包括店主、笔记主人和店主的女儿。"
    "这段文字只作教学模拟，不代表真实出版物。"
)
PASSWORD = "demo123456"
REPORT = Path(__file__).with_name("验收测试记录.md")

results: list[dict] = []


def check(case_id: str, name: str, steps: str, expected: str, ok: bool, actual: str) -> None:
    results.append(
        {
            "id": case_id,
            "name": name,
            "steps": steps,
            "expected": expected,
            "ok": ok,
            "actual": actual,
        }
    )
    print(f"[{'通过' if ok else '失败'}] {case_id} {name} — {actual}")


def auth(token: str) -> dict:
    return {"Authorization": f"Bearer {token}"}


def login(client: TestClient, email: str) -> str:
    response = client.post("/api/auth/login", json={"email": email, "password": PASSWORD})
    if response.status_code != 200:
        raise RuntimeError(f"登录失败 {email}: {response.status_code} {response.text}")
    return response.json()["access_token"]


def create_task(client: TestClient, token: str, title: str, intro: str, styles: list[str] | None = None, author: str = "测试作者") -> dict:
    response = client.post(
        "/api/tasks",
        headers=auth(token),
        json={
            "title": title,
            "author": author,
            "intro": intro,
            "contents": "第一章 旧书店",
            "styles": ["温暖治愈"] if styles is None else styles,
            "generate": False,
        },
    )
    if response.status_code != 200:
        raise RuntimeError(f"创建任务失败 {title}: {response.status_code} {response.text}")
    return response.json()["task"]


def fields_of(response) -> dict:
    detail = response.json().get("detail")
    if isinstance(detail, dict):
        return detail.get("fields") or {}
    return {}


def detail_text(response) -> str:
    detail = response.json().get("detail")
    return detail if isinstance(detail, str) else str(detail)


def sample_candidates(title: str, body: str) -> list[dict]:
    return [
        {
            "label": "温暖治愈",
            "headline": f"《{title}》的灯还亮着",
            "body": body,
            "points": ["依据内容简介"],
        },
        {
            "label": "温暖治愈·2",
            "headline": f"《{title}》留下空白页",
            "body": body,
            "points": ["依据内容简介"],
        },
        {
            "label": "温暖治愈·3",
            "headline": f"《{title}》从旧书店开始",
            "body": body,
            "points": ["依据内容简介"],
        },
    ]


def test_normal(client: TestClient, token: str) -> dict:
    task = create_task(client, token, "验收正常生成", LONG_INTRO)
    response = client.post(
        f"/api/tasks/{task['id']}/run",
        headers=auth(token),
        json={"retry": False, "simulate_fail": False, "styles": ["温暖治愈"], "prompt": ""},
    )
    body = response.json()
    task = body.get("task") or {}
    calls = body.get("calls") or []
    labels = [item.get("label") for item in task.get("candidates") or []]
    tools = [item.get("tool") for item in calls]
    ok = (
        response.status_code == 200
        and task.get("status") == "待处理"
        and task.get("selected") == -1
        and task.get("submitted") is False
        and len(task.get("candidates") or []) == 3
        and all(item.get("title") == "验收正常生成" for item in task["candidates"])
        and labels == ["温暖治愈", "温暖治愈·2", "温暖治愈·3"]
        and tools[:4] == ["read_manuscript", "read_style_template", "check_completeness", "generate_copy"]
        and any(item.get("name") == "原始生成版" for item in task.get("versions") or [])
    )
    check(
        "TC-01",
        "正常生成",
        "编辑创建书名、作者、50 字以上简介和风格，发起 AI 处理。本测试使用 mock，不调用大模型。",
        "返回 3 组候选，书名与所选风格一致，状态为待处理，selected 为 -1，并保留原始生成版。",
        ok,
        f"HTTP {response.status_code}，状态 {task.get('status')}，候选 {len(task.get('candidates') or [])}，标签 {labels}",
    )
    return task


def test_required(client: TestClient, token: str) -> None:
    missing_title = client.post(
        "/api/tasks",
        headers=auth(token),
        json={"title": "  ", "author": "测试作者", "intro": LONG_INTRO, "contents": "", "styles": ["温暖治愈"], "generate": False},
    )
    missing_intro = client.post(
        "/api/tasks",
        headers=auth(token),
        json={"title": "验收缺简介", "author": "测试作者", "intro": "  ", "contents": "", "styles": ["温暖治愈"], "generate": True},
    )
    draft = create_task(client, token, "验收缺字段", LONG_INTRO, styles=[])
    missing_styles = client.post(
        f"/api/tasks/{draft['id']}/run",
        headers=auth(token),
        json={"retry": False, "simulate_fail": False, "styles": [], "prompt": ""},
    )
    client.patch(f"/api/tasks/{draft['id']}", headers=auth(token), json={"author": "", "styles": ["温暖治愈"]})
    missing_author = client.post(
        f"/api/tasks/{draft['id']}/run",
        headers=auth(token),
        json={"retry": False, "simulate_fail": False, "styles": ["温暖治愈"], "prompt": ""},
    )
    ok = (
        missing_title.status_code == 422
        and "title" in fields_of(missing_title)
        and missing_intro.status_code == 422
        and "intro" in fields_of(missing_intro)
        and missing_styles.status_code == 422
        and "styles" in fields_of(missing_styles)
        and missing_author.status_code == 422
        and "author" in fields_of(missing_author)
    )
    check(
        "TC-02",
        "必填项缺失",
        "分别提交空书名、发起时空简介、空风格、空作者。",
        "请求被拒绝并返回对应字段，不创建生成记录。",
        ok,
        " / ".join(
            [
                f"书名 {missing_title.status_code} {fields_of(missing_title)}",
                f"简介 {missing_intro.status_code} {fields_of(missing_intro)}",
                f"风格 {missing_styles.status_code} {fields_of(missing_styles)}",
                f"作者 {missing_author.status_code} {fields_of(missing_author)}",
            ]
        ),
    )


def test_short_intro(client: TestClient, token: str) -> None:
    task = create_task(client, token, "验收资料不足", "只有六个字")
    response = client.post(
        f"/api/tasks/{task['id']}/run",
        headers=auth(token),
        json={"retry": False, "simulate_fail": False, "styles": ["温暖治愈"], "prompt": ""},
    )
    body = response.json()
    task = body.get("task") or {}
    calls = body.get("calls") or []
    failed = [item for item in calls if item.get("error") == "E-DATA-01"]
    ok = (
        response.status_code == 200
        and task.get("status") == "失败"
        and task.get("retries") == 0
        and not task.get("candidates")
        and len(failed) == 1
        and failed[0].get("tool") == "check_completeness"
        and "E-DATA-01" in (body.get("message") or "")
        and not any(item.get("tool") == "generate_copy" for item in calls)
    )
    check(
        "TC-03",
        "资料不足",
        "简介仅 6 字，其余必填项完整，发起 AI 处理。",
        "任务失败，错误码 E-DATA-01，不生成候选，不调用文案生成，不增加重试次数。",
        ok,
        f"HTTP {response.status_code}，状态 {task.get('status')}，重试 {task.get('retries')}，调用 {[item.get('tool') for item in calls]}",
    )


def test_tool_params() -> None:
    state = {
        "manuscript": None,
        "templates": [],
        "completeness_ok": False,
        "batch": "BATCH-001",
        "styles": ["温暖治愈"],
    }
    cases = [
        ("sensitive_scan", {}, "工具不在允许范围内"),
        ("read_manuscript", {"manuscript_id": "MAT-999"}, "manuscript_id"),
        ("read_style_template", {"style_tag": "悬念引导"}, "style_tag"),
        ("check_completeness", {"min_length": 50}, "尚未读取书稿"),
    ]
    mismatches = []
    for name, arguments, fragment in cases:
        reason = _tool_rejection(name, arguments, "MAT-001", ["温暖治愈"], state)
        if fragment not in reason:
            mismatches.append(f"{name}: {reason}")
    state["manuscript"] = {"id": "MAT-001"}
    reason = _tool_rejection("check_completeness", {"min_length": 10}, "MAT-001", ["温暖治愈"], state)
    if "min_length" not in reason:
        mismatches.append(f"min_length: {reason}")
    reason = _tool_rejection("generate_copy", {"count": 3, "batch": "BATCH-001"}, "MAT-001", ["温暖治愈"], state)
    if "完整性" not in reason:
        mismatches.append(f"generate early: {reason}")
    state["completeness_ok"] = True
    state["templates"] = [{"style": "温暖治愈"}]
    reason = _tool_rejection("generate_copy", {"count": 5, "batch": "BATCH-001"}, "MAT-001", ["温暖治愈"], state)
    if "count" not in reason:
        mismatches.append(f"count: {reason}")
    reason = _tool_rejection("generate_copy", {"count": 3, "batch": "BATCH-009"}, "MAT-001", ["温暖治愈"], state)
    if "batch" not in reason:
        mismatches.append(f"batch: {reason}")
    reason = _tool_rejection("read_manuscript", {"manuscript_id": "MAT-001"}, "MAT-001", ["温暖治愈"], state)
    if reason:
        mismatches.append(f"合法读取被拒绝: {reason}")
    check(
        "TC-04",
        "工具参数错误",
        "依次提交未允许工具、错误资料 ID、未选风格、未读稿就检查、错误字数、过早生成、错误数量和错误批次。",
        "非法参数返回拒绝原因且不执行；当前任务的资料 ID 可以被接受。",
        not mismatches,
        "全部拒绝符合预期" if not mismatches else "；".join(mismatches),
    )


def test_timeout(client: TestClient, token: str) -> None:
    fresh = create_task(client, token, "验收模型超时", LONG_INTRO)
    failed = client.post(
        f"/api/tasks/{fresh['id']}/run",
        headers=auth(token),
        json={"retry": False, "simulate_fail": True, "styles": ["温暖治愈"], "prompt": ""},
    )
    failed_task = failed.json().get("task") or {}
    failed_calls = failed.json().get("calls") or []
    fresh_ok = (
        failed.status_code == 200
        and failed_task.get("status") == "失败"
        and not failed_task.get("candidates")
        and any(item.get("tool") == "generate_copy" and item.get("error") == "E-MODEL-01" for item in failed_calls)
        and not any(item.get("name") == "原始生成版" for item in failed_task.get("versions") or [])
    )

    ready = create_task(client, token, "验收超时保留人工版", LONG_INTRO)
    ran = client.post(
        f"/api/tasks/{ready['id']}/run",
        headers=auth(token),
        json={"retry": False, "simulate_fail": False, "styles": ["温暖治愈"], "prompt": ""},
    )
    selected = client.post(f"/api/tasks/{ready['id']}/select", headers=auth(token), json={"index": 0})
    copy = selected.json().get("copy") or ""
    client.post(
        f"/api/tasks/{ready['id']}/scan",
        headers=auth(token),
        json={"text": copy, "rule_version": "DICT-V1", "simulate_timeout": False},
    )
    submitted = client.post(
        f"/api/tasks/{ready['id']}/submit",
        headers=auth(token),
        json={"copy": copy, "reason": "采用第一组，依据来自本次简介。"},
    )
    before = [item.get("name") for item in submitted.json().get("versions") or []]
    again = client.post(
        f"/api/tasks/{ready['id']}/run",
        headers=auth(token),
        json={"retry": True, "simulate_fail": True, "styles": ["温暖治愈"], "prompt": ""},
    )
    after_task = again.json().get("task") or {}
    after_names = [item.get("name") for item in after_task.get("versions") or []]
    kept = "编辑修改版" in before and "编辑修改版" in after_names and after_task.get("status") == "失败"
    check(
        "TC-05",
        "超时",
        "勾选演示模型超时发起一次；另一任务先生成并提交人工版本，再以超时方式重试。",
        "超时任务失败且错误码为 E-MODEL-01，不产生原始生成版；已有人工版本仍在。",
        fresh_ok and kept,
        f"新任务状态 {failed_task.get('status')}；重试后状态 {after_task.get('status')}，版本 {after_names}",
    )


def test_basis() -> None:
    source = "书名：验收依据\n内容简介：城南旧书店与一本没有结局的笔记。"
    params = {"title": "验收依据", "styles": ["温暖治愈"], "prompt": "", "source": source, "batch": "BATCH-001"}
    corrected = _normalize_candidates(sample_candidates("另一本书", "旧书店的灯还亮着。"), params)
    titles_ok = all(item["title"] == "验收依据" for item in corrected)
    conflict = False
    try:
        _normalize_candidates(sample_candidates("验收依据", "本书荣获国际大奖，值得立刻购买。"), params)
    except ModelCallError:
        conflict = True
    check(
        "TC-06",
        "结果依据不一致",
        "一组候选把书名写成另一本书；另一组正文写入资料中没有的“国际大奖”。",
        "书名改回当前任务；无依据的奖项声明被拒绝，不写入候选。",
        titles_ok and conflict and len(corrected) == 3,
        "另一本书已改回「验收依据」，「国际大奖」未写入候选" if titles_ok and conflict else f"改回书名 {titles_ok}，拒绝无依据声明 {conflict}",
    )


def test_forbidden(client: TestClient, owner: str, other: str, chief: str) -> None:
    task = create_task(client, owner, "验收越权", LONG_INTRO)
    chief_create = client.post(
        "/api/tasks",
        headers=auth(chief),
        json={"title": "主编越权创建", "author": "周明", "intro": LONG_INTRO, "contents": "", "styles": ["温暖治愈"], "generate": False},
    )
    other_patch = client.patch(f"/api/tasks/{task['id']}", headers=auth(other), json={"intro": LONG_INTRO + "越权修改"})
    other_run = client.post(
        f"/api/tasks/{task['id']}/run",
        headers=auth(other),
        json={"retry": False, "simulate_fail": False, "styles": ["温暖治愈"], "prompt": ""},
    )
    other_submit = client.post(
        f"/api/tasks/{task['id']}/submit",
        headers=auth(other),
        json={"copy": "越权文案", "reason": "越权理由"},
    )
    editor_review = client.post(
        f"/api/tasks/{task['id']}/review",
        headers=auth(owner),
        json={"approve": True, "opinion": ""},
    )
    other_boot = client.get("/api/bootstrap", headers=auth(other)).json()
    hidden = all(item.get("id") != task["id"] for item in other_boot.get("tasks") or [])
    ok = (
        chief_create.status_code == 403
        and other_patch.status_code == 403
        and other_run.status_code == 403
        and other_submit.status_code == 403
        and editor_review.status_code == 403
        and hidden
    )
    check(
        "TC-07",
        "越权",
        "主编创建任务；另一名编辑修改、生成、提交；任务创建人自己审核；另一名编辑查询任务列表。",
        "上述请求均返回 403，另一名编辑的列表中看不到该任务。",
        ok,
        " / ".join(
            [
                f"主编创建 {chief_create.status_code}",
                f"他人修改 {other_patch.status_code}",
                f"他人生成 {other_run.status_code}",
                f"他人提交 {other_submit.status_code}",
                f"编辑审核 {editor_review.status_code}",
                f"列表隔离 {hidden}",
            ]
        ),
    )


def prepare_submitted(client: TestClient, token: str, title: str) -> dict:
    task = create_task(client, token, title, LONG_INTRO)
    client.post(
        f"/api/tasks/{task['id']}/run",
        headers=auth(token),
        json={"retry": False, "simulate_fail": False, "styles": ["温暖治愈"], "prompt": ""},
    )
    selected = client.post(f"/api/tasks/{task['id']}/select", headers=auth(token), json={"index": 1})
    copy = selected.json().get("copy") or ""
    client.post(
        f"/api/tasks/{task['id']}/scan",
        headers=auth(token),
        json={"text": copy, "rule_version": "DICT-V1", "simulate_timeout": False},
    )
    submitted = client.post(
        f"/api/tasks/{task['id']}/submit",
        headers=auth(token),
        json={"copy": copy, "reason": "选定第二组。依据来自本次书稿简介，未添加奖项或销量。"},
    )
    return submitted.json()


def test_duplicate(client: TestClient, token: str) -> dict:
    task = prepare_submitted(client, token, "验收重复提交")
    before = len(task.get("versions") or [])
    again = client.post(
        f"/api/tasks/{task['id']}/submit",
        headers=auth(token),
        json={"copy": task.get("copy") or "重复文案", "reason": "再次提交"},
    )
    current = client.get("/api/bootstrap", headers=auth(token)).json()
    fresh = next(item for item in current["tasks"] if item["id"] == task["id"])
    ok = (
        task.get("status") == "待审核"
        and task.get("submitted") is True
        and again.status_code == 400
        and "重复提交" in detail_text(again)
        and len(fresh.get("versions") or []) == before
    )
    check(
        "TC-08",
        "重复提交",
        "完成生成、选定、筛查并提交一次后，用同一任务再次提交。",
        "第一次进入待审核；第二次返回 400，版本数量不增加。",
        ok,
        f"首次状态 {task.get('status')}，再次 HTTP {again.status_code} {detail_text(again)}，版本 {before} -> {len(fresh.get('versions') or [])}",
    )
    return fresh


def test_versions(client: TestClient, owner: str, other: str, chief: str, task: dict) -> None:
    owner_boot = client.get("/api/bootstrap", headers=auth(owner)).json()
    chief_boot = client.get("/api/bootstrap", headers=auth(chief)).json()
    other_boot = client.get("/api/bootstrap", headers=auth(other)).json()
    own = next(item for item in owner_boot["tasks"] if item["id"] == task["id"])
    chief_task = next(item for item in chief_boot["tasks"] if item["id"] == task["id"])
    versions = own.get("versions") or []
    names = [item.get("name") for item in versions]
    complete = all(item.get("id") and item.get("user") and item.get("time") for item in versions)
    hidden = all(item.get("id") != task["id"] for item in other_boot.get("tasks") or [])
    same = [item.get("id") for item in chief_task.get("versions") or []] == [item.get("id") for item in versions]
    ok = len(versions) >= 2 and "原始生成版" in names and "编辑修改版" in names and complete and hidden and same
    check(
        "TC-09",
        "版本查询",
        "查询已提交任务的版本，并分别用主编和另一名编辑读取任务列表。",
        "至少两版可查，含操作人与时间；主编可见同一版本，另一名编辑不可见。",
        ok,
        f"版本 {names}，操作人与时间齐全，主编看到同一组版本，另一名编辑不可见" if ok else f"版本 {names}，完整 {complete}，主编一致 {same}，他人不可见 {hidden}",
    )


def test_scan_timeout(client: TestClient, token: str) -> None:
    task = create_task(client, token, "验收筛查超时", LONG_INTRO)
    client.post(
        f"/api/tasks/{task['id']}/run",
        headers=auth(token),
        json={"retry": False, "simulate_fail": False, "styles": ["温暖治愈"], "prompt": ""},
    )
    selected = client.post(f"/api/tasks/{task['id']}/select", headers=auth(token), json={"index": 0})
    response = client.post(
        f"/api/tasks/{task['id']}/scan",
        headers=auth(token),
        json={"text": selected.json().get("copy") or "待检文本", "rule_version": "DICT-V1", "simulate_timeout": True},
    )
    body = response.json()
    scan = body.get("scan") or {}
    task = body.get("task") or {}
    ok = (
        response.status_code == 200
        and task.get("status") == "失败"
        and scan.get("error") == "E-TOOL-01"
        and "通过" not in (body.get("message") or "")
    )
    check(
        "TC-10",
        "敏感词工具超时",
        "选定候选后，以演示超时调用敏感词筛查。",
        "任务失败，错误码 E-TOOL-01，结果不显示为通过。",
        ok,
        f"HTTP {response.status_code}，状态 {task.get('status')}，错误 {scan.get('error')}，提示 {body.get('message')}",
    )


def write_report() -> None:
    ordered = sorted(results, key=lambda item: item["id"])
    passed = sum(1 for item in ordered if item["ok"])
    lines = [
        "# 验收测试记录",
        "",
        "环境：临时 SQLite，`AGENT_MODE=mock`。正常生成、超时和筛查都不调用大模型。演示库 `backend/publishing_ai.db` 未使用。",
        "",
        f"结果：{passed}/{len(results)} 通过。",
        "",
        "## 用例",
        "",
        "| 编号 | 场景 | 结果 | 实际 |",
        "| --- | --- | --- | --- |",
    ]
    for item in ordered:
        actual = item["actual"].replace("|", "/")
        lines.append(f"| {item['id']} | {item['name']} | {'通过' if item['ok'] else '失败'} | {actual} |")
    lines.extend(["", "## 步骤与预期", ""])
    for item in ordered:
        lines.append(f"### {item['id']} {item['name']}")
        lines.append("")
        lines.append(f"步骤：{item['steps']}")
        lines.append("")
        lines.append(f"预期：{item['expected']}")
        lines.append("")
        lines.append(f"实际：{item['actual']}")
        lines.append("")
    lines.extend(
        [
            "## 缺陷与修复",
            "",
            "1. 只选择一个风格时，模拟生成的第 2、3 组会标成没有选中的「文学叙事」「悬念引导」。已改为只使用所选风格的可区分标签。回归用例 TC-01。",
            "2. 模型若把书名写成另一本书，或在正文写入资料中没有的「国际大奖」等依据，原先会把正文原样保存。现已把书名改回当前任务，并拒绝无依据声明，不写入候选。回归用例 TC-06。",
            "3. 已提交任务再次提交时，提示仍是「请先完成编辑」。已改为明确返回「不能重复提交」，并且不新增版本。回归用例 TC-08。",
            "",
            "## 回归",
            "",
            "上述 3 项修复后重新执行本脚本。10 条用例全部通过，未再出现原缺陷。",
            "",
        ]
    )
    if passed != len(results):
        lines.append("本次仍有失败用例，上表「回归」结论需在全部通过后才成立。")
        lines.append("")
    REPORT.write_text("\n".join(lines), encoding="utf-8")


def main() -> int:
    test_tool_params()
    test_basis()
    with TestClient(app) as client:
        editor = login(client, "linxiao@example.com")
        other = login(client, "chenyan@example.com")
        chief = login(client, "zhouming@example.com")
        test_normal(client, editor)
        test_required(client, editor)
        test_short_intro(client, editor)
        test_timeout(client, editor)
        test_forbidden(client, editor, other, chief)
        submitted = test_duplicate(client, editor)
        test_versions(client, editor, other, chief, submitted)
        test_scan_timeout(client, editor)
    write_report()
    failed = [item["id"] for item in results if not item["ok"]]
    print(f"报告：{REPORT}")
    if failed:
        print("失败：" + "、".join(failed))
        return 1
    print(f"全部通过 {len(results)}/{len(results)}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
