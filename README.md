# Physical Favourites

A small prototype for turning Spotify albums into physical NFC cards. Pick an available Spotify Connect device, tap an album card, and have that album start playing there.

The phone-friendly web page connects to Spotify, imports saved albums, refreshes available devices, writes album IDs to NFC cards, and plays a paired card when it is scanned. Albums can be browsed with a swipeable, iPod-inspired Cover Flow or the full grid. A temporary Rotation Shelf keeps a smaller selection for one or two weeks and plays it album-by-album or shuffles every song across the selection. Its bottom player shows Spotify's real current track and device, polls for changes, and can pause, resume, or skip playback.

## Try the prototype

Requirements: Node.js 20 or newer, a Spotify developer application, and Spotify Premium for remote playback. Web NFC needs an NFC-capable Android phone, a compatible browser, and an HTTPS address.

```bash
SPOTIFY_CLIENT_ID=your_client_id \
SPOTIFY_REDIRECT_URI=https://your-public-address/auth/spotify/callback \
npm start
```

Register the same redirect URI in the Spotify developer dashboard. Then open the public HTTPS address on the phone and connect Spotify. Each page load re-imports saved albums and refreshes Spotify devices. Returning to the page after opening Spotify also refreshes devices automatically.

## Pair and scan a card

1. Choose a playback device.
2. Swipe through Cover Flow, or switch to the grid, to choose an album.
3. Press **Pair NFC card** for that album.
4. Hold a writable NFC card near the phone until pairing completes.
5. Press **Start scanning** once and leave the page open.
6. Tap any paired card to play its album.

The card contains a portable text record in the form `physical-favourite:<album-id>`. It does not contain a Spotify access token or other account credentials.

## Make a short rotation

1. Browse Cover Flow or the album grid and press **Add to rotation** on each album you want.
2. Choose whether to keep the shelf for one or two weeks.
3. Choose **Albums in order** to queue complete albums in the order selected, or **Shuffle every song** to mix all tracks across the shelf.
4. Switch to the **Rotation** view to flick through only those albums, then press **Play rotation**.

The shelf is stored by the server and clears itself after its expiry date. Starting the rotation sends an explicit track queue to the currently selected Spotify Connect device.

## Run the tests

```bash
npm test
```

The tests cover destination selection, Spotify authorization and playback, session restoration, device refresh, NFC encoding and scanning, temporary rotation expiry and queueing, invalid cards, the local API, and the mobile interface route.

## How it fits together

```text
Android phone                    Future hardware
 Web NFC reader                 ESP32 + PN532 reader
      │                                 │
      └──────── album ID ───────────────┘
                     │
                 local API
                     │
            Spotify Web API playback
                     │
          available Spotify Connect device
```

The playback state and validation live in `src/player-state.js`. The dependency-free HTTP server in `src/server.js` exposes that behaviour to the mobile UI. Spotify credentials are refreshed and persisted locally under the ignored `.data/` directory. NFC records contain only album IDs.

## Planned milestones

1. Confirm NFC writing and scanning on the target Android phone and card type.
2. Add a stable public address instead of an ephemeral tunnel.
3. Add Home Assistant or Google Cast support for Nest speakers and groups that do not appear through Spotify Connect.
4. Add PN532 scanning to the ESP32 and send the same API request used by the web prototype.
5. Render the selected destination and album art on the ESP32 display.
6. Design and print the physical album cards.
