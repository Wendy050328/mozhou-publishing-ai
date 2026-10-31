"""本地词表精确匹配。不得由大模型代替规则判定。位置从 1 开始，end 含末位。"""

from sqlalchemy.orm import Session

from ..models import SensitiveWord


class DictMissing(LookupError):
    pass


def scan_text(db: Session, text: str, rule_version: str) -> dict:
    rows = (
        db.query(SensitiveWord)
        .filter(SensitiveWord.rule_version == rule_version)
        .all()
    )
    if not rows:
        raise DictMissing("E-DATA-01")
    hits = []
    for item in rows:
        start = 0
        while True:
            pos = text.find(item.word, start)
            if pos < 0:
                break
            hits.append(
                {
                    "word": item.word,
                    "start": pos + 1,
                    "end": pos + len(item.word),
                }
            )
            start = pos + len(item.word)
    hits.sort(key=lambda h: h["start"])
    return {
        "passed": len(hits) == 0,
        "hits": hits,
        "version": rule_version,
        "source_note": "模拟数据",
        "error": "",
    }
