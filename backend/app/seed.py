import json

from sqlalchemy.orm import Session

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
from .security import hash_password

INTRO = (
    "本书讲述了普通青年陈默在城市边缘的生活与成长。他在老城区经营一家深夜书店，与不同的读者相遇，"
    "在离别、重逢与日常琐事中，重新理解人与城市的关系。作品以温暖细腻的笔触，描绘平凡生活中的微光，"
    "探讨孤独、归属与自我和解。"
)
INITIAL_COPY = (
    "城市再大，总有一盏灯为你而亮。\n"
    "在喧嚣的边缘，遇见平凡生活的微光。一个关于相遇、告别与自我和解的温暖故事，陪你找到内心的归处。"
)
ORIGINAL_COPY = (
    "城市再大，总有一盏灯为你而亮。\n"
    "年度最佳治愈故事，带你遇见平凡生活中的微光。在喧嚣的边缘，重新找到内心的归处。"
)
REASON = "采用温暖治愈的表达方式，呼应书稿中“城市微光”与“自我和解”的核心主题，避免夸大宣传。"

NAMES = [
    ("城市边缘的灯", "李明", "待审核"),
    ("山海之间", "陈远", "运行中"),
    ("时间的褶皱", "周文", "待处理"),
    ("与自己好好相处", "苏宁", "完成"),
    ("消失的第七页", "许言", "失败"),
    ("风从旷野来", "沈青", "退回"),
    ("人间烟火慢慢尝", "林禾", "完成"),
    ("在群星之间", "顾川", "待审核"),
    ("写给明天的信", "许知远", "完成"),
    ("漫长的晴天", "刘佳", "完成"),
    ("沿着河流行走", "宋言", "运行中"),
    ("不被定义的人生", "周文", "待审核"),
    ("山野来信", "苏宁", "完成"),
    ("生活的另一种可能", "陈远", "完成"),
    ("看见时间", "李明", "待处理"),
    ("白日漫游", "沈青", "完成"),
    ("一万次日落", "顾川", "退回"),
    ("远方的回声", "许言", "完成"),
    ("植物的秘密", "林禾", "完成"),
    ("春天的来处", "刘佳", "运行中"),
    ("穿过寂静的森林", "陈远", "待审核"),
    ("万物有时", "宋言", "完成"),
    ("我的小小宇宙", "苏宁", "完成"),
    ("此刻即是生活", "周文", "完成"),
]


def seed_if_empty(db: Session) -> None:
    if db.query(User).count():
        return

    editor = User(email="linxiao@example.com", name="林晓", password_hash=hash_password("demo123456"), role="编辑")
    editor2 = User(email="chenyan@example.com", name="陈妍", password_hash=hash_password("demo123456"), role="编辑")
    chief = User(email="zhouming@example.com", name="周明", password_hash=hash_password("demo123456"), role="主编")
    admin = User(email="wangke@example.com", name="王珂", password_hash=hash_password("demo123456"), role="管理员")
    db.add_all([editor, editor2, chief, admin])
    db.flush()

    def add_task(index: int, title: str, author: str, status: str, creator: User):
        tid = f"TASK-{index:03d}"
        mid = f"MAT-{index:03d}"
        styles = ["文学叙事", "悬念引导"] if index % 3 == 1 else ["温暖治愈", "文学叙事"]
        has_version = status in ("待审核", "完成", "退回", "失败")
        submitted = status in ("待审核", "完成", "退回")
        time = f"2025-05-{22 - (index - 1) // 4:02d} {['14:32', '14:18', '13:45', '11:26'][(index - 1) % 4]}"
        excerpt = index % 5 == 0
        db.add(
            Material(
                id=mid,
                title=title,
                type="书稿摘要",
                content=INTRO,
                source="教学模拟资料 · 手工录入",
                version="V1.0",
                task_id=tid,
                extra_json=json.dumps(
                    {
                        "author": author,
                        "chapter": "第三章 · 教学摘录" if excerpt else "",
                        "excerpt": "夜色落在街口，灯还亮着。这是从书稿中摘出的教学片段。" if excerpt else "",
                    },
                    ensure_ascii=False,
                ),
            )
        )
        task = Task(
            id=tid,
            title=title,
            author=author,
            intro=INTRO,
            status=status,
            creator_id=creator.id,
            time=time,
            styles_json=json.dumps(styles, ensure_ascii=False),
            material_id=mid,
            selected=0 if has_version else -1,
            copy=INITIAL_COPY if has_version else "",
            reason=REASON if submitted else "",
            batch="BATCH-001",
            retries=1 if status == "失败" else 0,
            submitted=submitted,
        )
        db.add(task)
        db.flush()
        if has_version:
            opinion = "等待主编审核"
            if status == "退回":
                opinion = "请进一步精炼腰封文案，增强画面感。"
            elif status == "完成":
                opinion = "文案准确，符合风格规范，同意通过。"
            db.add_all(
                [
                    Version(
                        task_id=tid,
                        seq=1,
                        vid="V1",
                        name="原始生成版",
                        copy=ORIGINAL_COPY,
                        reason="AI 生成 · 温暖治愈",
                        user="AI Agent",
                        time="2025-05-22 14:20",
                        opinion="保留原始生成结果",
                    ),
                    Version(
                        task_id=tid,
                        seq=2,
                        vid="V2",
                        name="编辑修改版",
                        copy=INITIAL_COPY,
                        reason="删除绝对化用语，突出书稿的真实内容。",
                        user=creator.name,
                        time=time,
                        opinion=opinion,
                    ),
                ]
            )
            _seed_candidates(db, tid, title, styles)
        if status != "待处理":
            _seed_calls(db, tid, mid, styles, status, submitted)
        return task

    for i, (title, author, status) in enumerate(NAMES, start=1):
        add_task(i, title, author, status, editor)
    add_task(25, "长街有风", "白芷", "待处理", editor2)

    db.add_all(
        [
            StyleTemplate(tpl_id="TPL-001", style="温暖治愈", version="V1.2", content="采用温暖细腻的语言，突出情感共鸣；以生活细节为切入点，避免绝对化宣传。"),
            StyleTemplate(tpl_id="TPL-002", style="文学叙事", version="V1.0", content="以具有画面感的文学语言呈现主题，保留叙事留白，关注人物与时代的关系。"),
            StyleTemplate(tpl_id="TPL-003", style="悬念引导", version="V1.1", content="用问题或故事引子建立悬念，引导阅读兴趣，不编造书稿未提供的情节。"),
            StyleTemplate(tpl_id="TPL-004", style="简洁有力", version="V1.0", content="句子短、节奏快、信息密度高；少用修饰与排比，突出关键意象与行动，避免空泛抒情和口号化表达。"),
            StyleTemplate(tpl_id="TPL-005", style="生活美学", version="V1.0", content="从日常器物、气味、光影与习惯入手，写可感的生活质地；语气克制优雅，不写成促销清单，也不虚构书稿未提供的场景。"),
        ]
    )
    # 图书腰封 / 推荐语常见禁限与绝对化宣传用语（教学演示词表，非执法标准）
    dict_v1 = [
        "最佳",
        "最好",
        "最优",
        "最强",
        "第一",
        "唯一",
        "顶级",
        "极致",
        "完美",
        "绝对",
        "永久",
        "万能",
        "国家级",
        "世界级",
        "史无前例",
        "空前绝后",
    ]
    dict_v2 = dict_v1 + [
        "治愈",
        "必读",
        "必买",
        "必看",
        "疯抢",
        "秒杀",
        "畅销冠军",
        "销量第一",
        "权威认证",
        "官方指定",
        "包治",
        "根治",
        "立竿见影",
        "100%",
        "全网最低",
        "免费赠送",
        "获奖无数",
        "保证畅销",
    ]
    for word in dict_v1:
        db.add(SensitiveWord(word=word, rule_version="DICT-V1", source_note="腰封宣传禁限用语 · 教学演示"))
    for word in dict_v2:
        db.add(SensitiveWord(word=word, rule_version="DICT-V2", source_note="腰封宣传禁限用语 · 教学演示"))

    db.add_all(
        [
            AuditLog(user="陈妍", role="编辑", action="尝试修改他人任务", object="TASK-001", time="2025-05-22 14:30", result="403 · 权限拒绝"),
            AuditLog(user="林晓", role="编辑", action="提交人工修改版本", object="TASK-001 · V2", time="2025-05-22 14:32", result="成功"),
            AuditLog(user="王珂", role="管理员", action="发布敏感词库版本", object="DICT-V2", time="2025-05-22 10:20", result="成功"),
            AuditLog(user="周明", role="主编", action="审核通过", object="TASK-004", time="2025-05-22 09:18", result="成功"),
        ]
    )
    db.commit()


def _seed_candidates(db: Session, tid: str, title: str, styles: list[str]):
    labels = [styles[0], styles[1] if len(styles) > 1 else "文学叙事", "悬念引导"]
    items = [
        ("城市再大，总有一盏灯为你而亮。", f"在《{title}》的故事里，遇见平凡生活中的微光。在喧嚣的边缘，重新找到内心的归处。", ["深夜书店与普通人的相遇", "孤独、归属与自我和解", "温暖细腻的日常叙事"]),
        ("把生活的褶皱，写成光的形状。", f"《{title}》以细腻的笔触，记录人与城市的相遇。那些未曾言说的心事，终在字里行间找到回响。", ["人与城市之间的关系", "人物内心的细腻刻画", "在离别与重逢中成长"]),
        ("当最后一位读者离开，故事才刚刚开始。", f"在《{title}》中，一间深夜书店，连接着不同的人生。推开这扇门，你会遇见怎样的自己？", ["以深夜书店构建叙事入口", "读者故事与主角命运交织", "引导探索与情感共鸣"]),
    ]
    for i, (headline, body, points) in enumerate(items):
        db.add(
            Candidate(
                task_id=tid,
                idx=i,
                title=title,
                label=labels[i],
                headline=headline,
                body=body,
                points_json=json.dumps(points, ensure_ascii=False),
                batch="BATCH-001",
            )
        )


def _seed_calls(db: Session, tid: str, mid: str, styles: list[str], status: str, submitted: bool):
    failed = status == "失败"
    rows = [
        ("read_manuscript", json.dumps({"manuscript_id": mid}, ensure_ascii=False), "成功读取简介及章节摘要，共 3,218 字", f"{mid} · V1.0 · 教学书稿", "完成", "—", "128 ms"),
        ("read_style_template", json.dumps({"styles": styles}, ensure_ascii=False), f"已获取 {len(styles)} 个风格模板，引用具体版本", "TPL-001 · V1.2", "完成", "—", "86 ms"),
        ("check_completeness", '{"text":"[书稿摘要，已脱敏]","min_length":50}', "信息充足，未发现缺失项", mid, "完成", "—", "42 ms"),
        ("generate_copy", json.dumps({"points": ["城市生活", "自我和解"], "template": "TPL-001@V1.2", "batch": "BATCH-001", "count": 3}, ensure_ascii=False), "已生成 3 组候选文案及内容提炼要点" if not failed else "模型响应超时，未生成结果", "BATCH-001", "失败" if failed else "完成", "E-MODEL-01" if failed else "—", "30 s" if failed else "4.2 s"),
    ]
    if submitted:
        rows.append(("sensitive_scan", '{"text":"[提交文案，已脱敏]","dict_version":"DICT-V1"}', "命中 0 项，规则判定通过", "DICT-V1 · 模拟数据", "完成", "—", "63 ms"))
    for i, (tool, params, summary, data, st, error, duration) in enumerate(rows, start=1):
        db.add(
            AgentCall(
                task_id=tid,
                seq=i,
                call_id=f"CALL-{tid}-{i:03d}",
                tool=tool,
                params=params,
                summary=summary,
                data=data,
                status=st,
                error=error,
                duration=duration,
            )
        )
