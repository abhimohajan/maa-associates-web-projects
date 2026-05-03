MAA ASSOCIATES Web Application

Run:
  node server.js

Open:
  http://localhost:3000

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