#!/usr/bin/python3 -I
# agos-linear-gate — Hermes (ctrl-01) için Linear erişim kapısı. SSH forced-command olarak çalışır.
# Hermes Linear API anahtarını GÖRMEZ: anahtar yalnız 'agos-linear' kullanıcısının 600 dosyasındadır.
# İzinli işlemler (SSH_ORIGINAL_COMMAND):
#   issue <KİMLİK>             örn: issue SEL-329     → başlık, durum, etiketler, açıklama (kısaltılmış)
#   comments <KİMLİK> [N]       son N yorum (vars. 10, en çok 30)
#   doc <SLUG>                  Linear dokümanı (kısaltılmış)
#   comment <KİMLİK> [--dry-run]  gövde STDIN'den; 'HERMES:' ile başlamalı; en çok 8000 karakter;
#                                 gizli değer benzeri içerik (token/anahtar/uzun sayı) varsa REDDEDİLİR
#   reply <YORUM-UUID> [--dry-run] aynı kurallarla bir yoruma yanıt
# Başka hiçbir şey çalışmaz. Her çağrı /var/log/agos-linear-gate.log'a (yalnız işlem+hedef) yazılır.
import json, os, re, sys, urllib.request, datetime

KEY_FILE = os.path.expanduser("~/.linear-api-key")
LOG = os.path.expanduser("~/gate.log")
API = "https://api.linear.app/graphql"
FOOTER = "\n\n— Hermes (ctrl-01) · agos-linear-gate"
SECRET_PATTERNS = [
    r"\b\d{6,}:[A-Za-z0-9_-]{30,}\b",          # telegram bot token
    r"\blin_(api|oauth)_[A-Za-z0-9]{20,}\b",    # linear key
    r"\b(sk|pk|rk)-[A-Za-z0-9_-]{20,}\b",       # api keys
    r"\bgh[pousr]_[A-Za-z0-9]{30,}\b",          # github tokens
    r"-----BEGIN [A-Z ]*PRIVATE KEY-----",
    r"[A-Za-z0-9+/_]{40,}={0,2}",               # uzun rastgele dizgiler (tire içermeyen)
    r"\+\d[\d ]{8,}\d",                          # uluslararası telefon
    r"\b\d{9,}\b",                               # uzun sayı (Telegram id, telefon)
    r"[\w.+-]+@[\w-]+\.[\w.]{2,}",              # e-posta
]
ID_RE = re.compile(r"^[A-Z][A-Z0-9]{1,9}-\d{1,6}$")
UUID_RE = re.compile(r"^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$")
SLUG_RE = re.compile(r"^[a-z0-9-]{4,200}$")

def die(msg, code=2):
    print("GATE_RED: " + msg); sys.exit(code)

def log(op, target, result):
    try:
        with open(LOG, "a") as f:
            f.write("%s op=%s target=%s result=%s\n" % (datetime.datetime.now(datetime.timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"), op, target, result))
    except OSError:
        pass

def gql(query, variables):
    try:
        key = open(KEY_FILE).read().strip()
    except OSError:
        die("Linear anahtarı kurulmamış (Owner: sel329-linear-access.sh --set-key)", 3)
    req = urllib.request.Request(API, data=json.dumps({"query": query, "variables": variables}).encode(),
                                 headers={"Content-Type": "application/json", "Authorization": key})
    try:
        with urllib.request.urlopen(req, timeout=20) as r:
            d = json.load(r)
    except Exception as e:
        die("Linear isteği başarısız: %s" % type(e).__name__, 4)
    if d.get("errors"):
        die("Linear hata: %s" % "; ".join(str(x.get("message", ""))[:120] for x in d["errors"]), 4)
    return d["data"]

def trunc(s, n):
    s = s or ""
    return s if len(s) <= n else s[:n] + "\n…(kısaltıldı, %d karakter)" % len(s)

def check_body(body):
    if not body.startswith("HERMES:"):
        die("yorum 'HERMES:' ile başlamalı")
    if len(body) > 8000:
        die("yorum 8000 karakteri aşıyor")
    for p in SECRET_PATTERNS:
        if re.search(p, body):
            die("yorumda gizli değer/kişisel veri benzeri içerik var (desen: %s); gönderilmedi" % p[:30])

def main():
    args = os.environ.get("SSH_ORIGINAL_COMMAND", "").split()
    if not args:
        print(__doc__ if __doc__ else open(__file__).read().split("import json")[0]); return
    op, rest = args[0], args[1:]
    if op == "issue" and len(rest) == 1 and ID_RE.match(rest[0]):
        d = gql("""query($id:String!){issue(id:$id){identifier title url state{name} priority
                 labels{nodes{name}} assignee{name} updatedAt description}}""", {"id": rest[0]})["issue"]
        print("%s | %s\ndurum=%s öncelik=%s atanan=%s güncelleme=%s\netiketler=%s\nurl=%s\n\n%s" % (
            d["identifier"], d["title"], d["state"]["name"], d["priority"], (d.get("assignee") or {}).get("name"),
            d["updatedAt"], ",".join(x["name"] for x in d["labels"]["nodes"]), d["url"], trunc(d["description"], 6000)))
        log(op, rest[0], "ok")
    elif op == "comments" and 1 <= len(rest) <= 2 and ID_RE.match(rest[0]):
        n = min(int(rest[1]), 30) if len(rest) == 2 and rest[1].isdigit() else 10
        d = gql("""query($id:String!,$n:Int!){issue(id:$id){comments(last:$n){nodes{id createdAt user{name} body parent{id}}}}}""",
                {"id": rest[0], "n": n})["issue"]["comments"]["nodes"]
        for c in sorted(d, key=lambda x: x["createdAt"]):
            print("--- %s %s %s%s\n%s\n" % (c["createdAt"], (c.get("user") or {}).get("name"), c["id"],
                  " (yanıt)" if c.get("parent") else "", trunc(c["body"], 1500)))
        log(op, rest[0], "ok n=%d" % len(d))
    elif op == "doc" and len(rest) == 1 and SLUG_RE.match(rest[0]):
        d = gql("""query($id:String!){document(id:$id){title url updatedAt content}}""", {"id": rest[0]})["document"]
        print("%s\nurl=%s güncelleme=%s\n\n%s" % (d["title"], d["url"], d["updatedAt"], trunc(d["content"], 12000)))
        log(op, rest[0], "ok")
    elif op in ("comment", "reply") and 1 <= len(rest) <= 2 and (rest[1:] in ([], ["--dry-run"])):
        tgt = rest[0]
        if op == "comment" and not ID_RE.match(tgt): die("geçersiz kayıt kimliği")
        if op == "reply" and not UUID_RE.match(tgt): die("geçersiz yorum kimliği")
        body = sys.stdin.read(9000).strip()
        check_body(body)
        if rest[1:] == ["--dry-run"]:
            print("DRY_RUN_OK: kurallar geçti, %d karakter, gönderilmedi" % len(body)); log(op, tgt, "dry-run"); return
        if op == "comment":
            iid = gql("query($id:String!){issue(id:$id){id}}", {"id": tgt})["issue"]["id"]
            inp = {"issueId": iid, "body": body + FOOTER}
        else:
            inp = {"parentId": tgt, "body": body + FOOTER}
        r = gql("mutation($i:CommentCreateInput!){commentCreate(input:$i){success comment{id url}}}", {"i": inp})["commentCreate"]
        print("YORUM_GONDERILDI success=%s id=%s url=%s" % (r["success"], r["comment"]["id"], r["comment"]["url"]))
        log(op, tgt, "sent")
    else:
        log(op[:20], "-", "rejected"); die("izinli olmayan işlem. İzinliler: issue, comments, doc, comment, reply")

if __name__ == "__main__":
    main()
