const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const fs = require("node:fs");
const path = require("node:path");

const CONFIG_FILE = "soundboard-config.json";

function getConfigPath() {
  return path.join(app.getPath("userData"), CONFIG_FILE);
}

function getBundledAudioPath(filename) {
  return path.join(app.getAppPath(), filename);
}

function getDefaultConfig() {
  return {
    slots: [
      {
        id: "slot-advanture",
        label: "Advanture",
        sourceType: "bundled",
        filePath: getBundledAudioPath("advanture.mp3"),
        missing: false,
        durationSec: null,
        volumeLevel: 1,
        normGain: 1.7479
      },
      {
        id: "slot-carriage",
        label: "Carriage",
        sourceType: "bundled",
        filePath: getBundledAudioPath("Carriage.mp3"),
        missing: false,
        durationSec: null,
        volumeLevel: 1,
        normGain: 4.0000
      },
      {
        id: "slot-dooropen",
        label: "Dooropen",
        sourceType: "bundled",
        filePath: getBundledAudioPath("Dooropen.mp3"),
        missing: false,
        durationSec: null,
        volumeLevel: 1,
        normGain: 0.5141
      },
      ...Array.from({ length: 7 }, (_, index) => ({
        id: `slot-empty-${index + 1}`,
        label: "",
        sourceType: "empty",
        filePath: "",
        missing: false,
        durationSec: null,
        volumeLevel: 1,
        normGain: null
      }))
    ]
  };
}

function normalizeConfig(config) {
  const fallback = getDefaultConfig();
  if (!config || !Array.isArray(config.slots)) {
    return fallback;
  }

  return {
    slots: config.slots.map((slot, index) => {
      const safeSlot = slot && typeof slot === "object" ? slot : {};
      const filePath = typeof safeSlot.filePath === "string" ? safeSlot.filePath : "";
      const sourceType = typeof safeSlot.sourceType === "string" ? safeSlot.sourceType : "empty";
      return {
        id: typeof safeSlot.id === "string" ? safeSlot.id : `slot-${index + 1}`,
        label: typeof safeSlot.label === "string" ? safeSlot.label : "",
        sourceType,
        filePath,
        missing: filePath ? !fs.existsSync(filePath) : false,
        durationSec: Number.isFinite(safeSlot.durationSec) ? Math.max(0, Math.floor(safeSlot.durationSec)) : null,
        volumeLevel: safeSlot.volumeLevel === 0.6 || safeSlot.volumeLevel === 0.3 ? safeSlot.volumeLevel : 1,
        normGain: (typeof safeSlot.normGain === "number" && Number.isFinite(safeSlot.normGain) && safeSlot.normGain > 0)
          ? safeSlot.normGain
          : null
      };
    })
  };
}

function loadConfig() {
  const configPath = getConfigPath();
  if (!fs.existsSync(configPath)) {
    return getDefaultConfig();
  }

  try {
    const raw = fs.readFileSync(configPath, "utf8");
    return normalizeConfig(JSON.parse(raw));
  } catch (error) {
    return getDefaultConfig();
  }
}

async function saveConfig(config) {
  const configPath = getConfigPath();
  const normalized = normalizeConfig(config);
  await fs.promises.writeFile(configPath, JSON.stringify(normalized, null, 2), "utf8");
  return normalized;
}

function createWindow() {
  const win = new BrowserWindow({
    width: 1100,
    height: 840,
    minWidth: 860,
    minHeight: 680,
    backgroundColor: "#0f131a",
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  win.loadFile("index.html");
}

ipcMain.handle("config:load", () => loadConfig());

ipcMain.handle("config:save", (_event, config) => saveConfig(config));

ipcMain.handle("dialog:pick-audio", async () => {
  const result = await dialog.showOpenDialog({
    title: "选择音频文件",
    properties: ["openFile"],
    filters: [
      {
        name: "Audio",
        extensions: ["mp3", "wav", "ogg", "m4a", "aac", "flac"]
      }
    ]
  });

  if (result.canceled || !result.filePaths.length) {
    return null;
  }

  const filePath = result.filePaths[0];
  return {
    filePath,
    label: path.parse(filePath).name
  };
});

app.whenReady().then(() => {
  createWindow();

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") {
    app.quit();
  }
});
