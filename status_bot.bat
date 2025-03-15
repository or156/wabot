@echo off
cd /d "%~dp0"
powershell -Command "ssh root@165.227.174.52 'cd /var/www/wabot && pm2 list'"
echo Press any key to exit...
pause > nul 