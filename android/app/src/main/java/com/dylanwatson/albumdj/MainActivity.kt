package com.dylanwatson.albumdj

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.ExperimentalFoundationApi
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.aspectRatio
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.navigationBarsPadding
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.statusBarsPadding
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.pager.HorizontalPager
import androidx.compose.foundation.pager.PageSize
import androidx.compose.foundation.pager.rememberPagerState
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableIntStateOf
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.rememberCoroutineScope
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.draw.drawBehind
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.graphicsLayer
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontFamily
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dylanwatson.albumdj.data.AlbumDjAccount
import com.dylanwatson.albumdj.data.AlbumDjRepository
import com.dylanwatson.albumdj.data.Artist
import com.dylanwatson.albumdj.library.Album
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.absoluteValue

private const val MOBILE_CONNECT_URL = "https://albumdj.vercel.app/api/mobile/connect"

class MainActivity : ComponentActivity() {
    private lateinit var repository: AlbumDjRepository
    private var sessionToken by mutableStateOf<String?>(null)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = AlbumDjRepository(applicationContext)
        sessionToken = repository.savedToken()
        acceptAuthIntent(intent)
        setContent {
            AlbumDjApp(
                repository = repository,
                sessionToken = sessionToken,
                connect = { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(MOBILE_CONNECT_URL))) },
                openArtist = { artistId, artistName ->
                    val url = "https://albumdj.vercel.app/#artist/${Uri.encode(artistId)}?name=${Uri.encode(artistName)}"
                    startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)))
                },
                openSpotify = { url ->
                    val spotifyIntent = Intent(Intent.ACTION_VIEW, Uri.parse(url)).setPackage("com.spotify.music")
                    runCatching { startActivity(spotifyIntent) }
                        .onFailure { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url))) }
                },
            )
        }
    }

    override fun onNewIntent(intent: Intent) {
        super.onNewIntent(intent)
        setIntent(intent)
        acceptAuthIntent(intent)
    }

    private fun acceptAuthIntent(intent: Intent?) {
        val data = intent?.data
            ?.takeIf { it.scheme == "https" && it.host == "albumdj.vercel.app" && it.path == "/mobile/callback" }
            ?: return
        val token = Uri.parse("https://callback.invalid/?${data.fragment.orEmpty()}")
            .getQueryParameter("token")
            ?.takeIf(String::isNotBlank)
            ?: return
        repository.acceptToken(token)
        sessionToken = token
    }
}

private val Canvas = Color(0xFF0D0E0C)
private val Panel = Color(0xFF191A17)
private val Raised = Color(0xFF22241F)
private val Ink = Color(0xFFF5F1E8)
private val Muted = Color(0xFFA6A89E)
private val Acid = Color(0xFFC9FF32)
private val Coral = Color(0xFFFF786A)
private val DeepInk = Color(0xFF11130F)

@Composable
private fun AlbumDjApp(
    repository: AlbumDjRepository,
    sessionToken: String?,
    connect: () -> Unit,
    openArtist: (String, String) -> Unit,
    openSpotify: (String) -> Unit,
) {
    var account by remember { mutableStateOf(repository.cachedAccount()) }
    var error by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var refresh by remember { mutableIntStateOf(0) }
    var carPreview by remember { mutableStateOf(false) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(sessionToken, refresh) {
        if (sessionToken == null) return@LaunchedEffect
        loading = true
        error = null
        runCatching { withContext(Dispatchers.IO) { repository.sync() } }
            .onSuccess { account = it }
            .onFailure { error = it.message }
        loading = false
    }

    val playAlbum: (String) -> Unit = { albumId ->
        error = null
        loading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.playAlbum(albumId) } }
                .onSuccess { playback -> playback.openUrl?.let(openSpotify) }
                .onFailure { error = it.message }
            loading = false
        }
    }
    val playStack: () -> Unit = {
        error = null
        loading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.playStack() } }
                .onFailure { error = it.message }
            loading = false
        }
    }
    val ejectAlbum: (String) -> Unit = { albumId ->
        error = null
        loading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.ejectAlbum(albumId) } }
                .onSuccess { account = it }
                .onFailure { error = it.message }
            loading = false
        }
    }
    val setAlbumFavourite: (String, Boolean) -> Unit = { albumId, favourite ->
        error = null
        loading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.setAlbumFavourite(albumId, favourite) } }
                .onSuccess { account = it }
                .onFailure { error = it.message }
            loading = false
        }
    }

    MaterialTheme(
        colorScheme = darkColorScheme(primary = Acid, onPrimary = DeepInk, background = Canvas, onBackground = Ink, surface = Panel, onSurface = Ink),
    ) {
        if (carPreview) {
            CarPreview(account?.library ?: AlbumDjLibrary.demo(), { carPreview = false }, playAlbum)
        } else {
            AlbumDjPhone(
                account = account,
                connected = sessionToken != null,
                loading = loading,
                error = error,
                connect = connect,
                refresh = { refresh += 1 },
                preview = { carPreview = true },
                playAlbum = playAlbum,
                playStack = playStack,
                ejectAlbum = ejectAlbum,
                setAlbumFavourite = setAlbumFavourite,
                openArtist = openArtist,
            )
        }
    }
}

@Composable
private fun AlbumDjPhone(
    account: AlbumDjAccount?,
    connected: Boolean,
    loading: Boolean,
    error: String?,
    connect: () -> Unit,
    refresh: () -> Unit,
    preview: () -> Unit,
    playAlbum: (String) -> Unit,
    playStack: () -> Unit,
    ejectAlbum: (String) -> Unit,
    setAlbumFavourite: (String, Boolean) -> Unit,
    openArtist: (String, String) -> Unit,
) {
    var section by remember { mutableStateOf(DEFAULT_PHONE_SECTION) }
    val library = account?.library ?: AlbumDjLibrary.demo()
    Surface(color = Canvas, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            AppHeader(account?.profileName, connected) { section = PhoneSection.SETTINGS }
            if (loading || error != null) StatusStrip(loading, error)
            Box(Modifier.weight(1f)) {
                when (section) {
                    PhoneSection.DISCOVER -> DiscoverScreen(library, { section = PhoneSection.COLLECTION }, { section = PhoneSection.STACK }, playAlbum)
                    PhoneSection.COLLECTION -> CollectionScreen(account?.favouriteArtists.orEmpty(), library, playAlbum)
                    PhoneSection.STACK -> StackScreen(library, playAlbum, playStack, ejectAlbum, setAlbumFavourite, openArtist)
                    PhoneSection.SETTINGS -> SettingsScreen(account, connected, connect, refresh, preview)
                }
            }
            PhoneNavigation(section) { section = it }
        }
    }
}

@Composable
private fun AppHeader(profileName: String?, connected: Boolean, openSettings: () -> Unit) {
    Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.fillMaxWidth().padding(horizontal = 18.dp, vertical = 12.dp)) {
        Box(Modifier.size(34.dp).clip(CircleShape).background(Acid), contentAlignment = Alignment.Center) {
            Box(Modifier.size(13.dp).clip(CircleShape).background(DeepInk))
            Box(Modifier.size(4.dp).clip(CircleShape).background(Coral))
        }
        Text("Album DJ", color = Ink, fontSize = 19.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.padding(start = 10.dp))
        Spacer(Modifier.weight(1f))
        Surface(color = Raised, shape = RoundedCornerShape(24.dp), modifier = Modifier.clickable(onClick = openSettings)) {
            Text(
                if (connected) profileName ?: "Connected" else "Connect Spotify",
                color = if (connected) Ink else Acid,
                fontSize = 11.sp,
                fontWeight = FontWeight.Bold,
                maxLines = 1,
                overflow = TextOverflow.Ellipsis,
                modifier = Modifier.padding(horizontal = 13.dp, vertical = 9.dp),
            )
        }
    }
}

@Composable
private fun StatusStrip(loading: Boolean, error: String?) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().background(if (error == null) Raised else Color(0xFF3A1E1B)).padding(horizontal = 18.dp, vertical = 9.dp),
    ) {
        if (loading) CircularProgressIndicator(color = Acid, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        Text(
            error ?: "Syncing your Album DJ library…",
            color = if (error == null) Muted else Color(0xFFFFAAA0),
            fontSize = 12.sp,
            modifier = Modifier.padding(start = if (loading) 10.dp else 0.dp),
        )
    }
}

@Composable
private fun PageIntro(eyebrow: String, title: String, body: String) {
    Column(Modifier.padding(horizontal = 18.dp, vertical = 18.dp)) {
        Label(eyebrow)
        Text(title, color = Ink, fontSize = 36.sp, lineHeight = 38.sp, fontWeight = FontWeight.Black, letterSpacing = (-1.4).sp)
        Text(body, color = Muted, fontSize = 14.sp, lineHeight = 20.sp, modifier = Modifier.padding(top = 7.dp))
    }
}

@Composable
private fun Label(text: String) {
    Text(
        text.uppercase(),
        color = Acid,
        fontSize = 10.sp,
        letterSpacing = 2.sp,
        fontWeight = FontWeight.Bold,
        fontFamily = FontFamily.Monospace,
        modifier = Modifier.padding(bottom = 7.dp),
    )
}

@Composable
private fun DiscoverScreen(library: AlbumDjLibrary, openCollection: () -> Unit, openStack: () -> Unit, playAlbum: (String) -> Unit) {
    val recent = albumsForPhoneSection(PhoneSection.DISCOVER, library)
    val stack = albumsForPhoneSection(PhoneSection.STACK, library)
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { PageIntro("Discover", "Find your next album", "New releases from artists you love, with your current rotation always close by.") }
        item {
            DarkFeatureCard(
                eyebrow = "Fresh arrivals",
                title = "New releases for you",
                body = if (recent.isEmpty()) "Favourite artists and their newest records will appear here after your next sync." else "${recent.size} recent album${if (recent.size == 1) "" else "s"} from your favourites.",
            ) { if (recent.isNotEmpty()) AlbumShelf(recent, playAlbum) }
        }
        item { GatewayCard("Your collection", "Return to your favourites", "Browse the albums you have deliberately kept close.", "Browse collection", openCollection) }
        item { GatewayCard("On your changer", "${stack.size} album${if (stack.size == 1) "" else "s"} loaded", "Flick through your focused rotation and start the complete stack.", "Open stack", openStack) }
    }
}

@Composable
private fun DarkFeatureCard(eyebrow: String, title: String, body: String, content: @Composable () -> Unit) {
    Column(
        Modifier.padding(horizontal = 12.dp, vertical = 6.dp).clip(RoundedCornerShape(28.dp)).background(Panel)
            .drawBehind { drawCircle(Color(0x183DFF32), radius = size.maxDimension * .7f, center = center.copy(x = size.width)) }
            .padding(vertical = 22.dp),
    ) {
        Column(Modifier.padding(horizontal = 18.dp)) {
            Label(eyebrow)
            Text(title, color = Ink, fontSize = 27.sp, fontWeight = FontWeight.ExtraBold)
            Text(body, color = Muted, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 5.dp, bottom = 14.dp))
        }
        content()
    }
}

@Composable
private fun AlbumShelf(albums: List<LibraryNode>, playAlbum: (String) -> Unit) {
    LazyRow(contentPadding = PaddingValues(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(13.dp)) {
        items(albums, key = { it.id }) { album -> CompactAlbumCard(album, playAlbum) }
    }
}

@Composable
private fun CompactAlbumCard(album: LibraryNode, playAlbum: (String) -> Unit) {
    Column(Modifier.width(154.dp).clickable { playAlbum(album.albumId()) }) {
        AlbumArtwork(album, Modifier.fillMaxWidth().aspectRatio(1f), 15)
        Text(album.title, color = Ink, fontSize = 14.sp, lineHeight = 17.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 9.dp))
        Text(album.subtitle.orEmpty(), color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
    }
}

@Composable
private fun GatewayCard(label: String, title: String, body: String, action: String, onClick: () -> Unit) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.padding(horizontal = 18.dp, vertical = 9.dp).fillMaxWidth().clip(RoundedCornerShape(20.dp)).background(Raised).clickable(onClick = onClick).padding(18.dp),
    ) {
        Column(Modifier.weight(1f)) {
            Label(label)
            Text(title, color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold)
            Text(body, color = Muted, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(top = 4.dp))
            Text("$action  →", color = Acid, fontSize = 11.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 12.dp))
        }
    }
}

@Composable
private fun CollectionScreen(artists: List<Artist>, library: AlbumDjLibrary, playAlbum: (String) -> Unit) {
    val favourites = albumsForPhoneSection(PhoneSection.COLLECTION, library)
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            PageIntro(
                "Saved music",
                "Your collection",
                "${artists.size} favourite artist${if (artists.size == 1) "" else "s"} and ${favourites.size} favourite album${if (favourites.size == 1) "" else "s"}, synced with Album DJ on the web.",
            )
        }
        item { CollectionHeading("Favourite artists") }
        if (artists.isEmpty()) {
            item { EmptyCard("No favourite artists yet", "Favourite artists on the web and refresh this app to bring them here.") }
        } else {
            item { ArtistShelf(artists) }
        }
        item { CollectionHeading("Favourite albums") }
        if (favourites.isEmpty()) {
            item { EmptyCard("No favourite albums yet", "Favourite albums on the web and refresh this app to bring them here.") }
        } else {
            items(favourites.chunked(2)) { rowAlbums ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    rowAlbums.forEach { album -> Box(Modifier.weight(1f)) { GridAlbumCard(album, playAlbum) } }
                    if (rowAlbums.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun CollectionHeading(title: String) {
    Text(
        title,
        color = Ink,
        fontSize = 22.sp,
        fontWeight = FontWeight.ExtraBold,
        modifier = Modifier.padding(horizontal = 18.dp, vertical = 12.dp),
    )
}

@Composable
private fun ArtistShelf(artists: List<Artist>) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        items(artists, key = { it.id }) { artist ->
            Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.width(94.dp)) {
                Box(
                    Modifier.size(88.dp).clip(CircleShape).background(Raised),
                    contentAlignment = Alignment.Center,
                ) {
                    if (artist.imageUrl != null) {
                        AsyncImage(
                            model = artist.imageUrl,
                            contentDescription = artist.name,
                            contentScale = ContentScale.Crop,
                            modifier = Modifier.fillMaxSize(),
                        )
                    } else {
                        Text(
                            artist.name.initials(),
                            color = Acid,
                            fontSize = 22.sp,
                            fontWeight = FontWeight.Black,
                        )
                    }
                }
                Text(
                    artist.name,
                    color = Ink,
                    fontSize = 12.sp,
                    lineHeight = 15.sp,
                    fontWeight = FontWeight.Bold,
                    textAlign = TextAlign.Center,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                    modifier = Modifier.padding(top = 8.dp),
                )
            }
        }
    }
}

private fun String.initials(): String = trim()
    .split(Regex("\\s+"))
    .filter(String::isNotBlank)
    .take(2)
    .joinToString("") { it.take(1).uppercase() }

@Composable
private fun GridAlbumCard(album: LibraryNode, playAlbum: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().clickable { playAlbum(album.albumId()) }) {
        AlbumArtwork(album, Modifier.fillMaxWidth().aspectRatio(1f), 15)
        Text(album.title, color = Ink, fontSize = 15.sp, lineHeight = 18.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        Text(album.subtitle.orEmpty(), color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun StackScreen(
    library: AlbumDjLibrary,
    playAlbum: (String) -> Unit,
    playStack: () -> Unit,
    ejectAlbum: (String) -> Unit,
    setAlbumFavourite: (String, Boolean) -> Unit,
    openArtist: (String, String) -> Unit,
) {
    val stack = albumsForPhoneSection(PhoneSection.STACK, library)
    val pagerState = rememberPagerState(pageCount = { stack.size })
    val coroutineScope = rememberCoroutineScope()
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { PageIntro("Multi-disc changer", "Your album stack", "Flick through this focused rotation or start every loaded album.") }
        if (stack.isEmpty()) {
            item { EmptyCard("Nothing loaded", "Add albums to your stack on the web, then refresh in Settings.") }
        } else {
            item {
                HorizontalPager(
                    state = pagerState,
                    pageSize = PageSize.Fixed(230.dp),
                    contentPadding = PaddingValues(horizontal = 72.dp),
                    pageSpacing = (-34).dp,
                    beyondViewportPageCount = 3,
                    modifier = Modifier.fillMaxWidth().height(252.dp),
                ) { page ->
                    val distance = ((pagerState.currentPage - page) + pagerState.currentPageOffsetFraction).absoluteValue.coerceIn(0f, 1f)
                    val album = stack[page]
                    AlbumArtwork(
                        album,
                        Modifier
                            .padding(vertical = 11.dp)
                            .fillMaxWidth()
                            .aspectRatio(1f)
                            .graphicsLayer {
                                scaleX = 1f - distance * .18f
                                scaleY = 1f - distance * .18f
                                rotationY = if (page < pagerState.currentPage) 42f * distance else -42f * distance
                                alpha = 1f - distance * .24f
                                cameraDistance = 14f * density
                            }
                            .clip(RoundedCornerShape(18.dp))
                            .clickable {
                                coroutineScope.launch { pagerState.animateScrollToPage(page) }
                                playAlbum(album.albumId())
                            },
                        18,
                    )
                }
            }
            item {
                val selected = stack[pagerState.currentPage.coerceIn(stack.indices)]
                Column(horizontalAlignment = Alignment.CenterHorizontally, modifier = Modifier.fillMaxWidth().padding(horizontal = 22.dp, vertical = 8.dp)) {
                    Label("Disc ${pagerState.currentPage + 1} of ${stack.size}")
                    Text(selected.title, color = Ink, fontSize = 23.sp, fontWeight = FontWeight.ExtraBold, textAlign = TextAlign.Center)
                    Text(selected.subtitle.orEmpty(), color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 3.dp))
                    OutlinedButton(onClick = { playAlbum(selected.albumId()) }, modifier = Modifier.padding(top = 12.dp)) { Text("Play this album", color = Ink, fontWeight = FontWeight.Bold) }
                }
            }
            item {
                Column(Modifier.padding(horizontal = 18.dp, vertical = 14.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Panel).padding(18.dp)) {
                    Label("Album DJ · multi-disc changer")
                    Text("Play the complete stack", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    Text("${stack.size} albums are loaded in the same order shown above.", color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 5.dp, bottom = 14.dp))
                    Button(onClick = playStack, colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = DeepInk), modifier = Modifier.fillMaxWidth().height(50.dp)) {
                        Text("PLAY STACK", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold, letterSpacing = 1.5.sp)
                    }
                }
            }
            item { CollectionHeading("Loaded albums") }
            items(library.stack, key = { it.id }) { album ->
                StackAlbumRow(
                    album = album,
                    favourite = library.favourites.any { it.id == album.id },
                    playAlbum = playAlbum,
                    ejectAlbum = ejectAlbum,
                    setAlbumFavourite = setAlbumFavourite,
                    openArtist = openArtist,
                )
            }
        }
    }
}

@Composable
private fun StackAlbumRow(
    album: Album,
    favourite: Boolean,
    playAlbum: (String) -> Unit,
    ejectAlbum: (String) -> Unit,
    setAlbumFavourite: (String, Boolean) -> Unit,
    openArtist: (String, String) -> Unit,
) {
    Column(
        Modifier.padding(horizontal = 18.dp, vertical = 6.dp).fillMaxWidth()
            .clip(RoundedCornerShape(18.dp)).background(Panel).padding(12.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth().clickable { playAlbum(album.id) },
        ) {
            AlbumArtwork(album.asLibraryNode(), Modifier.size(62.dp), 10)
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(album.title, color = Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(album.artist, color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
            }
            Text("PLAY", color = Acid, fontSize = 10.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace)
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        ) {
            StackAction(
                label = if (favourite) "★ Favourited" else "☆ Favourite",
                modifier = Modifier.weight(1f),
            ) { setAlbumFavourite(album.id, !favourite) }
            if (album.artistId != null) {
                StackAction("View artist", Modifier.weight(1f)) { openArtist(album.artistId, album.artist) }
            }
            StackAction("Eject", Modifier.weight(1f), danger = true) { ejectAlbum(album.id) }
        }
    }
}

@Composable
private fun StackAction(label: String, modifier: Modifier = Modifier, danger: Boolean = false, action: () -> Unit) {
    Surface(
        color = Raised,
        shape = RoundedCornerShape(12.dp),
        modifier = modifier.clickable(onClick = action),
    ) {
        Text(
            label,
            color = if (danger) Coral else Ink,
            fontSize = 10.sp,
            lineHeight = 13.sp,
            fontWeight = FontWeight.Bold,
            textAlign = TextAlign.Center,
            modifier = Modifier.padding(horizontal = 7.dp, vertical = 10.dp),
        )
    }
}

private fun Album.asLibraryNode() = LibraryNode(
    id = "album:$id",
    title = title,
    subtitle = artist,
    playable = true,
    imageUrl = imageUrl,
)

@Composable
private fun SettingsScreen(account: AlbumDjAccount?, connected: Boolean, connect: () -> Unit, refresh: () -> Unit, preview: () -> Unit) {
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { PageIntro("Setup", "Settings", "Manage the same Spotify and Firebase-backed account used by Album DJ on the web.") }
        item {
            SettingsCard("Spotify + Album DJ account", if (connected) "Connected as ${account?.profileName ?: "Spotify listener"}. Your favourite artists, favourite albums, and stack come from this account." else "Sign in through the Album DJ website to connect this app to the same Spotify account and Firebase library.") {
                Button(onClick = if (connected) refresh else connect, colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = DeepInk)) {
                    Text(if (connected) "Refresh library" else "Connect Spotify", fontWeight = FontWeight.Bold)
                }
            }
        }
        item { SettingsCard("Android Auto", "Preview the same driver-safe collections exposed to your car.") { OutlinedButton(onClick = preview) { Text("Open car preview", color = Ink, fontWeight = FontWeight.Bold) } } }
        item { SettingsCard("Physical album cards", "NFC pairing remains in the web app for now; this native app shares its Spotify account and saved library.") {} }
    }
}

@Composable
private fun SettingsCard(title: String, body: String, action: @Composable () -> Unit) {
    Column(Modifier.padding(horizontal = 18.dp, vertical = 7.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Panel).padding(19.dp)) {
        Text(title, color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold)
        Text(body, color = Muted, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 5.dp, bottom = 13.dp))
        action()
    }
}

@Composable
private fun EmptyCard(title: String, body: String) {
    Column(Modifier.padding(horizontal = 18.dp, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Panel).padding(22.dp)) {
        Text(title, color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold)
        Text(body, color = Muted, fontSize = 13.sp, lineHeight = 18.sp, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun AlbumArtwork(album: LibraryNode, modifier: Modifier, radius: Int) {
    Box(modifier.clip(RoundedCornerShape(radius.dp)).background(Coral), contentAlignment = Alignment.Center) {
        if (album.imageUrl != null) {
            AsyncImage(model = album.imageUrl, contentDescription = album.title, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
        } else {
            Box(Modifier.size(96.dp).clip(CircleShape).background(DeepInk), contentAlignment = Alignment.Center) { Box(Modifier.size(18.dp).clip(CircleShape).background(Acid)) }
        }
    }
}

@Composable
private fun PhoneNavigation(selected: PhoneSection, select: (PhoneSection) -> Unit) {
    Row(Modifier.fillMaxWidth().background(Panel).padding(horizontal = 5.dp, vertical = 7.dp), horizontalArrangement = Arrangement.SpaceEvenly) {
        PhoneSection.entries.forEach { item ->
            val active = item == selected
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.weight(1f).clip(RoundedCornerShape(14.dp)).clickable { select(item) }.background(if (active) Raised else Color.Transparent).padding(vertical = 7.dp),
            ) {
                Text(item.glyph, color = if (active) Acid else Muted, fontSize = 17.sp)
                Text(item.label, color = if (active) Acid else Muted, fontSize = 9.sp, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 2.dp))
            }
        }
    }
}

@Composable
private fun CarPreview(library: AlbumDjLibrary, close: () -> Unit, playAlbum: (String) -> Unit) {
    var parentId by remember { mutableStateOf(AlbumDjLibrary.ROOT_ID) }
    val carItems = library.children(parentId)
    Surface(color = Canvas, modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.statusBarsPadding().padding(22.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (parentId == AlbumDjLibrary.ROOT_ID) "ALBUM DJ" else "‹ BACK",
                    color = Acid,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable { if (parentId == AlbumDjLibrary.ROOT_ID) close() else parentId = AlbumDjLibrary.ROOT_ID },
                )
                Spacer(Modifier.weight(1f))
                Text("CAR PREVIEW  ✕", color = Muted, fontSize = 12.sp, modifier = Modifier.clickable(onClick = close))
            }
            Text(
                if (parentId == AlbumDjLibrary.ROOT_ID) "Browse" else library.children(AlbumDjLibrary.ROOT_ID).firstOrNull { it.id == parentId }?.title.orEmpty(),
                color = Ink,
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 22.dp, bottom = 18.dp),
            )
            carItems.forEach { item ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier.fillMaxWidth().clip(RoundedCornerShape(14.dp)).clickable {
                        if (item.browsable) parentId = item.id
                        if (item.playable) playAlbum(item.albumId())
                    }.padding(vertical = 13.dp, horizontal = 12.dp),
                ) {
                    Box(Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)).background(if (item.playable) Coral else Acid), contentAlignment = Alignment.Center) {
                        Text(if (item.playable) "♪" else "▦", color = DeepInk, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    }
                    Column(modifier = Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(item.title, color = Ink, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                        if (item.subtitle != null) Text(item.subtitle, color = Muted, fontSize = 14.sp)
                    }
                    if (item.browsable) Text("›", color = Acid, fontSize = 28.sp)
                }
            }
            if (carItems.isEmpty()) Text("Nothing here yet. Add albums on the web, then refresh.", color = Muted, fontSize = 16.sp)
        }
    }
}
