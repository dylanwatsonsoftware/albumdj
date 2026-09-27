# Album DJ

A physical Spotify album changer. Load a temporary stack of favourite albums, pick a Spotify Connect device, then play a disc from the changer UI or by tapping its NFC card.

The phone-friendly web page connects to Spotify, imports saved albums, refreshes available devices, writes album IDs to NFC cards, and plays a paired card when it is scanned. Albums can be browsed with a swipeable, momentum-driven Cover Flow or the full grid. Album DJ keeps a smaller set loaded for one or two weeks: tap any numbered disc slot to play that album, play the complete stack in order, or shuffle every song across it. Its bottom player shows Spotify's real current track and device, polls for changes, and can pause, resume, or skip playback.

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

## Load Album DJ

1. Browse Cover Flow or the album grid and press **Add to rotation** on each album you want.
2. Choose whether to keep the shelf for one or two weeks.
3. Tap a numbered disc slot to play that album immediately, or press **Eject** to remove it.
4. Choose **Albums in order** to queue complete albums in the order selected, or **Shuffle every song** to mix all tracks across the stack.
5. Switch to the **Rotation** view to flick through only the loaded albums, then press **Play stack**.

The stack is stored by the server and clears itself after its expiry date. Starting the stack sends an explicit track queue to the currently selected Spotify Connect device.

## Deploy the private beta

The Vercel build supports separate browser sessions. Each person gets their own Spotify tokens, imported library, playback device, and album stack in Cloud Firestore.

1. Create or link a Vercel project.
2. Create a Cloud Firestore database in your Firebase project and generate a Firebase Admin service-account key.
3. Configure the six variables in [`.env.example`](.env.example) for Vercel's production, preview, and development environments. `FIREBASE_PRIVATE_KEY` and `SESSION_SECRET` must remain server-only.
4. Register `https://your-domain/api/auth/spotify/callback` as an exact Spotify redirect URI.
5. Deploy with `vercel --prod`.

Spotify development-mode apps currently support a small allowlist. Add every beta tester in the Spotify developer dashboard before giving them the link. The NFC payload remains only `physical-favourite:<album-id>`, so a card can be used by different Album DJ users without containing anyone's credentials.

## Run the tests

```bash
npm test
```

The tests cover destination selection, Spotify authorization and playback, serverless PKCE restoration, signed browser sessions, isolated Firestore state, device refresh, NFC encoding and scanning, stack expiry and queueing, invalid cards, the local API, and the mobile interface route.

## How it fits together

```text
Android phone                    Future hardware
 Web NFC reader                 ESP32 + PN532 reader
      │                                 │
      └──────── album ID ───────────────┘
                     │
                Album DJ API
                     │
            Spotify Web API playback
                     │
          available Spotify Connect device
```

The playback state and validation live in `src/player-state.js`. The HTTP server in `src/server.js` exposes that behaviour locally, while `api/index.js` adapts the same handler for Vercel. Local development persists Spotify credentials under the ignored `.data/` directory. Hosted sessions are signed with `SESSION_SECRET`, and their separate Spotify, player, and stack state is stored in private Firestore documents through the server-only Firebase Admin SDK. NFC records contain only album IDs.

## Planned milestones

1. Confirm NFC writing and scanning on the target Android phone and card type.
2. Complete the stable Vercel and Firebase production deployment.
3. Add Home Assistant or Google Cast support for Nest speakers and groups that do not appear through Spotify Connect.
4. Add PN532 scanning to the ESP32 and send the same API request used by the web prototype.
5. Render the selected destination, active disc, and album art on the ESP32 display.
6. Design and print the physical album cards.
