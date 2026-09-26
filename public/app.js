import { scanAlbumCards, writeAlbumCard } from "./nfc.js";
import { refreshSpotifyOnLoad } from "./spotify-sync.js";
import { createPlaybackMonitor } from "./live-playback.js";
import {
  getCoverFlowDragPosition,
  getCoverFlowWindow,
  moveCoverFlowIndex,
  settleCoverFlowDrag,
} from "./coverflow.js";
import { removeRotationAlbum, toggleRotationAlbum } from "./rotation.js";

const targetsElement = document.querySelector("#targets");
const albumsElement = document.querySelector("#albums");
const nowPlayingElement = document.querySelector("#now-playing");
const refreshDevicesButton = document.querySelector("#refresh-devices");
const scanNfcButton = document.querySelector("#scan-nfc");
const nfcStatusElement = document.querySelector("#nfc-status");
const playbackToggleButton = document.querySelector("#playback-toggle");
const playbackNextButton = document.querySelector("#playback-next");
const coverflowElement = document.querySelector("#coverflow");
const coverflowStage = document.querySelector("#coverflow-stage");
const coverflowPlayButton = document.querySelector("#coverflow-play");
const coverflowPairButton = document.querySelector("#coverflow-pair");
const coverflowViewButton = document.querySelector("#album-view-coverflow");
const gridViewButton = document.querySelector("#album-view-grid");
const rotationViewButton = document.querySelector("#album-view-rotation");
const rotationToggleButton = document.querySelector("#rotation-toggle");
const rotationDuration = document.querySelector("#rotation-duration");
const rotationMode = document.querySelector("#rotation-mode");
const rotationPlayButton = document.querySelector("#rotation-play");
const rotationAlbumsElement = document.querySelector("#rotation-albums");

let state;
let rotation = { albumIds: [], albums: [], durationDays: 7, mode: "sequential", expiresAt: null };
let livePlayback = null;
let playbackMonitor = null;
let activeCoverIndex = 0;
let coverflowSource = "all";
let dragPosition = null;
let dragGesture = null;
let suppressCoverClick = false;

const COVER_SPACING = 105;

function renderSpotifyStatus(status) {
  const statusText = document.querySelector("#spotify-status");
  const connectButton = document.querySelector("#spotify-connect-button");
  const connectedBadge = document.querySelector("#spotify-connected-badge");

  if (!status.configured) {
    statusText.textContent = "Add a Spotify developer Client ID to enable connection.";
    connectButton.hidden = true;
    return false;
  }

  if (status.connected) {
    statusText.textContent = `Connected as ${status.profile.displayName}. ${state.albums.length} saved albums are ready as cards.`;
    connectButton.hidden = true;
    connectedBadge.hidden = false;
    return true;
  }

  statusText.textContent = "Authorize access to your saved albums and playback devices.";
  connectButton.hidden = false;
  return false;
}

async function request(path, options) {
  const response = await fetch(path, options);
  if (response.status === 204) return null;
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || "Request failed");
  return body;
}

function renderTargets() {
  if (!state.targets.length) {
    targetsElement.replaceChildren();
    document.querySelector("#destination-status").textContent = "No Spotify devices found. Open Spotify on a device, then refresh.";
    return;
  }
  document.querySelector("#destination-status").textContent = "Choose an available Spotify Connect device.";
  targetsElement.replaceChildren(...state.targets.map((target) => {
    const button = document.createElement("button");
    button.className = "target-card";
    button.classList.toggle("selected", target.id === state.selectedTargetId);
    button.dataset.targetId = target.id;
    button.innerHTML = `
      <span class="target-icon" aria-hidden="true">${target.kind === "group" ? "◉" : "●"}</span>
      <span><strong>${target.name}</strong><small>${target.detail}</small></span>
      <span class="radio-dot" aria-hidden="true"></span>`;
    button.addEventListener("click", () => selectTarget(target.id));
    return button;
  }));
}

async function refreshDevices() {
  refreshDevicesButton.disabled = true;
  refreshDevicesButton.textContent = "Refreshing…";
  try {
    state = await request("/api/spotify/devices", { method: "POST" });
    renderTargets();
  } finally {
    refreshDevicesButton.disabled = false;
    refreshDevicesButton.textContent = "Refresh devices";
  }
}

function renderAlbums() {
  albumsElement.replaceChildren(...state.albums.map((album, index) => {
    const card = document.createElement("article");
    card.className = "album-card";
    card.dataset.albumId = album.id;
    const playButton = document.createElement("button");
    playButton.className = "album-play";
    playButton.type = "button";
    playButton.setAttribute("aria-label", `Play ${album.title} by ${album.artist}`);
    const palette = album.palette ?? ["#8e887d", "#3c3934"];
    card.style.setProperty("--a", palette[0]);
    card.style.setProperty("--b", palette[1]);

    const art = document.createElement("span");
    art.className = `album-art art-${index % 4}`;
    if (album.imageUrl) {
      const image = document.createElement("img");
      image.src = album.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      art.append(image);
    } else {
      const recordHole = document.createElement("span");
      recordHole.className = "record-hole";
      art.append(recordHole);
    }
    const scanHint = document.createElement("span");
    scanHint.className = "scan-hint";
    scanHint.textContent = "Tap card";
    art.append(scanHint);

    const metadata = document.createElement("span");
    metadata.className = "album-meta";
    const title = document.createElement("strong");
    title.textContent = album.title;
    const artist = document.createElement("small");
    artist.textContent = album.artist;
    metadata.append(title, artist);
    playButton.append(art, metadata);

    const pairButton = document.createElement("button");
    pairButton.className = "pair-button";
    pairButton.type = "button";
    pairButton.textContent = "Pair NFC card";
    pairButton.disabled = !("NDEFReader" in globalThis);
    pairButton.addEventListener("click", () => pairAlbum(album));

    const rotationButton = document.createElement("button");
    rotationButton.className = "pair-button rotation-card-button";
    rotationButton.type = "button";
    rotationButton.textContent = rotation.albumIds.includes(album.id) ? "Remove from rotation" : "Add to rotation";
    rotationButton.addEventListener("click", () => toggleAlbumInRotation(album.id));

    playButton.addEventListener("click", () => scanAlbum(album.id));
    card.append(playButton, rotationButton, pairButton);
    return card;
  }));
}

function flowAlbums() {
  return coverflowSource === "rotation" ? rotation.albums : state.albums;
}

function renderCoverFlow() {
  const albums = flowAlbums();
  if (!albums.length) {
    coverflowStage.replaceChildren();
    coverflowStage.classList.add("empty");
    coverflowStage.textContent = coverflowSource === "rotation"
      ? "Add a few albums from Cover Flow or the grid."
      : "No albums available.";
    document.querySelector("#coverflow-position").textContent = "0 / 0";
    document.querySelector("#coverflow-title").textContent = coverflowSource === "rotation" ? "Your rotation is empty" : "No albums";
    document.querySelector("#coverflow-artist").textContent = "";
    document.querySelector("#coverflow-previous").disabled = true;
    document.querySelector("#coverflow-next").disabled = true;
    coverflowPlayButton.disabled = true;
    coverflowPairButton.disabled = true;
    rotationToggleButton.disabled = true;
    rotationToggleButton.textContent = "Add to rotation";
    return;
  }
  coverflowStage.classList.remove("empty");
  activeCoverIndex = moveCoverFlowIndex(activeCoverIndex, 0, albums.length);
  const visiblePosition = dragPosition ?? activeCoverIndex;
  const focusedIndex = moveCoverFlowIndex(Math.round(visiblePosition), 0, albums.length);
  const activeAlbum = albums[focusedIndex];

  coverflowStage.replaceChildren(...getCoverFlowWindow(albums, focusedIndex, 4).map(({ album, index }) => {
    const offset = index - visiblePosition;
    const button = document.createElement("button");
    button.className = "coverflow-cover";
    button.classList.toggle("active", index === focusedIndex);
    button.type = "button";
    button.dataset.albumId = album.id;
    button.style.setProperty("--flow-x", `${offset * 105}px`);
    button.style.setProperty("--flow-z", `${Math.abs(offset) * -85}px`);
    button.style.setProperty("--flow-turn", `${offset * -48}deg`);
    button.style.setProperty("--flow-order", String(10 - Math.abs(offset)));
    button.setAttribute("aria-label", offset === 0
      ? `${album.title} by ${album.artist}, selected`
      : `Select ${album.title} by ${album.artist}`);

    if (album.imageUrl) {
      const image = document.createElement("img");
      image.src = album.imageUrl;
      image.alt = "";
      image.draggable = false;
      image.loading = Math.abs(offset) <= 1.5 ? "eager" : "lazy";
      button.append(image);
    } else {
      button.textContent = album.title;
      button.style.background = `linear-gradient(135deg, ${(album.palette ?? ["#8e887d", "#3c3934"])[0]}, ${(album.palette ?? ["#8e887d", "#3c3934"])[1]})`;
    }

    button.addEventListener("click", () => {
      if (suppressCoverClick) return;
      if (index === focusedIndex) scanAlbum(album.id);
      else {
        activeCoverIndex = index;
        renderCoverFlow();
      }
    });
    return button;
  }));

  document.querySelector("#coverflow-position").textContent = `${focusedIndex + 1} / ${albums.length}`;
  document.querySelector("#coverflow-title").textContent = activeAlbum.title;
  document.querySelector("#coverflow-artist").textContent = activeAlbum.artist;
  document.querySelector("#coverflow-previous").disabled = focusedIndex === 0;
  document.querySelector("#coverflow-next").disabled = focusedIndex === albums.length - 1;
  coverflowPlayButton.disabled = false;
  coverflowPairButton.disabled = !("NDEFReader" in globalThis);
  rotationToggleButton.disabled = false;
  rotationToggleButton.textContent = rotation.albumIds.includes(activeAlbum.id) ? "Remove from rotation" : "Add to rotation";
}

function beginCoverFlowDrag(event) {
  if ((event.button ?? 0) !== 0 || !flowAlbums().length) return;
  dragGesture = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startIndex: activeCoverIndex,
    lastX: event.clientX,
    lastTime: event.timeStamp,
    velocityX: 0,
    moved: false,
  };
  dragPosition = activeCoverIndex;
  coverflowStage.setPointerCapture?.(event.pointerId);
  coverflowElement.classList.add("dragging");
}

function updateCoverFlowDrag(event) {
  if (!dragGesture || event.pointerId !== dragGesture.pointerId) return;
  const elapsed = event.timeStamp - dragGesture.lastTime;
  const movement = event.clientX - dragGesture.lastX;
  if (elapsed > 0) dragGesture.velocityX = movement / elapsed;
  dragGesture.lastX = event.clientX;
  dragGesture.lastTime = event.timeStamp;
  dragGesture.moved ||= Math.abs(event.clientX - dragGesture.startX) > 6;
  dragPosition = getCoverFlowDragPosition({
    startIndex: dragGesture.startIndex,
    displacementX: event.clientX - dragGesture.startX,
    albumCount: flowAlbums().length,
    spacing: COVER_SPACING,
  });
  renderCoverFlow();
}

function finishCoverFlowDrag(event) {
  if (!dragGesture || event.pointerId !== dragGesture.pointerId) return;
  const gesture = dragGesture;
  const velocityX = event.timeStamp - gesture.lastTime > 100 ? 0 : gesture.velocityX;
  activeCoverIndex = settleCoverFlowDrag({
    position: dragPosition ?? gesture.startIndex,
    velocityX,
    albumCount: flowAlbums().length,
    spacing: COVER_SPACING,
  });
  dragGesture = null;
  dragPosition = null;
  coverflowElement.classList.remove("dragging");
  renderCoverFlow();

  if (gesture.moved) {
    suppressCoverClick = true;
    setTimeout(() => { suppressCoverClick = false; }, 0);
  }
}

function moveCoverFlow(delta) {
  activeCoverIndex = moveCoverFlowIndex(activeCoverIndex, delta, flowAlbums().length);
  renderCoverFlow();
}

function setAlbumView(view) {
  const showCoverFlow = view !== "grid";
  coverflowSource = view === "rotation" ? "rotation" : "all";
  activeCoverIndex = 0;
  coverflowElement.hidden = !showCoverFlow;
  albumsElement.hidden = showCoverFlow;
  coverflowViewButton.setAttribute("aria-pressed", String(view === "coverflow"));
  rotationViewButton.setAttribute("aria-pressed", String(view === "rotation"));
  gridViewButton.setAttribute("aria-pressed", String(view === "grid"));
  if (showCoverFlow) renderCoverFlow();
}

function renderRotation() {
  rotationDuration.value = String(rotation.durationDays);
  rotationMode.value = rotation.mode;
  rotationPlayButton.disabled = rotation.albumIds.length === 0;
  document.querySelector("#rotation-status").textContent = rotation.albumIds.length
    ? `${rotation.albumIds.length} album${rotation.albumIds.length === 1 ? "" : "s"} · expires ${new Date(rotation.expiresAt).toLocaleDateString()}`
    : "No albums selected.";

  rotationAlbumsElement.hidden = rotation.albums.length === 0;
  rotationAlbumsElement.replaceChildren(...rotation.albums.map((album, index) => {
    const item = document.createElement("article");
    item.className = "rotation-album";
    item.setAttribute("role", "listitem");

    const artwork = document.createElement("span");
    artwork.className = "rotation-album-art";
    if (album.imageUrl) {
      const image = document.createElement("img");
      image.src = album.imageUrl;
      image.alt = "";
      image.loading = "lazy";
      artwork.append(image);
    }

    const copy = document.createElement("span");
    copy.className = "rotation-album-copy";
    const position = document.createElement("small");
    position.textContent = String(index + 1).padStart(2, "0");
    const title = document.createElement("strong");
    title.textContent = album.title;
    const artist = document.createElement("span");
    artist.textContent = album.artist;
    copy.append(position, title, artist);

    const removeButton = document.createElement("button");
    removeButton.className = "rotation-remove";
    removeButton.type = "button";
    removeButton.textContent = "Remove";
    removeButton.setAttribute("aria-label", `Remove ${album.title} from rotation`);
    removeButton.addEventListener("click", async () => {
      removeButton.disabled = true;
      await saveRotation(removeRotationAlbum(rotation.albumIds, album.id));
    });

    item.append(artwork, copy, removeButton);
    return item;
  }));
}

async function saveRotation(albumIds = rotation.albumIds) {
  rotation = await request("/api/rotation", {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      albumIds,
      durationDays: Number(rotationDuration.value),
      mode: rotationMode.value,
    }),
  });
  renderRotation();
  renderAlbums();
  renderCoverFlow();
}

async function toggleAlbumInRotation(albumId) {
  await saveRotation(toggleRotationAlbum(rotation.albumIds, albumId));
}

async function playRotation() {
  rotationPlayButton.disabled = true;
  rotationPlayButton.textContent = "Building mix…";
  try {
    const result = await request("/api/rotation/play", { method: "POST" });
    document.querySelector("#rotation-status").textContent = result.mode === "shuffle"
      ? `Shuffling ${result.trackCount} songs from ${result.albumCount} albums.`
      : `Playing ${result.albumCount} albums in order · ${result.trackCount} songs.`;
    setTimeout(() => playbackMonitor?.refresh(), 800);
  } finally {
    rotationPlayButton.disabled = rotation.albumIds.length === 0;
    rotationPlayButton.textContent = "Play rotation";
  }
}

function showNfcStatus(message, tone = "") {
  nfcStatusElement.textContent = message;
  nfcStatusElement.dataset.tone = tone;
}

async function pairAlbum(album) {
  showNfcStatus(`Hold a blank NFC card near your phone for ${album.title}…`);
  try {
    await writeAlbumCard(album.id);
    showNfcStatus(`${album.title} is paired. You can scan it now.`, "success");
  } catch (error) {
    showNfcStatus(error.message, "error");
  }
}

async function startNfcScan() {
  scanNfcButton.disabled = true;
  scanNfcButton.textContent = "Listening…";
  showNfcStatus("Waiting for a Physical Favourites card…");
  try {
    await scanAlbumCards(async (albumId) => {
      showNfcStatus("Card recognised. Starting playback…", "success");
      try {
        await scanAlbum(albumId);
        showNfcStatus("Listening for the next card.", "success");
      } catch (error) {
        showNfcStatus(error.message, "error");
      }
    });
    showNfcStatus("NFC reader is active. Tap a paired card.", "success");
  } catch (error) {
    scanNfcButton.disabled = false;
    scanNfcButton.textContent = "Start scanning";
    showNfcStatus(error.message, "error");
  }
}

async function selectTarget(targetId) {
  state = await request("/api/target", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ targetId }),
  });
  renderTargets();
}

async function scanAlbum(albumId) {
  const card = document.querySelector(`[data-album-id="${albumId}"]`);
  card?.classList.add("scanning");

  try {
    const playback = await request("/api/play", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ albumId }),
    });
    showPlayback(playback);
    setTimeout(() => playbackMonitor?.refresh(), 800);
  } finally {
    setTimeout(() => card?.classList.remove("scanning"), 500);
  }
}

function showPlayback(playback) {
  document.querySelector("#playback-mode").textContent = playback.mode === "spotify" ? "Playing on Spotify" : "Simulated playback";
  document.querySelector("#now-title").textContent = `${playback.album.title} — ${playback.album.artist}`;
  document.querySelector("#now-album").textContent = playback.album.title;
  document.querySelector("#now-target").textContent = playback.mode === "spotify"
    ? `Playing on ${playback.target.name}`
    : `Would play on ${playback.target.name}`;
  const miniArt = document.querySelector("#mini-art");
  const palette = playback.album.palette ?? ["#8e887d", "#3c3934"];
  miniArt.style.background = playback.album.imageUrl
    ? `center / cover url("${playback.album.imageUrl}")`
    : `linear-gradient(135deg, ${palette[0]}, ${palette[1]})`;
  nowPlayingElement.hidden = false;
  requestAnimationFrame(() => nowPlayingElement.classList.add("visible"));
}

function showLivePlayback(playback) {
  livePlayback = playback;
  if (!playback) {
    nowPlayingElement.classList.remove("visible");
    nowPlayingElement.hidden = true;
    return;
  }

  document.querySelector("#playback-mode").textContent = playback.isPlaying ? "Now playing on Spotify" : "Paused on Spotify";
  document.querySelector("#now-title").textContent = `${playback.track.title} — ${playback.track.artist}`;
  document.querySelector("#now-album").textContent = playback.album.title;
  document.querySelector("#now-target").textContent = playback.device ? `On ${playback.device.name}` : "Spotify Connect";
  const miniArt = document.querySelector("#mini-art");
  miniArt.style.background = playback.album.imageUrl
    ? `center / cover url("${playback.album.imageUrl}")`
    : "#2d2d29";
  playbackToggleButton.textContent = playback.isPlaying ? "Ⅱ" : "▶";
  playbackToggleButton.setAttribute("aria-label", playback.isPlaying ? "Pause Spotify playback" : "Resume Spotify playback");
  nowPlayingElement.hidden = false;
  requestAnimationFrame(() => nowPlayingElement.classList.add("visible"));
}

async function togglePlayback() {
  if (!livePlayback) return;
  const action = livePlayback.isPlaying ? "pause" : "resume";
  playbackToggleButton.disabled = true;
  try {
    await request(`/api/spotify/playback/${action}`, { method: "POST" });
    showLivePlayback({ ...livePlayback, isPlaying: !livePlayback.isPlaying });
    setTimeout(() => playbackMonitor?.refresh(), 700);
  } finally {
    playbackToggleButton.disabled = false;
  }
}

async function skipNext() {
  playbackNextButton.disabled = true;
  document.querySelector("#playback-mode").textContent = "Skipping track…";
  try {
    await request("/api/spotify/playback/next", { method: "POST" });
    setTimeout(() => playbackMonitor?.refresh(), 700);
  } finally {
    playbackNextButton.disabled = false;
  }
}

state = await request("/api/state");
refreshDevicesButton.addEventListener("click", refreshDevices);
scanNfcButton.addEventListener("click", startNfcScan);
playbackToggleButton.addEventListener("click", togglePlayback);
playbackNextButton.addEventListener("click", skipNext);
document.querySelector("#coverflow-previous").addEventListener("click", () => moveCoverFlow(-1));
document.querySelector("#coverflow-next").addEventListener("click", () => moveCoverFlow(1));
coverflowPlayButton.addEventListener("click", () => scanAlbum(flowAlbums()[activeCoverIndex].id));
coverflowPairButton.addEventListener("click", () => pairAlbum(flowAlbums()[activeCoverIndex]));
rotationToggleButton.addEventListener("click", () => toggleAlbumInRotation(flowAlbums()[activeCoverIndex].id));
coverflowViewButton.addEventListener("click", () => setAlbumView("coverflow"));
rotationViewButton.addEventListener("click", () => setAlbumView("rotation"));
gridViewButton.addEventListener("click", () => setAlbumView("grid"));
rotationDuration.addEventListener("change", () => saveRotation());
rotationMode.addEventListener("change", () => saveRotation());
rotationPlayButton.addEventListener("click", playRotation);
coverflowElement.addEventListener("keydown", (event) => {
  if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
    event.preventDefault();
    moveCoverFlow(event.key === "ArrowLeft" ? -1 : 1);
  }
});
coverflowStage.addEventListener("pointerdown", beginCoverFlowDrag);
coverflowStage.addEventListener("pointermove", updateCoverFlowDrag);
coverflowStage.addEventListener("pointerup", finishCoverFlowDrag);
coverflowStage.addEventListener("pointercancel", finishCoverFlowDrag);

const spotifyStatus = await request("/api/spotify/status");
if (spotifyStatus.connected) {
  try {
    state = await refreshSpotifyOnLoad({ connected: true, request });
  } catch (error) {
    document.querySelector("#destination-status").textContent = error.message;
  }
}
rotation = await request("/api/rotation");

if ("NDEFReader" in globalThis) {
  showNfcStatus("Ready. Start scanning, or pair a blank card to an album.");
} else {
  scanNfcButton.disabled = true;
  showNfcStatus("Web NFC is unavailable here. Use Chrome on an NFC-capable Android phone over HTTPS.");
}

renderTargets();
renderAlbums();
renderCoverFlow();
renderRotation();
renderSpotifyStatus(spotifyStatus);

if (state.lastPlayback) showPlayback(state.lastPlayback);

if (spotifyStatus.connected) {
  playbackMonitor = createPlaybackMonitor({
    request,
    onPlayback: showLivePlayback,
  });
  await playbackMonitor.refresh();

  document.addEventListener("visibilitychange", async () => {
    if (document.visibilityState !== "visible") return;
    try {
      await refreshDevices();
      await playbackMonitor.refresh();
    } catch (error) {
      document.querySelector("#destination-status").textContent = error.message;
    }
  });
}
