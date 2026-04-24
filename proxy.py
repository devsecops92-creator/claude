from flask import Flask, request, Response, jsonify
import requests, json, re, os, datetime, logging

app = Flask(__name__)

ANTHROPIC_API_KEY = os.environ.get("ANTHROPIC_API_KEY", "")
ANTHROPIC_BASE    = "https://api.anthropic.com"
LOG_FILE          = r"C:\claude-secure-chat\proxy\logs\audit.log"
PORT              = 5010

BLOCKED_PATTERNS = [
    (r'(?i)password\s*[:=]\s*\S+',     "Password in plaintext"),
    (r'(?i)api[_-]?key\s*[:=]\s*\S+',  "API key detected"),
    (r'(?i)secret\s*[:=]\s*\S+',       "Secret detected"),
    (r'\b\d{16}\b',                     "Possible credit card"),
    (r'(?i)DROP\s+TABLE',              "Destructive SQL"),
    (r'(?i)rm\s+-rf\s+/',              "Dangerous shell command"),
]

logging.basicConfig(level=logging.INFO)

def write_log(status, reason=None, preview=None):
    os.makedirs(os.path.dirname(LOG_FILE), exist_ok=True)
    entry = {
        "timestamp": datetime.datetime.utcnow().isoformat() + "Z",
        "status":    status,
        "reason":    reason,
        "preview":   preview,
        "user":      os.environ.get("USERNAME", "unknown"),
        "machine":   os.environ.get("COMPUTERNAME", "unknown"),
    }
    with open(LOG_FILE, "a", encoding="utf-8") as f:
        f.write(json.dumps(entry) + "\n")

def validate(text):
    for pattern, label in BLOCKED_PATTERNS:
        if re.search(pattern, text):
            return False, label
    return True, None

@app.route("/health")
def health():
    return jsonify({"status": "ok"})

@app.route("/<path:path>", methods=["GET","POST","PUT","DELETE"])
def proxy(path):
    target = f"{ANTHROPIC_BASE}/{path}"
    body   = {}
    preview = ""

    if request.method == "POST":
        body     = request.get_json(force=True, silent=True) or {}
        body_str = json.dumps(body)
        preview  = body_str[:120]

        allowed, reason = validate(body_str)
        if not allowed:
            write_log("BLOCKED", reason, preview)
            return jsonify({
                "error": {
                    "type":    "blocked_by_proxy",
                    "message": f"🚫 Blocked: {reason}"
                }
            }), 400

    headers = {
        "x-api-key":         ANTHROPIC_API_KEY,
        "anthropic-version": "2023-06-01",
        "content-type":      "application/json",
    }

    is_stream = body.get("stream", False)

    try:
        resp = requests.request(
            method  = request.method,
            url     = target,
            headers = headers,
            json    = body if request.method == "POST" else None,
            stream  = is_stream,
            timeout = 120,
        )
        write_log("ALLOWED", preview=preview)

        if is_stream:
            def generate():
                for chunk in resp.iter_content(chunk_size=512):
                    if chunk:
                        yield chunk
            return Response(generate(),
                status=resp.status_code,
                content_type=resp.headers.get("content-type","text/event-stream"))

        return Response(resp.content,
            status=resp.status_code,
            content_type=resp.headers.get("content-type","application/json"))

    except Exception as e:
        write_log("ERROR", str(e))
        return jsonify({"error": {"type": "proxy_error", "message": str(e)}}), 502

if __name__ == "__main__":
    print(f"✅ Claude Secure Proxy running on port {PORT}")
    app.run(host="127.0.0.1", port=PORT, debug=False)
