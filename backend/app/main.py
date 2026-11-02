import json

from fastapi import Depends, FastAPI, HTTPException
from fastapi.middleware.cors import CORSMiddleware
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from pydantic import BaseModel, Field
from sqlalchemy.orm import Session, joinedload

from .database import Base, SessionLocal, engine, get_db
from .models import (
    AgentCall,
    AuditLog,
    Candidate,
    Material,
    SensitiveWord,
    StyleTemplate,
    Task,
    User,
    Version,
)
from .security import create_token, decode_token, verify_password
from .seed import seed_if_empty
from .serialize import call_dict, now_text, styles_of, task_dict
from .services.agent_stub import record_short_intro, run_agent
from .services.opensource_scan import (
    OSS_LICENSE,
    OSS_NAME,
    OSS_URL,
    OSS_VERSION,
    lexicon_words,
    scan_opensource,
)
from .services.sensitive_scan import DictMissing, scan_text

Base.metadata.create_all(bind=engine)


def _ensure_column(conn, table: str, column: str, ddl: str) -> None:
    rows = conn.exec_driver_sql(f"PRAGMA table_info({table})").fetchall()
    names = {row[1] for row in rows}
    if names and column not in names:
        conn.exec_driver_sql(ddl)


def migrate() -> None:
    with engine.begin() as conn:
        _ensure_column(conn, "materials", "type", "ALTER TABLE materials ADD COLUMN type TEXT DEFAULT '书稿摘要'")
        _ensure_column(conn, "materials", "content", "ALTER TABLE materials ADD COLUMN content TEXT DEFAULT ''")
        _ensure_column(conn, "materials", "source", "ALTER TABLE materials ADD COLUMN source TEXT DEFAULT '教学模拟资料 · 手工录入'")
        _ensure_column(conn, "materials", "version", "ALTER TABLE materials ADD COLUMN version TEXT DEFAULT 'V1.0'")
        _ensure_column(conn, "materials", "task_id", "ALTER TABLE materials ADD COLUMN task_id TEXT")
        _ensure_column(conn, "materials", "extra_json", "ALTER TABLE materials ADD COLUMN extra_json TEXT DEFAULT '{}'")
        _ensure_column(conn, "tasks", "submitted", "ALTER TABLE tasks ADD COLUMN submitted BOOLEAN DEFAULT 0")
        _ensure_column(conn, "tasks", "prompt", "ALTER TABLE tasks ADD COLUMN prompt TEXT DEFAULT ''")

app = FastAPI(title="墨舟 AI 文案合规审核", version="0.2.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)
security = HTTPBearer(auto_error=False)


@app.on_event("startup")
def startup():
    migrate()
    db = SessionLocal()
    try:
        seed_if_empty(db)
        for item in db.query(Material).all():
            try:
                extra = json.loads(item.extra_json or "{}")
            except json.JSONDecodeError:
                extra = {}
            if not isinstance(extra, dict):
                extra = {}
            changed = False
            number = int(item.id[4:]) if item.id.startswith("MAT-") and item.id[4:].isdigit() else 0
            if item.type == "精选片段" and not extra.get("excerpt"):
                extra["excerpt"] = item.content or ""
                changed = True
            if number and number % 5 == 0 and not extra.get("excerpt"):
                extra["excerpt"] = "夜色落在街口，灯还亮着。这是从书稿中摘出的教学片段。"
                extra["chapter"] = extra.get("chapter") or "第三章 · 教学摘录"
                changed = True
            if item.type != "书稿摘要":
                item.type = "书稿摘要"
                changed = True
            if not extra.get("author") and item.task_id:
                task = db.query(Task).filter(Task.id == item.task_id).first()
                if task and task.author:
                    extra["author"] = task.author
                    changed = True
            if "chapter" not in extra:
                extra["chapter"] = ""
                changed = True
            if "excerpt" not in extra:
                extra["excerpt"] = ""
                changed = True
            if changed:
                item.extra_json = json.dumps(extra, ensure_ascii=False)
        db.commit()
    finally:
        db.close()


def current_user(
    creds: HTTPAuthorizationCredentials | None = Depends(security),
    db: Session = Depends(get_db),
) -> User:
    if creds is None:
        raise HTTPException(401, "未登录")
    payload = decode_token(creds.credentials)
    if not payload:
        raise HTTPException(401, "无效令牌")
    user = db.query(User).filter(User.email == payload.get("sub")).first()
    if not user or not user.active:
        raise HTTPException(401, "用户不可用")
    return user


def audit(db: Session, user: User, action: str, obj: str, result: str = "成功"):
    db.add(
        AuditLog(
            user=user.name,
            role=user.role,
            action=action,
            object=obj,
            time=now_text(),
            result=result,
        )
    )


def task_query(db: Session):
    return db.query(Task).options(
        joinedload(Task.creator),
        joinedload(Task.versions),
        joinedload(Task.candidates),
    )


def get_task_or_404(db: Session, task_id: str) -> Task:
    task = task_query(db).filter(Task.id == task_id).first()
    if not task:
        raise HTTPException(404, "任务不存在")
    return task


def ensure_view(db: Session, user: User, task: Task):
    if user.role == "编辑" and task.creator_id != user.id:
        audit(db, user, "查看他人任务", task.id, "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "无权查看他人任务")


def ensure_edit(db: Session, user: User, task: Task, action: str):
    if user.role == "主编" or (user.role == "编辑" and task.creator_id != user.id):
        audit(db, user, action, task.id, "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "无权执行此操作")


def material_dict(item: Material) -> dict:
    try:
        extra = json.loads(item.extra_json or "{}")
    except json.JSONDecodeError:
        extra = {}
    return {
        "id": item.id,
        "title": item.title,
        "content": item.content or "",
        "source": item.source or "",
        "version": item.version or "V1.0",
        "taskId": item.task_id or "",
        "author": extra.get("author", ""),
        "chapter": extra.get("chapter", ""),
        "excerpt": extra.get("excerpt", ""),
        "type": "书稿摘要 · 精选片段" if extra.get("excerpt") else "书稿摘要",
    }


def template_rows(db: Session) -> list[dict]:
    return [
        {
            "rowId": item.id,
            "id": item.tpl_id,
            "style": item.style,
            "content": item.content,
            "version": item.version,
        }
        for item in db.query(StyleTemplate).order_by(StyleTemplate.id.asc()).all()
    ]


def calls_of(db: Session, task_id: str) -> list[dict]:
    rows = (
        db.query(AgentCall)
        .filter(AgentCall.task_id == task_id)
        .order_by(AgentCall.seq.asc())
        .all()
    )
    return [call_dict(c) for c in rows]


def visible_tasks(db: Session, user: User) -> list[Task]:
    q = task_query(db)
    if user.role == "编辑":
        q = q.filter(Task.creator_id == user.id)
    return q.order_by(Task.id.desc()).all()


class LoginIn(BaseModel):
    email: str
    password: str


class TaskIn(BaseModel):
    title: str = ""
    author: str = ""
    intro: str = ""
    contents: str = ""
    styles: list[str] = []
    generate: bool = False


class TaskPatch(BaseModel):
    title: str | None = None
    author: str | None = None
    intro: str | None = None
    contents: str | None = None
    styles: list[str] | None = None
    material: str | None = None
    copy: str | None = None
    reason: str | None = None
    selected: int | None = None
    prompt: str | None = None


class RunIn(BaseModel):
    retry: bool = False
    simulate_fail: bool = False
    styles: list[str] | None = None
    material: str | None = None
    prompt: str | None = None


class SelectIn(BaseModel):
    index: int


class ScanIn(BaseModel):
    text: str
    rule_version: str
    simulate_timeout: bool = False


class SubmitIn(BaseModel):
    copy: str
    reason: str
    rule_version: str = "DICT-V1"


class ReviewIn(BaseModel):
    approve: bool
    opinion: str = ""


class TemplateIn(BaseModel):
    tpl_id: str
    content: str = Field(min_length=1)


class NewTemplateIn(BaseModel):
    style: str = Field(min_length=1)
    content: str = Field(min_length=1)


class MaterialIn(BaseModel):
    title: str = ""
    type: str = "书稿摘要"
    source: str = ""
    version: str = "V1.0"
    content: str = ""
    author: str = ""
    chapter: str = ""
    excerpt: str = ""


class DictIn(BaseModel):
    words: list[str]


class AccountIn(BaseModel):
    role: str | None = None
    active: bool | None = None


class AuditIn(BaseModel):
    action: str
    object: str
    result: str = "成功"


@app.get("/api/health")
def health():
    return {"status": "ok"}


@app.post("/api/auth/login")
def login(body: LoginIn, db: Session = Depends(get_db)):
    user = db.query(User).filter(User.email == body.email.strip().lower()).first()
    if not user or not user.active or not verify_password(body.password, user.password_hash):
        raise HTTPException(401, "账号或密码不正确")
    audit(db, user, "登录", "工作空间")
    db.commit()
    return {
        "access_token": create_token(user.email, user.role),
        "user": {"name": user.name, "email": user.email, "role": user.role},
    }


@app.get("/api/bootstrap")
def bootstrap(db: Session = Depends(get_db), user: User = Depends(current_user)):
    tasks = [task_dict(t) for t in visible_tasks(db, user)]
    ids = [t["id"] for t in tasks]
    call_map: dict[str, list] = {i: [] for i in ids}
    if ids:
        for row in (
            db.query(AgentCall)
            .filter(AgentCall.task_id.in_(ids))
            .order_by(AgentCall.seq.asc())
            .all()
        ):
            call_map.setdefault(row.task_id, []).append(call_dict(row))
    dictionaries: dict[str, list[str]] = {}
    for row in db.query(SensitiveWord).order_by(SensitiveWord.id.asc()).all():
        dictionaries.setdefault(row.rule_version, []).append(row.word)
    templates = template_rows(db)
    materials = [material_dict(item) for item in db.query(Material).order_by(Material.id.asc()).all()]
    accounts = []
    audits = []
    if user.role == "管理员":
        accounts = [
            {"name": u.name, "email": u.email, "role": u.role, "active": u.active}
            for u in db.query(User).order_by(User.id.asc()).all()
        ]
        audits = [
            {
                "user": a.user,
                "role": a.role,
                "action": a.action,
                "object": a.object,
                "time": a.time,
                "result": a.result,
            }
            for a in db.query(AuditLog).order_by(AuditLog.id.desc()).limit(200).all()
        ]
    return {
        "tasks": tasks,
        "calls": call_map,
        "dictionaries": dictionaries,
        "templates": templates,
        "materials": materials,
        "opensource": {
            "version": OSS_VERSION,
            "name": OSS_NAME,
            "license": OSS_LICENSE,
            "url": OSS_URL,
            "words": lexicon_words(),
        },
        "accounts": accounts,
        "audit": audits,
    }


def material_by_title(db: Session, title: str, task_id: str) -> Material | None:
    name = (title or "").strip()
    if not name:
        return None
    rows = [item for item in db.query(Material).order_by(Material.id.asc()).all() if (item.title or "").strip() == name]
    others = [item for item in rows if item.task_id != task_id]
    if others:
        return others[0]
    return rows[0] if rows else None


def _sync_owned_material(db: Session, task: Task) -> None:
    owned = db.query(Material).filter(Material.task_id == task.id).first()
    if not owned:
        return
    owned.title = task.title
    owned.content = task.intro or ""
    try:
        extra = json.loads(owned.extra_json or "{}")
    except json.JSONDecodeError:
        extra = {}
    extra["author"] = task.author or ""
    owned.extra_json = json.dumps(extra, ensure_ascii=False)


@app.post("/api/tasks")
def create_task(body: TaskIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == "主编":
        audit(db, user, "创建任务", "新任务", "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "主编不可创建任务")
    errors = {}
    if not body.title.strip():
        errors["title"] = "请输入书名"
    if body.generate:
        if not body.author.strip():
            errors["author"] = "请输入作者"
        if not body.intro.strip():
            errors["intro"] = "请填写内容简介，不可在缺少简介时发起 AI"
        if not body.styles:
            errors["styles"] = "请至少选择一个风格标签"
    if errors:
        raise HTTPException(422, {"fields": errors})

    last = db.query(Task).order_by(Task.id.desc()).first()
    n = int(last.id.split("-")[1]) + 1 if last else 1
    tid = f"TASK-{n:03d}"
    mid = _next_material_id(db)
    db.add(
        Material(
            id=mid,
            title=body.title.strip(),
            content=body.intro.strip(),
            source="教学模拟资料 · 手工录入",
            version="V1.0",
            task_id=tid,
        )
    )
    task = Task(
        id=tid,
        title=body.title.strip(),
        author=body.author.strip(),
        intro=body.intro.strip(),
        contents=body.contents or "",
        status="待处理",
        creator_id=user.id,
        time=now_text(),
        styles_json=json.dumps(body.styles, ensure_ascii=False),
        material_id=mid,
        selected=-1,
        batch="BATCH-001",
    )
    db.add(task)
    db.flush()
    _sync_owned_material(db, task)
    audit(db, user, "保存并发起 AI" if body.generate else "保存草稿", tid)
    db.commit()
    task = get_task_or_404(db, tid)
    return {"task": task_dict(task), "calls": []}


@app.patch("/api/tasks/{task_id}")
def patch_task(task_id: str, body: TaskPatch, db: Session = Depends(get_db), user: User = Depends(current_user)):
    task = get_task_or_404(db, task_id)
    ensure_edit(db, user, task, "修改任务")
    if body.title is not None:
        task.title = body.title.strip()
    if body.author is not None:
        task.author = body.author.strip()
    if body.intro is not None:
        task.intro = body.intro
    if body.contents is not None:
        task.contents = body.contents
    if body.styles is not None:
        task.styles_json = json.dumps(body.styles, ensure_ascii=False)
    if body.material is not None:
        task.material_id = body.material
    if body.prompt is not None:
        task.prompt = body.prompt.strip()
    drafting = body.copy is not None or body.reason is not None
    if drafting and task.status == "完成":
        raise HTTPException(400, "已完成任务不可修改文案")
    if body.copy is not None:
        task.copy = body.copy
    if body.reason is not None:
        task.reason = body.reason
    if body.selected is not None:
        task.selected = body.selected
    if drafting and task.status == "待审核":
        task.status = "待处理"
        task.submitted = False
    if any(value is not None for value in (body.title, body.author, body.intro)):
        _sync_owned_material(db, task)
    task.time = now_text()
    db.commit()
    return task_dict(get_task_or_404(db, task_id))


@app.delete("/api/tasks/{task_id}")
def delete_task(task_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    task = get_task_or_404(db, task_id)
    if user.role != "编辑" or task.creator_id != user.id:
        audit(db, user, "删除任务", task.id, "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "仅任务创建人可删除")
    if task.status == "完成":
        audit(db, user, "删除任务", task.id, "拒绝 · 已审核通过")
        db.commit()
        raise HTTPException(400, "已审核通过的任务不可删除")
    owned = db.query(Material).filter(Material.task_id == task.id).all()
    owned_ids = [item.id for item in owned]
    if owned_ids:
        for other in db.query(Task).filter(Task.id != task.id, Task.material_id.in_(owned_ids)).all():
            other.material_id = None
    db.query(AgentCall).filter(AgentCall.task_id == task.id).delete(synchronize_session=False)
    db.query(Candidate).filter(Candidate.task_id == task.id).delete(synchronize_session=False)
    db.query(Version).filter(Version.task_id == task.id).delete(synchronize_session=False)
    for item in owned:
        db.delete(item)
    audit(db, user, "删除任务", task.id)
    db.delete(task)
    db.commit()
    return {"deleted": task_id, "materials": owned_ids}


@app.post("/api/tasks/{task_id}/run")
def run_task(task_id: str, body: RunIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    task = get_task_or_404(db, task_id)
    ensure_edit(db, user, task, "发起 AI 处理")
    if body.styles is not None:
        task.styles_json = json.dumps(body.styles, ensure_ascii=False)
    if body.prompt is not None:
        task.prompt = body.prompt.strip()
    matched = material_by_title(db, task.title, task.id)
    if not matched:
        raise HTTPException(422, {"fields": {"material": f"没有与书名「{task.title.strip()}」同名的资料，请先在资料管理中创建。"}})
    task.material_id = matched.id
    intro = (task.intro or "").strip()
    errors = {}
    if not (task.title or "").strip():
        errors["title"] = "请输入书名"
    if not (task.author or "").strip():
        errors["author"] = "请输入作者"
    if not styles_of(task):
        errors["styles"] = "请至少选择一个风格标签"
    if not intro:
        errors["intro"] = "请填写内容简介，不可在缺少简介时发起 AI"
    if errors:
        raise HTTPException(422, {"fields": errors})
    allowed = ["待处理", "退回", "待审核", "失败", "运行中"]
    if task.status not in allowed:
        raise HTTPException(400, "当前任务状态不支持发起生成")
    if len(intro) < 50:
        call_count = db.query(AgentCall).filter(AgentCall.task_id == task.id).count()
        if call_count >= 30:
            raise HTTPException(400, "已达到单任务调用次数上限 N = 30")
        message = record_short_intro(db, task)
        audit(db, user, "重试 AI 任务（保留人工版本）" if body.retry else "发起 AI 处理", task.id, "失败")
        db.commit()
        fresh = get_task_or_404(db, task_id)
        return {"task": task_dict(fresh), "calls": calls_of(db, task_id), "message": message}
    if body.retry and task.retries >= 2:
        raise HTTPException(400, "已达到最大重试次数 R = 2")
    call_count = db.query(AgentCall).filter(AgentCall.task_id == task.id).count()
    if call_count + 4 > 30:
        raise HTTPException(400, "已达到单任务调用次数上限 N = 30")
    origin = task.status if task.status != "运行中" else "待处理"
    if body.retry or task.status == "失败":
        task.retries += 1
    task.status = "运行中"
    task.submitted = False
    task.selected = -1
    batch_n = len([v for v in task.versions if v.name == "原始生成版"]) + 1
    task.batch = f"BATCH-{batch_n:03d}"
    db.flush()
    message = run_agent(db, task, simulate_fail=body.simulate_fail, origin_status=origin)
    audit(db, user, "重试 AI 任务（保留人工版本）" if body.retry else "发起 AI 处理", task.id, "成功" if task.status != "失败" else "失败")
    db.commit()
    fresh = get_task_or_404(db, task_id)
    return {"task": task_dict(fresh), "calls": calls_of(db, task_id), "message": message}


@app.post("/api/tasks/{task_id}/select")
def select_candidate(task_id: str, body: SelectIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    task = get_task_or_404(db, task_id)
    ensure_edit(db, user, task, "选定候选文案")
    if body.index < 0 or body.index >= len(task.candidates):
        raise HTTPException(422, {"fields": {"index": "请从 3 组候选中选定一条"}})
    if task.status == "完成":
        raise HTTPException(400, "已完成任务不可改选候选")
    cand = task.candidates[body.index]
    task.selected = body.index
    task.copy = f"{cand.headline}\n{cand.body}"
    originals = [v for v in task.versions if v.name == "原始生成版"]
    if originals:
        latest = originals[-1]
        latest.copy = task.copy
        latest.reason = f"AI 生成 · {task.batch or 'BATCH'} · 已选定方案 {body.index + 1}（{cand.label}）"
        latest.opinion = "已选定，待人工微调"
    if task.status == "待审核":
        task.status = "待处理"
        task.submitted = False
    task.time = now_text()
    audit(db, user, "选定候选文案", f"{task.id} · 方案 {body.index + 1}")
    db.commit()
    return task_dict(get_task_or_404(db, task_id))


@app.post("/api/tasks/{task_id}/scan")
def scan_task(task_id: str, body: ScanIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    task = get_task_or_404(db, task_id)
    ensure_edit(db, user, task, "发起合规筛查")
    if task.selected < 0:
        raise HTTPException(400, "请先选定一组候选文案，再进行合规筛查。")
    if not task.versions:
        raise HTTPException(400, "请先完成 AI 生成并选择候选文案。")
    if not body.text.strip():
        raise HTTPException(400, "请输入待检文本。")
    if db.query(AgentCall).filter(AgentCall.task_id == task.id).count() >= 30:
        raise HTTPException(400, "已达到单任务调用次数上限 N = 30")

    error = ""
    hits = []
    source_label = f"{body.rule_version} · 模拟数据"
    if body.simulate_timeout:
        error = "E-TOOL-01"
    elif body.rule_version == OSS_VERSION:
        hits = scan_opensource(body.text)
        source_label = f"{OSS_VERSION} · Sensitive-lexicon 广告类词表"
    else:
        try:
            result = scan_text(db, body.text, body.rule_version)
            hits = result["hits"]
        except DictMissing:
            error = "E-DATA-01"

    seq = db.query(AgentCall).filter(AgentCall.task_id == task.id).count() + 1
    db.add(
        AgentCall(
            task_id=task.id,
            seq=seq,
            call_id=f"{task.id}-CALL-{seq}",
            tool="sensitive_scan",
            params=json.dumps({"text": "[待检文本，已脱敏]", "dict_version": body.rule_version}, ensure_ascii=False),
            summary="工具未成功执行，不能判定通过" if error else f"命中 {len(hits)} 项 · {'不通过' if hits else '通过'}",
            data=source_label,
            status="失败" if error else "完成",
            error=error or "—",
            duration="30 s" if body.simulate_timeout else "63 ms",
        )
    )
    if error:
        task.status = "失败"
        message = f"{error} · {'词库版本不存在' if error == 'E-DATA-01' else '本地规则工具超时'}，任务已置为失败。"
    else:
        if task.status == "失败":
            task.status = "待处理"
        message = f"发现 {len(hits)} 处敏感词，请修改后重新筛查。" if hits else "本地规则工具筛查完成，未发现敏感词。筛查不会提交审核。"
        if not hits:
            draft_text = body.text.strip()
            human_names = ("编辑修改版", "人工提交版")
            draft = next((v for v in reversed(task.versions) if v.name in human_names), None)
            reason = (task.reason or "").strip() or "人工微调后敏感词筛查通过"
            if draft and not task.submitted and task.status in ("待处理", "退回", "失败"):
                draft.copy = draft_text
                draft.user = user.name
                draft.time = now_text()
                draft.reason = reason
                draft.opinion = "敏感词筛查通过，待确认提交"
                draft.name = "编辑修改版"
            else:
                seq = len(task.versions) + 1
                db.add(
                    Version(
                        task_id=task.id,
                        seq=seq,
                        vid=f"V{seq}",
                        name="编辑修改版",
                        copy=draft_text,
                        reason=reason,
                        user=user.name,
                        time=now_text(),
                        opinion="敏感词筛查通过，待确认提交",
                    )
                )
    task.time = now_text()
    audit(db, user, "本地规则敏感词筛查", f"{task.id} · {body.rule_version}", error or ("不通过" if hits else "通过"))
    db.commit()
    fresh = get_task_or_404(db, task_id)
    return {
        "task": task_dict(fresh),
        "calls": calls_of(db, task_id),
        "scan": {
            "done": True,
            "error": error,
            "hits": hits,
            "version": body.rule_version,
            "text": body.text,
        },
        "message": message,
    }


@app.post("/api/tasks/{task_id}/submit")
def submit_task(task_id: str, body: SubmitIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    task = get_task_or_404(db, task_id)
    if user.role != "编辑" or task.creator_id != user.id:
        audit(db, user, "人工微调提交", task.id, "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "无权提交")
    if task.submitted or task.status == "待审核":
        raise HTTPException(400, "该任务已提交审核，不能重复提交。")
    if task.status not in ("待处理", "退回"):
        raise HTTPException(400, "只有确认并提交审核后才会进入待审核。请先完成编辑。")
    errors = {}
    if not body.copy.strip():
        errors["copy"] = "请输入提交文案"
    if not body.reason.strip():
        errors["reason"] = "请填写采用理由"
    if task.selected < 0:
        errors["selected"] = "请先选定一条候选文案"
    if errors:
        raise HTTPException(422, {"fields": errors})
    human_names = ("编辑修改版", "人工提交版")
    draft = next((v for v in reversed(task.versions) if v.name in human_names), None)
    if draft and not task.submitted:
        draft.copy = body.copy
        draft.reason = body.reason.strip()
        draft.user = user.name
        draft.time = now_text()
        draft.opinion = "等待主编审核"
        draft.name = "编辑修改版"
        vid = draft.vid
    else:
        seq = len(task.versions) + 1
        vid = f"V{seq}"
        db.add(
            Version(
                task_id=task.id,
                seq=seq,
                vid=vid,
                name="编辑修改版",
                copy=body.copy,
                reason=body.reason.strip(),
                user=user.name,
                time=now_text(),
                opinion="等待主编审核",
            )
        )
    task.copy = body.copy
    task.reason = body.reason.strip()
    task.status = "待审核"
    task.submitted = True
    task.time = now_text()
    audit(db, user, "提交人工修改版本", f"{task.id} · {vid}")
    db.commit()
    return task_dict(get_task_or_404(db, task_id))


@app.post("/api/tasks/{task_id}/review")
def review_task(task_id: str, body: ReviewIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    task = get_task_or_404(db, task_id)
    if user.role not in ("主编", "管理员"):
        audit(db, user, "审核任务", task.id, "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "无权审核")
    if task.status != "待审核" or not task.submitted:
        raise HTTPException(400, "仅可审核已人工确认提交的待审核任务。")
    if not body.approve and not body.opinion.strip():
        raise HTTPException(422, {"fields": {"opinion": "退回意见不能为空，请说明需要修改的内容。"}})
    opinion = body.opinion.strip() or "文案内容准确、规则筛查通过，同意发布。"
    if task.versions:
        last = task.versions[-1]
        last.opinion = f"{user.name} · {now_text()} · {opinion}"
    task.status = "完成" if body.approve else "退回"
    task.time = now_text()
    audit(db, user, "审核通过" if body.approve else "退回修改", task.id)
    db.commit()
    return task_dict(get_task_or_404(db, task_id))


@app.post("/api/templates")
def create_template(body: TemplateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != "管理员":
        audit(db, user, "创建模板新版本", body.tpl_id, "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "仅管理员可维护模板")
    rows = db.query(StyleTemplate).filter(StyleTemplate.tpl_id == body.tpl_id).all()
    if not rows:
        raise HTTPException(404, "模板不存在")
    def ver_num(v: str) -> float:
        try:
            return float(v.lstrip("Vv"))
        except ValueError:
            return 0
    latest = max(rows, key=lambda r: ver_num(r.version))
    new_version = f"V{(ver_num(latest.version) + 0.1):.1f}"
    if any(r.version == new_version for r in rows):
        raise HTTPException(400, "该后续版本已存在，请从最新版本继续创建。")
    db.add(
        StyleTemplate(
            tpl_id=latest.tpl_id,
            style=latest.style,
            content=body.content.strip(),
            version=new_version,
        )
    )
    audit(db, user, "创建模板新版本", f"{latest.tpl_id} · {new_version}")
    db.commit()
    return template_rows(db)


@app.post("/api/templates/new")
def create_style(body: NewTemplateIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != "管理员":
        audit(db, user, "新建风格模板", body.style, "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "仅管理员可维护模板")
    existing = [row.tpl_id for row in db.query(StyleTemplate.tpl_id).distinct()]
    nums = []
    for tpl_id in existing:
        if tpl_id.startswith("TPL-") and tpl_id[4:].isdigit():
            nums.append(int(tpl_id[4:]))
    tpl_id = f"TPL-{(max(nums) if nums else 0) + 1:03d}"
    db.add(StyleTemplate(tpl_id=tpl_id, style=body.style.strip(), content=body.content.strip(), version="V1.0"))
    audit(db, user, "新建风格模板", f"{tpl_id} · {body.style.strip()}")
    db.commit()
    return template_rows(db)


@app.delete("/api/templates/{row_id}")
def delete_template(row_id: int, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != "管理员":
        audit(db, user, "删除风格模板", str(row_id), "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "仅管理员可维护模板")
    item = db.query(StyleTemplate).filter(StyleTemplate.id == row_id).first()
    if not item:
        raise HTTPException(404, "模板不存在")
    label = f"{item.tpl_id} · {item.version}"
    db.delete(item)
    audit(db, user, "删除风格模板", label)
    db.commit()
    return template_rows(db)


@app.post("/api/dictionaries")
def create_dictionary(body: DictIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != "管理员":
        audit(db, user, "创建敏感词库版本", "SensitiveDict", "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "仅管理员可维护词库")
    words = []
    for w in body.words:
        w = w.strip()
        if w and w not in words:
            words.append(w)
    if not words:
        raise HTTPException(422, {"fields": {"words": "请填写词条"}})
    versions = {row.rule_version for row in db.query(SensitiveWord.rule_version).distinct()}
    nums = []
    for v in versions:
        if v.startswith("DICT-V") and v[6:].isdigit():
            nums.append(int(v[6:]))
    version = f"DICT-V{max(nums or [0]) + 1}"
    for word in words:
        db.add(SensitiveWord(word=word, rule_version=version, source_note="模拟数据"))
    audit(db, user, "发布模拟敏感词库版本", version)
    db.commit()
    dictionaries: dict[str, list[str]] = {}
    for row in db.query(SensitiveWord).order_by(SensitiveWord.id.asc()).all():
        dictionaries.setdefault(row.rule_version, []).append(row.word)
    return {"version": version, "dictionaries": dictionaries}


@app.patch("/api/accounts/{email}")
def update_account(email: str, body: AccountIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role != "管理员":
        raise HTTPException(403, "仅管理员可维护账号")
    target = db.query(User).filter(User.email == email).first()
    if not target:
        raise HTTPException(404, "账号不存在")
    if target.id == user.id:
        raise HTTPException(400, "不可修改当前登录账号")
    if body.role is not None:
        if body.role not in ("编辑", "主编", "管理员"):
            raise HTTPException(400, "角色无效")
        target.role = body.role
        audit(db, user, "更新账号角色", target.name)
    if body.active is not None:
        target.active = body.active
        audit(db, user, "停用账号" if not body.active else "启用账号", target.name)
    db.commit()
    return [
        {"name": u.name, "email": u.email, "role": u.role, "active": u.active}
        for u in db.query(User).order_by(User.id.asc()).all()
    ]


@app.post("/api/audit")
def write_audit(body: AuditIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    audit(db, user, body.action, body.object, body.result)
    db.commit()
    return {"ok": True}


def _next_material_id(db: Session) -> str:
    nums = []
    for (mid,) in db.query(Material.id).all():
        if mid.startswith("MAT-") and mid[4:].isdigit():
            nums.append(int(mid[4:]))
    return f"MAT-{(max(nums) if nums else 0) + 1:03d}"


def _validate_material(body: MaterialIn) -> dict:
    errors = {}
    if not body.title.strip():
        errors["title"] = "请填写资料名称"
    if not body.source.strip():
        errors["source"] = "请填写来源"
    if not body.content.strip():
        errors["content"] = "请填写书稿摘要"
    if body.chapter.strip() and not body.excerpt.strip():
        errors["excerpt"] = "已填写出处时，请补上精选片段，或清空出处"
    return errors


def _apply_material(item: Material, body: MaterialIn) -> None:
    item.title = body.title.strip()
    item.type = "书稿摘要"
    item.content = body.content.strip()
    item.source = body.source.strip()
    item.version = (body.version or "V1.0").strip() or "V1.0"
    item.extra_json = json.dumps(
        {
            "author": body.author.strip(),
            "chapter": body.chapter.strip(),
            "excerpt": body.excerpt.strip(),
        },
        ensure_ascii=False,
    )


@app.get("/api/materials")
def list_materials(db: Session = Depends(get_db), user: User = Depends(current_user)):
    _ = user
    return [material_dict(item) for item in db.query(Material).order_by(Material.id.asc()).all()]


@app.post("/api/materials")
def create_material(body: MaterialIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == "主编":
        audit(db, user, "创建资料", body.title, "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "主编不可创建资料")
    errors = _validate_material(body)
    if errors:
        raise HTTPException(422, {"fields": errors})
    item = Material(id=_next_material_id(db), extra_json="{}")
    _apply_material(item, body)
    db.add(item)
    audit(db, user, "创建资料", f"{item.id} · {item.type}")
    db.commit()
    db.refresh(item)
    return material_dict(item)


@app.patch("/api/materials/{material_id}")
def update_material(material_id: str, body: MaterialIn, db: Session = Depends(get_db), user: User = Depends(current_user)):
    if user.role == "主编":
        audit(db, user, "修改教学资料", material_id, "403 · 权限拒绝")
        db.commit()
        raise HTTPException(403, "主编不可修改资料")
    item = db.query(Material).filter(Material.id == material_id).first()
    if not item:
        raise HTTPException(404, "资料不存在")
    errors = _validate_material(body)
    if errors:
        raise HTTPException(422, {"fields": errors})
    _apply_material(item, body)
    audit(db, user, "修改教学资料", f"{item.id} · {item.type}")
    db.commit()
    db.refresh(item)
    return material_dict(item)


@app.get("/api/materials/{material_id}")
def get_material(material_id: str, db: Session = Depends(get_db), user: User = Depends(current_user)):
    _ = user
    item = db.query(Material).filter(Material.id == material_id).first()
    if not item:
        raise HTTPException(404, "资料不存在")
    data = material_dict(item)
    data["note"] = "教学模拟数据"
    return data
