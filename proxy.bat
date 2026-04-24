@echo off
set ANTHROPIC_API_KEY=sk-ant-your-key-here
echo Starting Claude Secure Proxy...
python "%~dp0proxy.py"
pause
