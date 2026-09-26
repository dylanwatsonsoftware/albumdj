const targetsElement = document.querySelector("#targets");
const albumsElement = document.querySelector("#albums");
const nowPlayingElement = document.querySelector("#now-playing");
const refreshDevicesButton = document.querySelector("#refresh-devices");

let state;

async function renderSpotifyStatus() {
  const statusText = document.querySelector("#spotify-status");
  const connectButton = document.querySelector("#spotify-connect-button");
  const connectedBadge = document.querySelector("#spotify-connected-badge");
  const status = await request("/api/spotify/status");

  if (!status.configured) {
    statusText.textContent = "Add a Spotify developer Client ID to enable connection.";
    connectButton.hidden = true;
    return;
  }

  if (status.connected) {
    statusText.textContent = `Connected as ${status.profile.displayName}. ${state.albums.length} saved albums are ready as cards.`;
    connectButton.hidden = true;
    connectedBadge.hidden = false;
    return true;
  }

  statusText.textContent = "Authorize access to your saved albums and playback devices.";
  connectButton.hidden = false;
}

async function request(path, options) {
  const response = await fetch(path, options);
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
    const button = document.createElement("button");
    button.className = "album-card";
    button.dataset.albumId = album.id;
    const palette = album.palette ?? ["#8e887d", "#3c3934"];
    button.style.setProperty("--a", palette[0]);
    button.style.setProperty("--b", palette[1]);

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
    button.append(art, metadata);
    button.addEventListener("click", () => scanAlbum(album.id));
    return button;
  }));
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
  } finally {
    setTimeout(() => card?.classList.remove("scanning"), 500);
  }
}

function showPlayback(playback) {
  document.querySelector("#playback-mode").textContent = playback.mode === "spotify" ? "Playing on Spotify" : "Simulated playback";
  document.querySelector("#now-title").textContent = `${playback.album.title} — ${playback.album.artist}`;
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

state = await request("/api/state");
refreshDevicesButton.addEventListener("click", refreshDevices);
renderTargets();
renderAlbums();
await renderSpotifyStatus();

if (state.lastPlayback) showPlayback(state.lastPlayback);
