const slotGrid = document.getElementById("slotGrid");
const statusText = document.getElementById("statusText");
const stopAllButton = document.getElementById("stopAllButton");
const addSlotButton = document.getElementById("addSlotButton");

const LONG_PRESS_MS = 1000;
const LONG_PRESS_VISUAL_DELAY_MS = 200;
const LONG_PRESS_PROGRESS_MS = LONG_PRESS_MS - LONG_PRESS_VISUAL_DELAY_MS;
const NAME_SCROLL_DELAY_MS = 1000;
const VOLUME_LEVELS = [1, 0.6, 0.3];
const NORM_TARGET_RMS_DB = -23;
const NORM_SAMPLE_BYTES = 1 * 1024 * 1024; // 前 1MB
let config = { slots: [] };

const state = {
  activeLoops: new Map(),
  activeShots: new Set(),
  activeShotsBySlot: new Map(),
  dragSlotId: null
};

function getCurrentSlot(slotId) {
  return config.slots.find(function (s) { return s.id === slotId; });
}

function toFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

function setStatus(message) {
  statusText.textContent = message;
}

function createEmptySlot() {
  return {
    id: `slot-${crypto.randomUUID()}`,
    label: "",
    sourceType: "empty",
    filePath: "",
    missing: false,
    durationSec: null,
    volumeLevel: 1,
    normGain: null
  };
}

async function saveConfig() {
  config = await window.soundboardApi.saveConfig(config);
  render();
}

function stopAll() {
  state.activeLoops.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  state.activeLoops.clear();

  state.activeShots.forEach((audio) => {
    audio.pause();
    audio.currentTime = 0;
  });
  state.activeShots.clear();
  state.activeShotsBySlot.clear();

  render();
  setStatus("所有声音已停止，循环状态已重置。");
}

function getSlotStatus(slot) {
  if (slot.missing) {
    return "媒体丢失";
  }
  if (state.activeLoops.has(slot.id)) {
    return "循环中";
  }
  if (state.activeShotsBySlot.has(slot.id)) {
    return "播放中";
  }
  if (slot.sourceType === "empty") {
    return "空按钮";
  }
  return "就绪";
}

function getSlotActionText(slot) {
  if (slot.sourceType === "empty") {
    return "点击选择音频";
  }
  if (slot.missing) {
    return "点击重新选择";
  }
  if (state.activeLoops.has(slot.id) || state.activeShotsBySlot.has(slot.id)) {
    return "点击停止";
  }
  return "点击播放 / 长按循环";
}

function canDeleteSlot(slot) {
  return slot.sourceType !== "bundled";
}

function getVolumeLevel(slot) {
  return VOLUME_LEVELS.includes(slot.volumeLevel) ? slot.volumeLevel : 1;
}

function getVolumeLabel(slot) {
  return `${Math.round(getVolumeLevel(slot) * 100)}%`;
}

function formatDuration(totalSeconds) {
  if (!Number.isFinite(totalSeconds) || totalSeconds <= 0) {
    return "--:--";
  }
  const seconds = Math.floor(totalSeconds);
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remain = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
  }
  return `${String(minutes).padStart(2, "0")}:${String(remain).padStart(2, "0")}`;
}

function createAudioForSlot(slot) {
  const audio = new Audio(toFileUrl(slot.filePath));
  audio.preload = "auto";
  const baseVolume = getVolumeLevel(slot);
  const normGain = (slot.normGain != null) ? slot.normGain : 1;
  audio.volume = Math.min(1, baseVolume * normGain);
  return audio;
}

function applySlotVolume(slot) {
  const baseVolume = getVolumeLevel(slot);
  const normGain = (slot.normGain != null) ? slot.normGain : 1;
  const effectiveVolume = Math.min(1, baseVolume * normGain);
  if (state.activeLoops.has(slot.id)) {
    state.activeLoops.get(slot.id).volume = effectiveVolume;
  }
  if (state.activeShotsBySlot.has(slot.id)) {
    state.activeShotsBySlot.get(slot.id).volume = effectiveVolume;
  }
}

function getNextVolumeLevel(current) {
  const index = VOLUME_LEVELS.indexOf(current);
  const nextIndex = index >= 0 ? (index + 1) % VOLUME_LEVELS.length : 0;
  return VOLUME_LEVELS[nextIndex];
}

async function ensureSlotMetadata(slot) {
  let changed = false;
  if (!VOLUME_LEVELS.includes(slot.volumeLevel)) {
    slot.volumeLevel = 1;
    changed = true;
  }
  if (slot.sourceType === "empty" || slot.missing || !slot.filePath || (Number.isFinite(slot.durationSec) && slot.durationSec > 0)) {
    return changed;
  }

  try {
    const durationSec = await loadAudioDuration(slot.filePath);
    if (Number.isFinite(durationSec)) {
      slot.durationSec = durationSec;
      changed = true;
    }
  } catch (error) {
    console.warn("Failed to load duration", slot.filePath, error);
  }

  return changed;
}

function loadAudioDuration(filePath) {
  return new Promise((resolve, reject) => {
    const audio = new Audio();
    audio.preload = "metadata";
    audio.addEventListener("loadedmetadata", () => {
      const duration = Math.ceil(audio.duration);
      resolve(Number.isFinite(duration) && duration >= 1 ? duration : 0);
    }, { once: true });
    audio.addEventListener("error", () => reject(new Error("metadata load failed")), { once: true });
    audio.src = toFileUrl(filePath);
  });
}

function computeRmsDb(audioBuffer) {
  let sumSquares = 0;
  let sampleCount = 0;
  for (let ch = 0; ch < audioBuffer.numberOfChannels; ch++) {
    const data = audioBuffer.getChannelData(ch);
    for (let i = 0; i < data.length; i++) {
      sumSquares += data[i] * data[i];
    }
    sampleCount += data.length;
  }
  if (sampleCount === 0 || sumSquares === 0) {
    return -Infinity;
  }
  return 20 * Math.log10(Math.sqrt(sumSquares / sampleCount));
}

async function analyzeNormLoudness(slot) {
  if (!slot.filePath) {
    return;
  }

  try {
    const url = toFileUrl(slot.filePath);
    let response = await fetch(url, { headers: { Range: "bytes=0-" + (NORM_SAMPLE_BYTES - 1) } });
    if (!response.ok) {
      response = await fetch(url);
      if (!response.ok) {
        throw new Error("Fetch failed: " + response.status);
      }
    }
    const arrayBuffer = await response.arrayBuffer();
    const audioContext = new OfflineAudioContext(1, 44100, 44100);
    const audioBuffer = await audioContext.decodeAudioData(arrayBuffer);
    const rmsDb = computeRmsDb(audioBuffer);

    if (!Number.isFinite(rmsDb) || rmsDb === -Infinity) {
      console.warn("Near-silent audio, skipping norm analysis", slot.filePath);
      return;
    }

    const gainLinear = Math.pow(10, (NORM_TARGET_RMS_DB - rmsDb) / 20);
    slot.normGain = Math.min(gainLinear, 4.0);
  } catch (error) {
    console.warn("Loudness analysis failed", slot.filePath, error);
  }
}

async function bindSlot(slotId) {
  const picked = await window.soundboardApi.pickAudio();
  if (!picked) {
    setStatus("已取消选择音频。");
    return;
  }

  const slot = config.slots.find((item) => item.id === slotId);
  if (!slot) {
    return;
  }

  slot.label = picked.label;
  slot.filePath = picked.filePath;
  slot.sourceType = "file";
  slot.missing = false;
  slot.durationSec = null;
  if (!VOLUME_LEVELS.includes(slot.volumeLevel)) {
    slot.volumeLevel = 1;
  }
  slot.normGain = null;
  await ensureSlotMetadata(slot);
  setStatus("正在分析响度...");
  await analyzeNormLoudness(slot);
  await saveConfig();
  setStatus(`已绑定 ${picked.label}`);
}

let cleanupRafId = null;
function scheduleCleanupRender() {
  if (cleanupRafId === null) {
    cleanupRafId = requestAnimationFrame(function () {
      cleanupRafId = null;
      render();
    });
  }
}

function cleanupOneShot(audio) {
  state.activeShots.delete(audio);
  if (audio.dataset && audio.dataset.slotId) {
    state.activeShotsBySlot.delete(audio.dataset.slotId);
  }
  scheduleCleanupRender();
}

async function playOnce(slot) {
  if (slot.sourceType === "empty") {
    await bindSlot(slot.id);
    return;
  }

  if (slot.missing) {
    await bindSlot(slot.id);
    return;
  }

  if (state.activeShotsBySlot.has(slot.id) || state.activeLoops.has(slot.id)) {
    stopSlotPlayback(slot.id);
    setStatus(`已停止 ${slot.label || "未命名音频"}`);
    return;
  }

  const audio = createAudioForSlot(slot);
  audio.dataset.slotId = slot.id;
  state.activeShots.add(audio);
  state.activeShotsBySlot.set(slot.id, audio);

  audio.addEventListener("ended", () => cleanupOneShot(audio), { once: true });
  audio.addEventListener("error", async () => {
    cleanupOneShot(audio);
    slot.missing = true;
    await saveConfig();
    setStatus(`${slot.label} 无法播放，请重新选择文件。`);
  }, { once: true });

  try {
    await audio.play();
    render();
    setStatus(`已播放 ${slot.label || "未命名音频"}`);
  } catch (error) {
    cleanupOneShot(audio);
    setStatus(`播放失败：${error.message}`);
  }
}

async function toggleLoop(slot) {
  if (slot.sourceType === "empty") {
    await bindSlot(slot.id);
    return;
  }

  if (slot.missing) {
    await bindSlot(slot.id);
    return;
  }

  if (state.activeLoops.has(slot.id)) {
    stopSlotPlayback(slot.id);
    setStatus(`已停止循环 ${slot.label}`);
    return;
  }

  if (state.activeShotsBySlot.has(slot.id)) {
    stopSlotPlayback(slot.id);
  }

  const audio = createAudioForSlot(slot);
  audio.loop = true;
  audio.addEventListener("error", async () => {
    state.activeLoops.delete(slot.id);
    slot.missing = true;
    await saveConfig();
    render();
    setStatus(`${slot.label} 无法进入循环，请重新选择文件。`);
  }, { once: true });

  try {
    await audio.play();
    state.activeLoops.set(slot.id, audio);
    render();
    setStatus(`已开始循环 ${slot.label}`);
  } catch (error) {
    setStatus(`循环启动失败：${error.message}`);
  }
}

function stopSlotPlayback(slotId) {
  if (state.activeLoops.has(slotId)) {
    const loopAudio = state.activeLoops.get(slotId);
    loopAudio.pause();
    loopAudio.currentTime = 0;
    state.activeLoops.delete(slotId);
  }

  if (state.activeShotsBySlot.has(slotId)) {
    const shotAudio = state.activeShotsBySlot.get(slotId);
    shotAudio.pause();
    shotAudio.currentTime = 0;
    state.activeShots.delete(shotAudio);
    state.activeShotsBySlot.delete(slotId);
  }

  render();
}

async function deleteSlot(slotId) {
  stopSlotPlayback(slotId);
  config.slots = config.slots.filter((slot) => slot.id !== slotId);
  await saveConfig();
  setStatus("已删除按钮。");
}

async function moveSlot(dragSlotId, targetSlotId) {
  if (!dragSlotId || !targetSlotId || dragSlotId === targetSlotId) {
    return;
  }

  const fromIndex = config.slots.findIndex((slot) => slot.id === dragSlotId);
  const toIndex = config.slots.findIndex((slot) => slot.id === targetSlotId);
  if (fromIndex < 0 || toIndex < 0) {
    return;
  }

  const [movedSlot] = config.slots.splice(fromIndex, 1);
  config.slots.splice(toIndex, 0, movedSlot);
  await saveConfig();
  setStatus("已调整按钮顺序。");
}

function setupNameMarquee(tile, track) {
  let hoverTimer = null;

  const updateOverflow = () => {
    track.classList.remove("overflowing", "marquee-active");
    track.style.removeProperty("--marquee-distance");
    track.style.removeProperty("--marquee-duration");

    const viewport = tile.querySelector(".slot-name-viewport");
    if (!viewport) {
      return;
    }

    const distance = Math.max(0, track.scrollWidth - viewport.clientWidth);
    if (distance <= 4) {
      return;
    }

    track.classList.add("overflowing");
    track.style.setProperty("--marquee-distance", `${distance}px`);
    const duration = Math.max(3.2, distance / 38);
    track.style.setProperty("--marquee-duration", `${duration}s`);
  };

  const clearHoverTimer = () => {
    if (hoverTimer) {
      clearTimeout(hoverTimer);
      hoverTimer = null;
    }
  };

  tile.addEventListener("mouseenter", () => {
    clearHoverTimer();
    hoverTimer = setTimeout(() => {
      if (track.classList.contains("overflowing")) {
        track.classList.add("marquee-active");
      }
    }, NAME_SCROLL_DELAY_MS);
  });

  tile.addEventListener("mouseleave", () => {
    clearHoverTimer();
    track.classList.remove("marquee-active");
  });

  requestAnimationFrame(updateOverflow);
}

function attachPressHandlers(tile, slot) {
  if (slot.sourceType === "empty") {
    tile.addEventListener("click", async () => {
      const cur = getCurrentSlot(slot.id) || slot;
      await playOnce(cur);
    });
    return;
  }

  let longPressTimer = null;
  let progressStartTimer = null;
  let longPressed = false;
  let pointerIsDown = false;
  let progressTimer = null;
  let nonLeftButton = false;
  const progressBar = tile.querySelector(".slot-progress-fill");

  const clearPress = () => {
    if (longPressTimer) {
      clearTimeout(longPressTimer);
      longPressTimer = null;
    }
    if (progressStartTimer) {
      clearTimeout(progressStartTimer);
      progressStartTimer = null;
    }
    if (progressTimer) {
      progressTimer.cancel();
      progressTimer = null;
    }
  };

  const resetProgress = () => {
    tile.classList.remove("pressing");
    if (progressBar && !state.activeLoops.has(slot.id)) {
      progressBar.style.transform = "scaleX(0)";
    }
  };

  const fillProgress = () => {
    if (!progressBar) {
      return;
    }
    const start = performance.now();
    tile.classList.add("pressing");
    progressBar.style.transform = "scaleX(0)";
    let rafId = 0;
    const tick = function () {
      if (!pointerIsDown || longPressed) {
        cancelAnimationFrame(rafId);
        progressTimer = null;
        return;
      }
      const elapsed = performance.now() - start;
      const percent = Math.min(100, (elapsed / LONG_PRESS_PROGRESS_MS) * 100);
      progressBar.style.transform = "scaleX(" + (percent / 100) + ")";
      rafId = requestAnimationFrame(tick);
    };
    progressTimer = { cancel: function () { cancelAnimationFrame(rafId); } };
    rafId = requestAnimationFrame(tick);
  };

  tile.addEventListener("pointerdown", (event) => {
    if (event.button !== 0) {
      nonLeftButton = true;
      return;
    }
    nonLeftButton = false;
    pointerIsDown = true;
    longPressed = false;
    clearPress();
    resetProgress();
    progressStartTimer = setTimeout(() => {
      if (!pointerIsDown || longPressed) {
        return;
      }
      fillProgress();
    }, LONG_PRESS_VISUAL_DELAY_MS);
    longPressTimer = setTimeout(async () => {
      if (!pointerIsDown) {
        return;
      }
      longPressed = true;
      if (progressBar) {
        progressBar.style.transform = "scaleX(1)";
      }
      const cur = getCurrentSlot(slot.id) || slot;
      await toggleLoop(cur);
      if (!state.activeLoops.has(slot.id)) {
        setTimeout(resetProgress, 150);
      }
    }, LONG_PRESS_MS);
  });

  ["pointerup", "pointerleave", "pointercancel"].forEach((eventName) => {
    tile.addEventListener(eventName, async () => {
      if (nonLeftButton) {
        nonLeftButton = false;
        pointerIsDown = false;
        clearPress();
        return;
      }
      const shouldTriggerShortPress = eventName === "pointerup" && pointerIsDown && !longPressed;
      pointerIsDown = false;
      clearPress();
      if (shouldTriggerShortPress) {
        resetProgress();
        const cur = getCurrentSlot(slot.id) || slot;
        await playOnce(cur);
        return;
      }
      if (!state.activeLoops.has(slot.id)) {
        resetProgress();
      } else if (progressBar) {
        progressBar.style.transform = "scaleX(1)";
      }
    });
  });
}

function attachDragHandlers(tile, slot) {
  tile.draggable = true;

  tile.addEventListener("dragstart", (event) => {
    state.dragSlotId = slot.id;
    tile.classList.add("dragging");
    if (event.dataTransfer) {
      event.dataTransfer.effectAllowed = "move";
      event.dataTransfer.setData("text/plain", slot.id);
    }
  });

  tile.addEventListener("dragend", () => {
    state.dragSlotId = null;
    tile.classList.remove("dragging");
    document.querySelectorAll(".slot-tile.drag-target").forEach((node) => {
      node.classList.remove("drag-target");
    });
  });

  tile.addEventListener("dragover", (event) => {
    if (!state.dragSlotId || state.dragSlotId === slot.id) {
      return;
    }
    event.preventDefault();
    if (event.dataTransfer) {
      event.dataTransfer.dropEffect = "move";
    }
    tile.classList.add("drag-target");
  });

  tile.addEventListener("dragleave", () => {
    tile.classList.remove("drag-target");
  });

  tile.addEventListener("drop", async (event) => {
    event.preventDefault();
    tile.classList.remove("drag-target");
    const dragSlotId = state.dragSlotId || (event.dataTransfer ? event.dataTransfer.getData("text/plain") : "");
    await moveSlot(dragSlotId, slot.id);
  });
}

function attachVolumeHandler(tile, slot) {
  tile.addEventListener("contextmenu", async (event) => {
    event.preventDefault();
    slot = getCurrentSlot(slot.id) || slot;
    if (slot.sourceType === "empty") {
      setStatus("空按钮还没有音量档位。");
      return;
    }

    slot.volumeLevel = getNextVolumeLevel(getVolumeLevel(slot));
    applySlotVolume(slot);
    await saveConfig();
    setStatus(`${slot.label || "未命名音频"} 音量切换为 ${getVolumeLabel(slot)}`);
  });
}

function updateTile(tile, slot) {
  tile.title = slot.label || "空按钮";

  tile.classList.toggle("playing", state.activeShotsBySlot.has(slot.id));
  tile.classList.toggle("looping", state.activeLoops.has(slot.id));
  tile.classList.toggle("missing", slot.missing);

  const statusEl = tile.querySelector(".slot-status");
  if (statusEl) statusEl.textContent = getSlotStatus(slot);
  const actionEl = tile.querySelector(".slot-action");
  if (actionEl) actionEl.textContent = getSlotActionText(slot);
  const nameEl = tile.querySelector(".slot-name-track");
  if (nameEl) nameEl.textContent = slot.label || "空按钮";
  const durEl = tile.querySelector(".slot-chip--duration");
  if (durEl) durEl.textContent = formatDuration(slot.durationSec);
  const volEl = tile.querySelector(".slot-chip--volume");
  if (volEl) volEl.textContent = getVolumeLabel(slot);

  const progressBar = tile.querySelector(".slot-progress-fill");
  if (progressBar) {
    progressBar.style.transform = state.activeLoops.has(slot.id) ? "scaleX(1)" : "scaleX(0)";
  }
}

function renderSlot(slot) {
  const tile = document.createElement("button");
  tile.type = "button";
  tile.className = "slot-tile";
  tile.dataset.slotId = slot.id;
  tile.title = slot.label || "空按钮";

  if (state.activeShotsBySlot.has(slot.id)) {
    tile.classList.add("playing");
  }
  if (state.activeLoops.has(slot.id)) {
    tile.classList.add("looping");
  }
  if (slot.missing) {
    tile.classList.add("missing");
  }

  const progressBar = document.createElement("div");
  progressBar.className = "slot-progress-fill";
  if (state.activeLoops.has(slot.id)) {
    progressBar.style.transform = "scaleX(1)";
  }

  const content = document.createElement("div");
  content.className = "slot-content";

  const top = document.createElement("div");
  top.className = "slot-top";
  const status = document.createElement("div");
  status.className = "slot-status";
  status.textContent = getSlotStatus(slot);
  top.appendChild(status);

  if (canDeleteSlot(slot)) {
    const deleteButton = document.createElement("button");
    deleteButton.type = "button";
    deleteButton.className = "slot-delete";
    deleteButton.textContent = "×";
    deleteButton.title = "删除按钮";
    ["pointerdown", "pointerup", "pointercancel", "click", "contextmenu"].forEach((eventName) => {
      deleteButton.addEventListener(eventName, (event) => {
        event.stopPropagation();
      });
    });
    deleteButton.addEventListener("click", async (event) => {
      event.preventDefault();
      await deleteSlot(slot.id);
    });
    top.appendChild(deleteButton);
  }

  const nameViewport = document.createElement("div");
  nameViewport.className = "slot-name-viewport";
  const nameTrack = document.createElement("div");
  nameTrack.className = "slot-name-track";
  nameTrack.textContent = slot.label || "空按钮";
  nameViewport.appendChild(nameTrack);

  const footer = document.createElement("div");
  footer.className = "slot-footer";
  const action = document.createElement("div");
  action.className = "slot-action";
  action.textContent = getSlotActionText(slot);

  const metaGroup = document.createElement("div");
  metaGroup.className = "slot-meta-group";
  const durationChip = document.createElement("div");
  durationChip.className = "slot-chip slot-chip--duration";
  durationChip.textContent = formatDuration(slot.durationSec);
  const volumeChip = document.createElement("div");
  volumeChip.className = "slot-chip slot-chip--volume";
  volumeChip.textContent = getVolumeLabel(slot);
  metaGroup.append(durationChip, volumeChip);

  footer.append(action, metaGroup);
  content.append(top, nameViewport, footer);
  tile.append(progressBar, content);

  attachPressHandlers(tile, slot);
  attachDragHandlers(tile, slot);
  attachVolumeHandler(tile, slot);
  setupNameMarquee(tile, nameTrack);

  return tile;
}

function render() {
  const existing = new Map();
  slotGrid.querySelectorAll(".slot-tile").forEach(function (tile) {
    existing.set(tile.dataset.slotId, tile);
  });

  config.slots.forEach(function (slot) {
    const tile = existing.get(slot.id);
    if (tile) {
      existing.delete(slot.id);
      updateTile(tile, slot);
    } else {
      slotGrid.appendChild(renderSlot(slot));
    }
  });

  existing.forEach(function (tile) {
    tile.remove();
  });
}

async function initialize() {
  config = await window.soundboardApi.loadConfig();

  const metaResults = await Promise.all(config.slots.map(function (slot) {
    return ensureSlotMetadata(slot);
  }));
  const metaChanged = metaResults.some(function (r) { return r; });
  if (metaChanged) {
    config = await window.soundboardApi.saveConfig(config);
  }

  const unanalyzed = config.slots.filter(function (slot) {
    return slot.normGain == null && slot.sourceType !== "empty" && slot.filePath;
  });
  if (unanalyzed.length > 0) {
    let i = 0;
    const CONCURRENCY = 3;
    let pool = unanalyzed.splice(0, CONCURRENCY).map(function (slot) {
      return analyzeNormLoudness(slot).then(function () { return slot; });
    });
    while (pool.length > 0) {
      const done = await Promise.race(pool.map(function (p, idx) {
        return p.then(function (s) { return idx; });
      }));
      pool.splice(done, 1);
      i++;
      setStatus("正在分析响度... (" + i + "/" + (i + unanalyzed.length + pool.length) + ")");
      const next = unanalyzed.shift();
      if (next) {
        pool.push(analyzeNormLoudness(next).then(function () { return next; }));
      }
    }
    config = await window.soundboardApi.saveConfig(config);
  }

  render();
  setStatus("已载入音效面板。右键按钮可切换音量档位。");
}

stopAllButton.addEventListener("click", stopAll);

addSlotButton.addEventListener("click", async () => {
  config.slots.push(createEmptySlot());
  await saveConfig();
  setStatus("已新增空按钮。");
});

initialize().catch((error) => {
  console.error(error);
  setStatus(`初始化失败：${error.message}`);
});
