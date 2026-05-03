MAA ASSOCIATES Web Application

Run (browser):
  node server.js

Open:
  http://localhost:3000

Desktop (Electron — full app in one window):
  npm install
  npm run desktop
  (Embedded server; DB copy in Electron userData / maa-data — see %APPDATA% for app name from package.json)

Windows installer EXE:
  npm run build:win
  Output folder: ..\maa-associates-web-projects-exe

Default users:
  admin / admin123
  worker / worker123
  programmer / programmer123

Database:
  data/database.json

Panels:
  Admin: user creation, users list, audit log
  Worker: ASYCUDA XML processing tool
  Programmer: project/database overview

Important:
  Use the localhost URL for password protection. Opening app.html directly with file:// bypasses the server login.

GitHub Pages (static):
  Site root serves index.html (static gate). ASYCUDA tool is app.html after Continue.
  Full login + panels + hscode: run node server.js on localhost:3000.