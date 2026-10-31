"""开源词库：Sensitive-lexicon（MIT）的广告类词表。本地精确匹配，不得由大模型判定。"""

from pathlib import Path

OSS_VERSION = "OSS-SENSITIVE-LEXICON"
OSS_NAME = "Sensitive-lexicon"
OSS_LICENSE = "MIT"
OSS_URL = "https://github.com/konsheng/Sensitive-lexicon"
_LEXICON = Path(__file__).resolve().parents[1] / "data" / "oss_lexicon.txt"
_words: list[str] | None = None


def lexicon_words() -> list[str]:
    global _words
    if _words is None:
        lines = _LEXICON.read_text(encoding="utf-8").splitlines()
        seen: list[str] = []
        for line in lines:
            word = line.strip()
            if word and not word.startswith("#") and word not in seen:
                seen.append(word)
        _words = seen
    return list(_words)


def scan_opensource(text: str) -> list[dict]:
    words = sorted(lexicon_words(), key=len, reverse=True)
    hits = []
    index = 0
    while index < len(text):
        matched = next((word for word in words if text.startswith(word, index)), None)
        if matched:
            hits.append({"word": matched, "start": index + 1, "end": index + len(matched)})
            index += len(matched)
        else:
            index += 1
    return hits
