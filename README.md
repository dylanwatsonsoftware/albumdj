# Physical Favourites

A small prototype for turning Spotify albums into physical NFC cards. Pick a Google speaker or speaker group, tap an album card, and have that album start playing in the selected room.

This first version uses a phone-friendly web page to simulate both the NFC scan and the ESP32 display. Playback is deliberately simulated until Spotify, Google Cast, and Home Assistant are connected.

## Try the prototype

Requirements: Node.js 20 or newer and a phone on the same Wi-Fi network as the computer.

```bash
npm start
```

The command prints two addresses:

- Open the `localhost` address on the computer.
- Open the `Phone` address on a phone connected to the same network.

Choose a destination and tap an album. A confirmation bar shows the command that would be sent to Spotify.

> [!NOTE]
> The speaker names and albums are demo data. No Spotify playback or Google Cast command is sent yet.

## Run the tests

```bash
npm test
```

The tests cover destination selection, simulated NFC scans, invalid cards, the local API, and the mobile interface route.

## How it fits together

```text
Phone UI for now                  Future hardware
      │                                 │
      └── simulated album scan    ESP32 + PN532 NFC reader
                     │                   │
                     └──── local API ────┘
                               │
                       playback adapter
                               │
                 Home Assistant / Spotify / Cast
                               │
                    Nest speaker or speaker group
```

The playback state and validation live in `src/player-state.js`. The dependency-free HTTP server in `src/server.js` exposes that behaviour to the mobile UI. Demo albums and destinations are kept in `src/catalog.js` so they are easy to replace.

## Planned milestones

1. Replace the demo catalogue with the owner's favourite Spotify albums.
2. Connect the playback adapter to Home Assistant and Spotify.
3. Discover or configure real Nest speakers and Google speaker groups.
4. Add PN532 scanning to the ESP32 and send the same API request used by the web prototype.
5. Render the selected destination and album art on the ESP32 display.
6. Encode and print the physical album cards.
