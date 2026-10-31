from datetime import datetime

from sqlalchemy import Boolean, DateTime, ForeignKey, Integer, String, Text
from sqlalchemy.orm import Mapped, mapped_column, relationship

from .database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    email: Mapped[str] = mapped_column(String(120), unique=True, index=True)
    name: Mapped[str] = mapped_column(String(64))
    password_hash: Mapped[str] = mapped_column(String(255))
    role: Mapped[str] = mapped_column(String(16))  # 编辑 | 主编 | 管理员
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    created_at: Mapped[datetime] = mapped_column(DateTime, default=datetime.utcnow)


class Material(Base):
    __tablename__ = "materials"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    type: Mapped[str] = mapped_column(String(32), default="书稿摘要")
    content: Mapped[str] = mapped_column(Text, default="")
    source: Mapped[str] = mapped_column(String(120), default="教学模拟资料 · 手工录入")
    version: Mapped[str] = mapped_column(String(32), default="V1.0")
    task_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    extra_json: Mapped[str] = mapped_column(Text, default="{}")


class Task(Base):
    __tablename__ = "tasks"

    id: Mapped[str] = mapped_column(String(32), primary_key=True)
    title: Mapped[str] = mapped_column(String(200))
    author: Mapped[str] = mapped_column(String(100), default="")
    intro: Mapped[str] = mapped_column(Text, default="")
    contents: Mapped[str] = mapped_column(Text, default="")
    status: Mapped[str] = mapped_column(String(16), default="待处理")
    creator_id: Mapped[int] = mapped_column(ForeignKey("users.id"))
    time: Mapped[str] = mapped_column(String(32), default="")
    styles_json: Mapped[str] = mapped_column(Text, default="[]")
    material_id: Mapped[str | None] = mapped_column(String(32), nullable=True)
    selected: Mapped[int] = mapped_column(Integer, default=-1)
    copy: Mapped[str] = mapped_column(Text, default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    batch: Mapped[str] = mapped_column(String(32), default="BATCH-001")
    retries: Mapped[int] = mapped_column(Integer, default=0)
    submitted: Mapped[bool] = mapped_column(Boolean, default=False)
    prompt: Mapped[str] = mapped_column(Text, default="")

    creator = relationship("User")
    versions = relationship("Version", back_populates="task", order_by="Version.seq")
    candidates = relationship(
        "Candidate", back_populates="task", order_by="Candidate.idx"
    )
    calls = relationship("AgentCall", back_populates="task", order_by="AgentCall.seq")


class Candidate(Base):
    __tablename__ = "candidates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    idx: Mapped[int] = mapped_column(Integer)
    title: Mapped[str] = mapped_column(String(200))
    label: Mapped[str] = mapped_column(String(64))
    headline: Mapped[str] = mapped_column(Text)
    body: Mapped[str] = mapped_column(Text)
    points_json: Mapped[str] = mapped_column(Text, default="[]")
    batch: Mapped[str] = mapped_column(String(32), default="")

    task = relationship("Task", back_populates="candidates")


class Version(Base):
    __tablename__ = "versions"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer)
    vid: Mapped[str] = mapped_column(String(16))
    name: Mapped[str] = mapped_column(String(32))
    copy: Mapped[str] = mapped_column(Text, default="")
    reason: Mapped[str] = mapped_column(Text, default="")
    user: Mapped[str] = mapped_column(String(64))
    time: Mapped[str] = mapped_column(String(32))
    opinion: Mapped[str] = mapped_column(Text, default="")

    task = relationship("Task", back_populates="versions")


class AgentCall(Base):
    __tablename__ = "agent_calls"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    task_id: Mapped[str] = mapped_column(ForeignKey("tasks.id"), index=True)
    seq: Mapped[int] = mapped_column(Integer, default=0)
    call_id: Mapped[str] = mapped_column(String(64))
    tool: Mapped[str] = mapped_column(String(64))
    params: Mapped[str] = mapped_column(Text, default="{}")
    summary: Mapped[str] = mapped_column(Text, default="")
    data: Mapped[str] = mapped_column(String(200), default="")
    status: Mapped[str] = mapped_column(String(16), default="完成")
    error: Mapped[str] = mapped_column(String(64), default="—")
    duration: Mapped[str] = mapped_column(String(32), default="")

    task = relationship("Task", back_populates="calls")


class StyleTemplate(Base):
    __tablename__ = "style_templates"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    tpl_id: Mapped[str] = mapped_column(String(32), index=True)
    style: Mapped[str] = mapped_column(String(64))
    content: Mapped[str] = mapped_column(Text)
    version: Mapped[str] = mapped_column(String(16))


class SensitiveWord(Base):
    __tablename__ = "sensitive_words"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    word: Mapped[str] = mapped_column(String(100))
    match_mode: Mapped[str] = mapped_column(String(32), default="词表精确匹配")
    rule_version: Mapped[str] = mapped_column(String(32), index=True)
    source_note: Mapped[str] = mapped_column(String(64), default="模拟数据")


class AuditLog(Base):
    __tablename__ = "audit_logs"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    user: Mapped[str] = mapped_column(String(64))
    role: Mapped[str] = mapped_column(String(16))
    action: Mapped[str] = mapped_column(String(120))
    object: Mapped[str] = mapped_column(String(200))
    time: Mapped[str] = mapped_column(String(32))
    result: Mapped[str] = mapped_column(String(64), default="成功")
