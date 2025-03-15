@echo off
powershell -Command "ssh -i C:\Users\pc\.ssh\id_rsa_nopass root@165.227.174.52 'cd /var/www/wabot && pm2 start ecosystem.config.js'"
echo Press any key to exit...
pause > nul