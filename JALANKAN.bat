@echo off
title AI Agent Living World
cd /d %~dp0
start "LW Server" cmd /k npm run dev -w server
timeout /t 4 /nobreak >nul
start "LW Client" cmd /k npm run dev
timeout /t 6 /nobreak >nul
start http://localhost:5173
