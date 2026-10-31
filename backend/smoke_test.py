import json
import urllib.request


def req(method, path, data=None, token=None):
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    body = None if data is None else json.dumps(data).encode()
    r = urllib.request.Request("http://127.0.0.1:8000" + path, data=body, headers=headers, method=method)
    try:
        with urllib.request.urlopen(r) as resp:
            return json.load(resp)
    except urllib.error.HTTPError as e:
        print("ERR", e.code, e.read().decode())
        raise


login = req("POST", "/api/auth/login", {"email": "linxiao@example.com", "password": "demo123456"})
token = login["access_token"]
boot = req("GET", "/api/bootstrap", token=token)
print("tasks", len(boot["tasks"]), "dicts", list(boot["dictionaries"]))
task = next(t for t in boot["tasks"] if t["status"] == "待审核")
print("sample", task["id"], "candidates", len(task["candidates"]), "versions", len(task["versions"]))
selected = req("POST", f"/api/tasks/{task['id']}/select", {"index": 1}, token)
print("selected", selected["selected"], selected["copy"][:12])
scan = req(
    "POST",
    f"/api/tasks/{task['id']}/scan",
    {"text": selected["copy"] + "年度最佳", "rule_version": "DICT-V1", "simulate_timeout": False},
    token,
)
print("scan hits", len(scan["scan"]["hits"]), "err", scan["scan"]["error"])
# new task + mock run
created = req(
    "POST",
    "/api/tasks",
    {
        "title": "对接测试",
        "author": "测试",
        "intro": "这是一段用于对接测试的简介，长度需要超过五十字，用来确认任务创建、生成占位和候选选择都能写入数据库。",
        "contents": "",
        "styles": ["温暖治愈", "文学叙事"],
        "generate": False,
    },
    token,
)
tid = created["task"]["id"]
ran = req("POST", f"/api/tasks/{tid}/run", {"retry": False, "simulate_fail": False, "styles": ["温暖治愈", "文学叙事"], "material": created["task"]["material"]}, token)
print("run", ran["task"]["status"], "cands", len(ran["task"]["candidates"]), "calls", [c["tool"] for c in ran["calls"]])
# chief cannot create
login2 = req("POST", "/api/auth/login", {"email": "zhouming@example.com", "password": "demo123456"})
try:
    req("POST", "/api/tasks", {"title": "x", "author": "", "intro": "", "styles": [], "generate": False, "contents": ""}, login2["access_token"])
    print("chief create unexpectedly ok")
except Exception:
    print("chief create denied")
