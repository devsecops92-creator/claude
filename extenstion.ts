import * as vscode from 'vscode';

export function activate(context: vscode.ExtensionContext) {
    const provider = new ClaudeChatViewProvider(context.extensionUri);
    context.subscriptions.push(
        vscode.window.registerWebviewViewProvider(
            'claudeSecureChat.chatView', provider
        )
    );
}

class ClaudeChatViewProvider implements vscode.WebviewViewProvider {
    constructor(private readonly _extensionUri: vscode.Uri) {}

    resolveWebviewView(webviewView: vscode.WebviewView) {
        webviewView.webview.options = {
            enableScripts: true,
            localResourceRoots: [this._extensionUri]
        };
        webviewView.webview.html = this._getHtml(webviewView.webview);
        webviewView.webview.onDidReceiveMessage(async (data) => {
            if (data.type === 'sendMessage') {
                await this._handleMessage(webviewView.webview, data.messages, data.model);
            }
        });
    }

    private async _handleMessage(
        webview: vscode.Webview,
        messages: any[],
        model: string
    ) {
        const config   = vscode.workspace.getConfiguration('claudeSecureChat');
        const proxyUrl = config.get<string>('proxyUrl', 'http://localhost:5010');

        try {
            const response = await fetch(`${proxyUrl}/v1/messages`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ model, max_tokens: 4096, messages }),
            });

            const data: any = await response.json();

            if (!response.ok) {
                webview.postMessage({
                    type: 'error',
                    message: data?.error?.message || 'Request blocked or failed'
                });
                return;
            }

            const text = data.content?.[0]?.text || '';
            webview.postMessage({ type: 'response', message: text });

        } catch (err: any) {
            webview.postMessage({
                type: 'error',
                message: `Proxy connection failed. Is the proxy running?\n${err.message}`
            });
        }
    }

    private _getHtml(webview: vscode.Webview): string {
        const config = vscode.workspace.getConfiguration('claudeSecureChat');
        const model  = config.get<string>('model', 'claude-sonnet-4-6');

        return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Claude Secure Chat</title>
<style>
  * { box-sizing: border-box; margin: 0; padding: 0; }

  body {
    font-family: 'Segoe UI', system-ui, sans-serif;
    background: var(--vscode-sideBar-background);
    color: var(--vscode-foreground);
    height: 100vh;
    display: flex;
    flex-direction: column;
    font-size: 13px;
  }

  #header {
    padding: 10px 12px;
    background: var(--vscode-titleBar-activeBackground);
    border-bottom: 1px solid var(--vscode-panel-border);
    display: flex;
    align-items: center;
    gap: 8px;
  }

  #header .dot {
    width: 8px; height: 8px;
    border-radius: 50%;
    background: #22c55e;
    box-shadow: 0 0 6px #22c55e;
  }

  #header span {
    font-size: 11px;
    font-weight: 600;
    letter-spacing: 0.5px;
    opacity: 0.85;
    text-transform: uppercase;
  }

  #model-badge {
    margin-left: auto;
    font-size: 10px;
    padding: 2px 6px;
    border-radius: 4px;
    background: var(--vscode-badge-background);
    color: var(--vscode-badge-foreground);
  }

  #messages {
    flex: 1;
    overflow-y: auto;
    padding: 12px;
    display: flex;
    flex-direction: column;
    gap: 10px;
  }

  #messages::-webkit-scrollbar { width: 4px; }
  #messages::-webkit-scrollbar-thumb {
    background: var(--vscode-scrollbarSlider-background);
    border-radius: 2px;
  }

  .message {
    display: flex;
    flex-direction: column;
    gap: 3px;
    animation: fadeIn 0.2s ease;
  }

  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(4px); }
    to   { opacity: 1; transform: translateY(0); }
  }

  .message .label {
    font-size: 10px;
    font-weight: 700;
    letter-spacing: 0.5px;
    text-transform: uppercase;
    opacity: 0.5;
  }

  .message.user .label  { color: var(--vscode-textLink-foreground); }
  .message.claude .label { color: #a78bfa; }
  .message.error .label  { color: #f87171; }

  .message .bubble {
    padding: 8px 10px;
    border-radius: 6px;
    line-height: 1.5;
    white-space: pre-wrap;
    word-break: break-word;
  }

  .message.user .bubble {
    background: var(--vscode-input-background);
    border: 1px solid var(--vscode-input-border, #444);
  }

  .message.claude .bubble {
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-left: 2px solid #a78bfa;
  }

  .message.error .bubble {
    background: rgba(248, 113, 113, 0.1);
    border: 1px solid rgba(248, 113, 113, 0.3);
    color: #f87171;
    font-size: 12px;
  }

  .typing {
    display: flex;
    gap: 4px;
    padding: 8px 10px;
    background: var(--vscode-editor-inactiveSelectionBackground);
    border-radius: 6px;
    border-left: 2px solid #a78bfa;
    width: fit-content;
  }

  .typing span {
    width: 5px; height: 5px;
    background: #a78bfa;
    border-radius: 50%;
    animation: bounce 1.2s infinite;
  }
  .typing span:nth-child(2) { animation-delay: 0.2s; }
  .typing span:nth-child(3) { animation-delay: 0.4s; }

  @keyframes bounce {
    0%, 60%, 100% { transform: translateY(0); opacity: 0.4; }
    30%            { transform: translateY(-4px); opacity: 1; }
  }

  #input-area {
    padding: 10px 12px;
    border-top: 1px solid var(--vscode-panel-border);
    display: flex;
    flex-direction: column;
    gap: 8px;
  }

  #prompt {
    width: 100%;
    min-height: 64px;
    max-height: 160px;
    resize: vertical;
    padding: 8px 10px;
    background: var(--vscode-input-background);
    color: var(--vscode-input-foreground);
    border: 1px solid var(--vscode-input-border, #444);
    border-radius: 6px;
    font-family: inherit;
    font-size: 13px;
    line-height: 1.4;
    outline: none;
    transition: border-color 0.15s;
  }

  #prompt:focus {
    border-color: var(--vscode-focusBorder);
  }

  #prompt::placeholder { opacity: 0.4; }

  #actions {
    display: flex;
    gap: 6px;
    justify-content: flex-end;
  }

  button {
    padding: 5px 12px;
    border-radius: 4px;
    border: none;
    font-size: 12px;
    font-weight: 600;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  button:hover { opacity: 0.85; }
  button:disabled { opacity: 0.4; cursor: not-allowed; }

  #send-btn {
    background: var(--vscode-button-background);
    color: var(--vscode-button-foreground);
  }

  #clear-btn {
    background: var(--vscode-button-secondaryBackground);
    color: var(--vscode-button-secondaryForeground);
  }

  #status-bar {
    font-size: 10px;
    opacity: 0.45;
    text-align: center;
    padding: 4px 0 2px;
    letter-spacing: 0.3px;
  }

  .blocked-warning {
    display: flex;
    align-items: center;
    gap: 6px;
    font-size: 11px;
    color: #f87171;
    background: rgba(248,113,113,0.08);
    border: 1px solid rgba(248,113,113,0.25);
    border-radius: 4px;
    padding: 5px 8px;
  }
</style>
</head>
<body>

<div id="header">
  <div class="dot" id="proxy-dot"></div>
  <span>Claude Secure Chat</span>
  <span id="model-badge">${model}</span>
</div>

<div id="messages">
  <div class="message claude">
    <div class="label">Claude</div>
    <div class="bubble">👋 Hello! I'm Claude, routed through your secure local proxy. Your prompts are validated before being sent to the API.</div>
  </div>
</div>

<div id="input-area">
  <textarea id="prompt" placeholder="Ask Claude anything... (Shift+Enter for new line, Enter to send)"></textarea>
  <div id="actions">
    <button id="clear-btn">Clear</button>
    <button id="send-btn">Send</button>
  </div>
  <div id="status-bar">🔒 Routed via localhost:5010 · Validated · Logged</div>
</div>

<script>
  const vscode    = acquireVsCodeApi();
  const messages  = document.getElementById('messages');
  const prompt    = document.getElementById('prompt');
  const sendBtn   = document.getElementById('send-btn');
  const clearBtn  = document.getElementById('clear-btn');
  const proxyDot  = document.getElementById('proxy-dot');
  const model     = '${model}';

  let history = [];
  let busy    = false;

  // Check proxy health on load
  async function checkProxy() {
    try {
      const r = await fetch('http://localhost:5010/health');
      proxyDot.style.background    = r.ok ? '#22c55e' : '#f87171';
      proxyDot.style.boxShadow     = r.ok ? '0 0 6px #22c55e' : '0 0 6px #f87171';
    } catch {
      proxyDot.style.background    = '#f87171';
      proxyDot.style.boxShadow     = '0 0 6px #f87171';
    }
  }

  checkProxy();
  setInterval(checkProxy, 15000);

  function addMessage(role, text) {
    const wrap   = document.createElement('div');
    wrap.className = 'message ' + role;

    const label  = document.createElement('div');
    label.className = 'label';
    label.textContent = role === 'user' ? 'You' : role === 'error' ? '⚠ Blocked' : 'Claude';

    const bubble = document.createElement('div');
    bubble.className = 'bubble';
    bubble.textContent = text;

    wrap.appendChild(label);
    wrap.appendChild(bubble);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
    return bubble;
  }

  function addTyping() {
    const wrap = document.createElement('div');
    wrap.className = 'message claude';
    wrap.id = 'typing-indicator';

    const label = document.createElement('div');
    label.className = 'label';
    label.textContent = 'Claude';

    const typing = document.createElement('div');
    typing.className = 'typing';
    typing.innerHTML = '<span></span><span></span><span></span>';

    wrap.appendChild(label);
    wrap.appendChild(typing);
    messages.appendChild(wrap);
    messages.scrollTop = messages.scrollHeight;
  }

  function removeTyping() {
    const el = document.getElementById('typing-indicator');
    if (el) el.remove();
  }

  async function sendMessage() {
    const text = prompt.value.trim();
    if (!text || busy) return;

    busy = true;
    sendBtn.disabled = true;
    prompt.value = '';

    addMessage('user', text);
    history.push({ role: 'user', content: text });
    addTyping();

    vscode.postMessage({ type: 'sendMessage', messages: history, model });
  }

  // Handle response from extension
  window.addEventListener('message', (event) => {
    const data = event.data;
    removeTyping();

    if (data.type === 'response') {
      const reply = data.message;
      addMessage('claude', reply);
      history.push({ role: 'assistant', content: reply });
    } else if (data.type === 'error') {
      addMessage('error', data.message);
    }

    busy = false;
    sendBtn.disabled = false;
    prompt.focus();
  });

  // Keyboard shortcuts
  prompt.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });

  sendBtn.addEventListener('click', sendMessage);

  clearBtn.addEventListener('click', () => {
    history = [];
    messages.innerHTML = '';
    addMessage('claude', '🧹 Conversation cleared. Start fresh!');
  });

  prompt.focus();
</script>
</body>
</html>`;
    }
}

export function deactivate() {}
