const { app, BrowserWindow } = require("electron");
const path = require("path");
const { spawn } = require("child_process");

function createWindow() {
  const win = new BrowserWindow({
    width: 1200,
    height: 800,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
    }
  });

  win.loadURL("http://localhost:3000");
}

app.whenReady().then(() => {

  // FIX: use system Node instead of Electron node
  const server = spawn("node", [path.join(__dirname, "server.js")], {
    cwd: __dirname,
    windowsHide: true
  });

  server.stdout.on("data", data => {
    const str = data.toString();
    console.log(`SERVER: ${str}`);

    if (str.toLowerCase().includes("server running on port 3000")) {
      createWindow();
    }
  });

  server.stderr.on("data", data => console.error(`SERVER ERR: ${data}`));
});
