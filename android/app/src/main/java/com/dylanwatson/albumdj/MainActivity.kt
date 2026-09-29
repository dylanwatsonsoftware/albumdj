package com.dylanwatson.albumdj

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import android.text.format.DateUtils
import androidx.activity.ComponentActivity
import androidx.activity.compose.BackHandler
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
import androidx.compose.foundation.text.KeyboardActions
import androidx.compose.foundation.text.KeyboardOptions
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.darkColorScheme
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.getValue
import androidx.compose.runtime.key
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
import androidx.compose.ui.text.input.ImeAction
import androidx.compose.ui.text.style.TextAlign
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import kotlinx.coroutines.delay
import com.dylanwatson.albumdj.data.AlbumDjAccount
import com.dylanwatson.albumdj.data.AlbumDjRepository
import com.dylanwatson.albumdj.data.Artist
import com.dylanwatson.albumdj.data.RotationHistoryEntry
import com.dylanwatson.albumdj.data.SearchResults
import com.dylanwatson.albumdj.library.Album
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext
import kotlin.math.absoluteValue

private const val MOBILE_CONNECT_URL = "https://albumdj.vercel.app/api/mobile/connect"
private const val MOBILE_REAUTHORIZE_URL = "https://albumdj.vercel.app/api/auth/spotify?mobile=1"

class MainActivity : ComponentActivity() {
    private lateinit var repository: AlbumDjRepository
    private var sessionToken by mutableStateOf<String?>(null)
    private var authRevision by mutableIntStateOf(0)

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)
        repository = AlbumDjRepository(applicationContext)
        sessionToken = repository.savedToken()
        acceptAuthIntent(intent)
        setContent {
            AlbumDjApp(
                repository = repository,
                sessionToken = sessionToken,
                authRevision = authRevision,
                connect = { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(MOBILE_CONNECT_URL))) },
                reauthorize = { startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(MOBILE_REAUTHORIZE_URL))) },
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
        authRevision += 1
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
    authRevision: Int,
    connect: () -> Unit,
    reauthorize: () -> Unit,
    openSpotify: (String) -> Unit,
) {
    var account by remember { mutableStateOf(repository.cachedAccount()) }
    var error by remember { mutableStateOf<String?>(null) }
    var notice by remember { mutableStateOf<String?>(null) }
    var loading by remember { mutableStateOf(false) }
    var refresh by remember { mutableIntStateOf(0) }
    var manualRefreshRequested by remember { mutableStateOf(false) }
    var carPreview by remember { mutableStateOf(false) }
    var searchResults by remember { mutableStateOf<SearchResults?>(null) }
    var searchLoading by remember { mutableStateOf(false) }
    var selectedArtist by remember { mutableStateOf<Artist?>(null) }
    var artistAlbums by remember { mutableStateOf<List<Album>>(emptyList()) }
    var artistLoading by remember { mutableStateOf(false) }
    var pendingArtistFavouriteIds by remember { mutableStateOf(emptySet<String>()) }
    val scope = rememberCoroutineScope()

    LaunchedEffect(sessionToken, authRevision, refresh) {
        if (sessionToken == null) return@LaunchedEffect
        val accountAtStart = account
        val userInitiated = manualRefreshRequested
        val visibility = librarySyncVisibility(
            hasCachedLibrary = accountAtStart != null,
            userInitiated = userInitiated,
        )
        val visible = visibility == LibrarySyncVisibility.VISIBLE
        if (visible) {
            loading = true
            error = null
            notice = null
        }
        runCatching { withContext(Dispatchers.IO) { repository.sync() } }
            .onSuccess { refreshedAccount ->
                if (account === accountAtStart) account = refreshedAccount
                if (userInitiated) notice = "Library refreshed."
            }
            .onFailure {
                if (visible) error = "Couldn’t refresh Album DJ. Check your connection and try again."
            }
        if (visible) loading = false
        manualRefreshRequested = false
    }

    LaunchedEffect(notice) {
        val dismissAfter = noticeAutoDismissMillis(notice) ?: return@LaunchedEffect
        val noticeToDismiss = notice
        delay(dismissAfter)
        if (notice == noticeToDismiss) notice = null
    }

    val playAlbum: (String) -> Unit = { albumId ->
        openSpotify(spotifyAlbumUrl(albumId))
        error = null
        notice = null
        loading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.playAlbum(albumId) } }
                .onSuccess { playback ->
                    notice = albumPlaybackNotice(playback)
                }
                .onFailure { error = it.message }
            loading = false
        }
    }
    val playStack: () -> Unit = {
        when (stackPlaybackAction(account)) {
            StackPlaybackAction.CONNECT -> connect()
            StackPlaybackAction.REAUTHORIZE -> reauthorize()
            StackPlaybackAction.PLAY -> {
                val cachedPlaylistUrl = stackPlaylistOpenUrl(account)
                if (cachedPlaylistUrl != null) openSpotify(cachedPlaylistUrl)
                error = null
                notice = null
                loading = cachedPlaylistUrl == null
                scope.launch {
                    runCatching { withContext(Dispatchers.IO) { repository.playStack() } }
                        .onSuccess { playback ->
                            val openUrl = playback.openUrl
                            if (openUrl != null) {
                                account = account?.let { currentAccount ->
                                    currentAccount.copy(
                                        rotation = currentAccount.rotation.copy(spotifyPlaylistUrl = openUrl),
                                    )
                                }
                                if (cachedPlaylistUrl == null) openSpotify(openUrl)
                            }
                            notice = "Opened your Album DJ playlist in Spotify."
                        }
                        .onFailure {
                            if (cachedPlaylistUrl == null) {
                                error = it.message
                            } else {
                                notice = "Opened the saved stack playlist. Couldn’t verify updates right now."
                            }
                        }
                    loading = false
                }
            }
        }
    }
    val ejectAlbum: (String) -> Unit = { albumId ->
        error = null
        notice = null
        loading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.ejectAlbum(albumId) } }
                .onSuccess { account = it }
                .onFailure { error = it.message }
            loading = false
        }
    }
    val search: (String) -> Unit = { query ->
        error = null
        notice = null
        searchLoading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.search(query) } }
                .onSuccess { searchResults = it }
                .onFailure { error = it.message }
            searchLoading = false
        }
    }
    val openArtist: (Artist) -> Unit = { artist ->
        selectedArtist = artist
        artistAlbums = emptyList()
        error = null
        notice = null
        artistLoading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.artistAlbums(artist.id) } }
                .onSuccess { artistAlbums = it }
                .onFailure { error = it.message }
            artistLoading = false
        }
    }
    val addAlbumToStack: (Album) -> Unit = { album ->
        error = null
        notice = null
        loading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.addAlbumToStack(album) } }
                .onSuccess {
                    account = it
                    notice = "${album.title} was added to your stack."
                }
                .onFailure { error = it.message }
            loading = false
        }
    }
    val setAlbumFavourite: (Album, Boolean) -> Unit = { album, favourite ->
        error = null
        notice = null
        loading = true
        scope.launch {
            runCatching { withContext(Dispatchers.IO) { repository.setAlbumFavourite(album, favourite) } }
                .onSuccess {
                    account = it
                    notice = if (favourite) "${album.title} was added to favourites." else "${album.title} was removed from favourites."
                }
                .onFailure { error = it.message }
            loading = false
        }
    }
    val setArtistFavourite: (Artist, Boolean) -> Unit = { artist, favourite ->
        error = null
        notice = null
        val currentAccount = account
        if (currentAccount == null) {
            error = "Refresh your Album DJ library first."
        } else {
            account = optimisticArtistFavourite(currentAccount, artist, favourite)
            pendingArtistFavouriteIds = pendingArtistFavouriteIds + artist.id
            scope.launch {
                runCatching { withContext(Dispatchers.IO) { repository.setArtistFavourite(artist, favourite) } }
                    .onSuccess { savedAccount ->
                        account = account?.copy(favouriteArtists = savedAccount.favouriteArtists) ?: savedAccount
                        notice = if (favourite) "${artist.name} was added to favourites." else "${artist.name} was removed from favourites."
                    }
                    .onFailure {
                        account = account?.let { latest -> optimisticArtistFavourite(latest, artist, !favourite) }
                        error = it.message
                    }
                pendingArtistFavouriteIds = pendingArtistFavouriteIds - artist.id
            }
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
                notice = notice,
                connect = connect,
                reauthorize = reauthorize,
                refresh = {
                    manualRefreshRequested = true
                    refresh += 1
                },
                preview = { carPreview = true },
                playAlbum = playAlbum,
                searchResults = searchResults,
                searchLoading = searchLoading,
                search = search,
                clearSearch = { searchResults = null },
                selectedArtist = selectedArtist,
                artistAlbums = artistAlbums,
                artistLoading = artistLoading,
                pendingArtistFavouriteIds = pendingArtistFavouriteIds,
                closeArtist = { selectedArtist = null },
                playStack = playStack,
                addAlbumToStack = addAlbumToStack,
                ejectAlbum = ejectAlbum,
                setAlbumFavourite = setAlbumFavourite,
                setArtistFavourite = setArtistFavourite,
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
    notice: String?,
    connect: () -> Unit,
    reauthorize: () -> Unit,
    refresh: () -> Unit,
    preview: () -> Unit,
    playAlbum: (String) -> Unit,
    searchResults: SearchResults?,
    searchLoading: Boolean,
    search: (String) -> Unit,
    clearSearch: () -> Unit,
    selectedArtist: Artist?,
    artistAlbums: List<Album>,
    artistLoading: Boolean,
    pendingArtistFavouriteIds: Set<String>,
    closeArtist: () -> Unit,
    playStack: () -> Unit,
    addAlbumToStack: (Album) -> Unit,
    ejectAlbum: (String) -> Unit,
    setAlbumFavourite: (Album, Boolean) -> Unit,
    setArtistFavourite: (Artist, Boolean) -> Unit,
    openArtist: (Artist) -> Unit,
) {
    var section by remember { mutableStateOf(DEFAULT_PHONE_SECTION) }
    val library = account?.library ?: AlbumDjLibrary.demo()
    BackHandler(enabled = selectedArtist != null, onBack = closeArtist)
    Surface(color = Canvas, modifier = Modifier.fillMaxSize()) {
        Column(Modifier.fillMaxSize().statusBarsPadding().navigationBarsPadding()) {
            AppHeader(account?.profileName, connected) { section = PhoneSection.SETTINGS }
            if (loading || error != null || notice != null) StatusStrip(loading, error, notice)
            Box(Modifier.weight(1f)) {
                key(selectedArtist?.id ?: section.name) {
                    if (selectedArtist != null) {
                        ArtistDetailScreen(
                            artist = selectedArtist,
                            albums = artistAlbums,
                            loading = artistLoading,
                            favourite = account?.favouriteArtists.orEmpty().any { it.id == selectedArtist.id },
                            favouriteSaving = selectedArtist.id in pendingArtistFavouriteIds,
                            favouriteAlbumIds = account?.library?.favourites.orEmpty().mapTo(mutableSetOf()) { it.id },
                            stackAlbumIds = account?.rotation?.albumIds.orEmpty().toSet(),
                            close = closeArtist,
                            playAlbum = playAlbum,
                            addAlbumToStack = addAlbumToStack,
                            setAlbumFavourite = setAlbumFavourite,
                            setArtistFavourite = setArtistFavourite,
                            backLabel = "Back to ${section.label}",
                        )
                    } else when (section) {
                        PhoneSection.DISCOVER -> DiscoverScreen(
                            library,
                            connected,
                            searchResults,
                            searchLoading,
                            search,
                            clearSearch,
                            { section = PhoneSection.COLLECTION },
                            { section = PhoneSection.STACK },
                            playAlbum,
                            addAlbumToStack,
                            setAlbumFavourite,
                            { artist ->
                                if (shouldClearSearchWhenOpeningArtist(section)) clearSearch()
                                openArtist(artist)
                            },
                        )
                        PhoneSection.COLLECTION -> CollectionScreen(account?.favouriteArtists.orEmpty(), library, playAlbum, openArtist)
                        PhoneSection.STACK -> StackScreen(
                            library,
                            account?.rotation?.history.orEmpty(),
                            stackPlaybackAction(account),
                            playAlbum,
                            playStack,
                            addAlbumToStack,
                            ejectAlbum,
                            setAlbumFavourite,
                            openArtist,
                        )
                        PhoneSection.SETTINGS -> SettingsScreen(account, connected, connect, reauthorize, refresh, preview)
                    }
                }
            }
            PhoneNavigation(section) {
                closeArtist()
                section = it
            }
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
private fun StatusStrip(loading: Boolean, error: String?, notice: String?) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().background(if (error == null) Raised else Color(0xFF3A1E1B)).padding(horizontal = 18.dp, vertical = 9.dp),
    ) {
        if (loading) CircularProgressIndicator(color = Acid, strokeWidth = 2.dp, modifier = Modifier.size(16.dp))
        Text(
            error ?: notice ?: "Syncing your Album DJ library…",
            color = if (error == null) if (notice == null) Muted else Acid else Color(0xFFFFAAA0),
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
private fun DiscoverScreen(
    library: AlbumDjLibrary,
    connected: Boolean,
    searchResults: SearchResults?,
    searchLoading: Boolean,
    search: (String) -> Unit,
    clearSearch: () -> Unit,
    openCollection: () -> Unit,
    openStack: () -> Unit,
    playAlbum: (String) -> Unit,
    addAlbumToStack: (Album) -> Unit,
    setAlbumFavourite: (Album, Boolean) -> Unit,
    openArtist: (Artist) -> Unit,
) {
    val recent = library.recent
    val stack = library.stack
    var query by remember { mutableStateOf("") }
    var browseQuery by remember { mutableStateOf("") }
    val backAction = discoverBackAction(searchResults != null)
    val exitSearch = {
        query = ""
        clearSearch()
    }
    BackHandler(enabled = backAction == DiscoverBackAction.CLEAR_SEARCH, onBack = exitSearch)
    val ideas = discoverAlbumIdeas(library, browseQuery)
    val submitSearch = { if (query.isNotBlank() && !searchLoading) search(query.trim()) }
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { PageIntro("Discover", "Build your next stack", "Browse albums you already know, watch favourite artists for new releases, or search beyond your library.") }
        item {
            SpotifySearchCard(
                query = query,
                connected = connected,
                loading = searchLoading,
                onQueryChange = {
                    query = it
                    if (searchResults != null) clearSearch()
                },
                submit = submitSearch,
            )
        }
        if (searchResults == null) {
        item {
            DarkFeatureCard(
                eyebrow = "From artists you watch",
                title = "New releases",
                body = if (recent.isEmpty()) "Favourite artists and their newest records will appear here after your next sync." else "${recent.size} recent album${if (recent.size == 1) "" else "s"} ready to consider for your stack.",
            ) {
                if (recent.isNotEmpty()) {
                    DiscoveryAlbumShelf(recent, library, playAlbum, addAlbumToStack, setAlbumFavourite, openArtist)
                }
            }
        }
        item {
            Column(Modifier.padding(horizontal = 18.dp, vertical = 10.dp)) {
                Label("Your Spotify library")
                Text("Browse album ideas", color = Ink, fontSize = 25.sp, fontWeight = FontWeight.ExtraBold)
                Text(
                    "${library.saved.size} saved album${if (library.saved.size == 1) "" else "s"} to pull into this week’s stack.",
                    color = Muted,
                    fontSize = 12.sp,
                    modifier = Modifier.padding(top = 4.dp, bottom = 10.dp),
                )
                OutlinedTextField(
                    value = browseQuery,
                    onValueChange = { browseQuery = it },
                    singleLine = true,
                    label = { Text("Filter saved albums") },
                    placeholder = { Text("Album or artist") },
                    modifier = Modifier.fillMaxWidth(),
                )
            }
        }
        if (ideas.isEmpty()) {
            item {
                EmptyCard(
                    if (library.saved.isEmpty()) "No saved Spotify albums yet" else "No saved albums match",
                    if (library.saved.isEmpty()) "Save albums in Spotify, then refresh Album DJ to browse them here." else "Try another album or artist name.",
                )
            }
        } else {
            items(ideas.chunked(2)) { rowAlbums ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    rowAlbums.forEach { album ->
                        Box(Modifier.weight(1f)) {
                            DiscoveryAlbumCard(album, library, playAlbum, addAlbumToStack, setAlbumFavourite, openArtist)
                        }
                    }
                    if (rowAlbums.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
        }
        if (searchResults != null) {
            if (searchResults.artists.isNotEmpty()) {
                item { CollectionHeading("Artists", "CLEAR", exitSearch) }
                item { ArtistShelf(searchResults.artists, openArtist) }
            }
            if (searchResults.albums.isNotEmpty()) {
                item { CollectionHeading("Album results", "CLEAR", exitSearch) }
                items(searchResults.albums.chunked(2)) { rowAlbums ->
                    Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                        rowAlbums.forEach { album ->
                            Box(Modifier.weight(1f)) {
                                DiscoveryAlbumCard(album, library, playAlbum, addAlbumToStack, setAlbumFavourite, openArtist)
                            }
                        }
                        if (rowAlbums.size == 1) Spacer(Modifier.weight(1f))
                    }
                }
            }
            if (searchResults.albums.isEmpty() && searchResults.artists.isEmpty()) {
                item { CollectionHeading("Search results", "CLEAR", exitSearch) }
                item { EmptyCard("No matches", "Try another artist or album name.") }
            }
        }
        item { GatewayCard("Your collection", "Return to your favourites", "Browse the albums you have deliberately kept close.", "Browse collection", openCollection) }
        item { GatewayCard("On your changer", "${stack.size} album${if (stack.size == 1) "" else "s"} loaded", "Flick through your focused rotation and start the complete stack.", "Open stack", openStack) }
    }
}

@Composable
private fun SpotifySearchCard(
    query: String,
    connected: Boolean,
    loading: Boolean,
    onQueryChange: (String) -> Unit,
    submit: () -> Unit,
) {
    Column(Modifier.padding(horizontal = 18.dp, vertical = 4.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Raised).padding(16.dp)) {
        Label("Search Spotify")
        Text("Find any artist or album, then save it or load it straight into your stack.", color = Muted, fontSize = 12.sp, lineHeight = 17.sp, modifier = Modifier.padding(bottom = 8.dp))
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            enabled = connected && !loading,
            singleLine = true,
            label = { Text("Artist or album") },
            placeholder = { Text("Try Joni Mitchell or Blue") },
            keyboardOptions = KeyboardOptions(imeAction = ImeAction.Search),
            keyboardActions = KeyboardActions(onSearch = { submit() }),
            modifier = Modifier.fillMaxWidth(),
        )
        Button(
            onClick = submit,
            enabled = connected && query.isNotBlank() && !loading,
            colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = DeepInk),
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        ) {
            Text(if (loading) "SEARCHING…" else "SEARCH SPOTIFY", fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
        }
        if (!connected) Text("Connect Spotify in Settings to search its catalogue.", color = Muted, fontSize = 12.sp, modifier = Modifier.padding(top = 9.dp))
    }
}

@Composable
private fun DiscoveryAlbumShelf(
    albums: List<Album>,
    library: AlbumDjLibrary,
    playAlbum: (String) -> Unit,
    addAlbumToStack: (Album) -> Unit,
    setAlbumFavourite: (Album, Boolean) -> Unit,
    openArtist: (Artist) -> Unit,
) {
    LazyRow(contentPadding = PaddingValues(horizontal = 18.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
        items(albums, key = { it.id }) { album ->
            DiscoveryAlbumCard(album, library, playAlbum, addAlbumToStack, setAlbumFavourite, openArtist, Modifier.width(170.dp))
        }
    }
}

@Composable
private fun DiscoveryAlbumCard(
    album: Album,
    library: AlbumDjLibrary,
    playAlbum: (String) -> Unit,
    addAlbumToStack: (Album) -> Unit,
    setAlbumFavourite: (Album, Boolean) -> Unit,
    openArtist: (Artist) -> Unit,
    modifier: Modifier = Modifier,
) {
    val inStack = library.stack.any { it.id == album.id }
    val favourite = library.favourites.any { it.id == album.id }
    Column(modifier.fillMaxWidth().clip(RoundedCornerShape(18.dp)).background(Panel).padding(10.dp)) {
        AlbumArtwork(album.asLibraryNode(), Modifier.fillMaxWidth().aspectRatio(1f).clickable { playAlbum(album.id) }, 13)
        Text(album.title, color = Ink, fontSize = 14.sp, lineHeight = 17.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        Text(album.artistAndYear(), color = Muted, fontSize = 10.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp, bottom = 8.dp))
        StackAction(if (inStack) "✓ In stack" else "+ Add to stack", Modifier.fillMaxWidth(), selected = inStack, enabled = !inStack) {
            if (!inStack) addAlbumToStack(album)
        }
        Row(horizontalArrangement = Arrangement.spacedBy(6.dp), modifier = Modifier.fillMaxWidth().padding(top = 6.dp)) {
            StackAction(if (favourite) "★ Saved" else "☆ Save", Modifier.weight(1f), selected = favourite) {
                setAlbumFavourite(album, !favourite)
            }
            if (album.artistId != null) {
                StackAction("Artist", Modifier.weight(1f)) { openArtist(Artist(album.artistId, album.artist, null)) }
            }
        }
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
        Text(album.artistAndYear(), color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
        Text("TAP TO PLAY", color = Acid, fontSize = 9.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 6.dp))
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
private fun CollectionScreen(
    artists: List<Artist>,
    library: AlbumDjLibrary,
    playAlbum: (String) -> Unit,
    openArtist: (Artist) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf(CollectionKind.ALL) }
    var artistOrder by remember { mutableStateOf(ArtistOrder.NAME_ASC) }
    var albumOrder by remember { mutableStateOf(AlbumOrder.TITLE_ASC) }
    val view = collectionView(artists, library.favourites, query, kind, artistOrder, albumOrder)
    val hasNoMatches = view.artists.isEmpty() && view.albums.isEmpty()
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item {
            PageIntro(
                "Saved music",
                "Your collection",
                "${artists.size} favourite artist${if (artists.size == 1) "" else "s"} and ${library.favourites.size} favourite album${if (library.favourites.size == 1) "" else "s"}, synced with Album DJ on the web.",
            )
        }
        item {
            CollectionControls(
                query = query,
                kind = kind,
                resultCount = view.artists.size + view.albums.size,
                onQueryChange = { query = it },
                onKindChange = { kind = it },
            )
        }
        if (hasNoMatches) {
            item {
                EmptyCard(
                    if (query.isBlank()) "Nothing saved here yet" else "No collection matches",
                    if (query.isBlank()) "Favourite artists and albums to build your collection." else "Try another artist or album name, or change the filter.",
                )
            }
        }
        if (view.artists.isNotEmpty()) {
            item {
                CollectionHeading(
                    title = "Favourite artists",
                    action = if (artistOrder == ArtistOrder.NAME_ASC) "A–Z" else "Z–A",
                    onAction = {
                        artistOrder = if (artistOrder == ArtistOrder.NAME_ASC) ArtistOrder.NAME_DESC else ArtistOrder.NAME_ASC
                    },
                )
            }
            item { ArtistShelf(view.artists, openArtist) }
        }
        if (view.albums.isNotEmpty()) {
            item {
                CollectionHeading(
                    title = "Favourite albums",
                    action = when (albumOrder) {
                        AlbumOrder.TITLE_ASC -> "ALBUM A–Z"
                        AlbumOrder.TITLE_DESC -> "ALBUM Z–A"
                        AlbumOrder.ARTIST_ASC -> "ARTIST A–Z"
                    },
                    onAction = {
                        albumOrder = when (albumOrder) {
                            AlbumOrder.TITLE_ASC -> AlbumOrder.TITLE_DESC
                            AlbumOrder.TITLE_DESC -> AlbumOrder.ARTIST_ASC
                            AlbumOrder.ARTIST_ASC -> AlbumOrder.TITLE_ASC
                        }
                    },
                )
            }
            items(view.albums.chunked(2)) { rowAlbums ->
                Row(Modifier.fillMaxWidth().padding(horizontal = 14.dp, vertical = 7.dp), horizontalArrangement = Arrangement.spacedBy(12.dp)) {
                    rowAlbums.forEach { album -> Box(Modifier.weight(1f)) { GridAlbumCard(album.asLibraryNode(), playAlbum) } }
                    if (rowAlbums.size == 1) Spacer(Modifier.weight(1f))
                }
            }
        }
    }
}

@Composable
private fun CollectionControls(
    query: String,
    kind: CollectionKind,
    resultCount: Int,
    onQueryChange: (String) -> Unit,
    onKindChange: (CollectionKind) -> Unit,
) {
    Column(Modifier.padding(horizontal = 18.dp, vertical = 4.dp)) {
        OutlinedTextField(
            value = query,
            onValueChange = onQueryChange,
            label = { Text("Filter collection") },
            placeholder = { Text("Artist or album") },
            singleLine = true,
            modifier = Modifier.fillMaxWidth(),
        )
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        ) {
            CollectionFilter("All", kind == CollectionKind.ALL, Modifier.weight(1f)) { onKindChange(CollectionKind.ALL) }
            CollectionFilter("Artists", kind == CollectionKind.ARTISTS, Modifier.weight(1f)) { onKindChange(CollectionKind.ARTISTS) }
            CollectionFilter("Albums", kind == CollectionKind.ALBUMS, Modifier.weight(1f)) { onKindChange(CollectionKind.ALBUMS) }
        }
        Text(
            "$resultCount saved item${if (resultCount == 1) "" else "s"} shown",
            color = Muted,
            fontSize = 10.sp,
            fontFamily = FontFamily.Monospace,
            modifier = Modifier.padding(top = 10.dp),
        )
    }
}

@Composable
private fun CollectionFilter(label: String, selected: Boolean, modifier: Modifier, onClick: () -> Unit) {
    if (selected) {
        Button(
            onClick = onClick,
            colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = DeepInk),
            contentPadding = PaddingValues(horizontal = 4.dp),
            modifier = modifier,
        ) { Text(label.uppercase(), fontSize = 10.sp, fontWeight = FontWeight.Bold) }
    } else {
        OutlinedButton(onClick = onClick, contentPadding = PaddingValues(horizontal = 4.dp), modifier = modifier) {
            Text(label.uppercase(), color = Ink, fontSize = 10.sp, fontWeight = FontWeight.Bold)
        }
    }
}

@Composable
private fun CollectionHeading(title: String, action: String? = null, onAction: (() -> Unit)? = null) {
    Row(
        verticalAlignment = Alignment.CenterVertically,
        modifier = Modifier.fillMaxWidth().padding(start = 18.dp, end = 12.dp, top = 14.dp, bottom = 10.dp),
    ) {
        Text(title, color = Ink, fontSize = 22.sp, fontWeight = FontWeight.ExtraBold, modifier = Modifier.weight(1f))
        if (action != null && onAction != null) {
            OutlinedButton(onClick = onAction, contentPadding = PaddingValues(horizontal = 10.dp)) {
                Text(action, color = Acid, fontSize = 9.sp, fontFamily = FontFamily.Monospace, fontWeight = FontWeight.Bold)
            }
        }
    }
}

@Composable
private fun ArtistShelf(artists: List<Artist>, openArtist: ((Artist) -> Unit)? = null) {
    LazyRow(
        contentPadding = PaddingValues(horizontal = 18.dp, vertical = 2.dp),
        horizontalArrangement = Arrangement.spacedBy(16.dp),
    ) {
        items(artists, key = { it.id }) { artist ->
            Column(
                horizontalAlignment = Alignment.CenterHorizontally,
                modifier = Modifier.width(94.dp).then(if (openArtist == null) Modifier else Modifier.clickable { openArtist(artist) }),
            ) {
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
                if (openArtist != null) {
                    Text(
                        "VIEW ALBUMS",
                        color = Acid,
                        fontSize = 8.sp,
                        fontWeight = FontWeight.Bold,
                        fontFamily = FontFamily.Monospace,
                        modifier = Modifier.padding(top = 5.dp),
                    )
                }
            }
        }
    }
}

private fun String.initials(): String = trim()
    .split(Regex("\\s+"))
    .filter(String::isNotBlank)
    .take(2)
    .joinToString("") { it.take(1).uppercase() }

private fun Album.artistAndYear(): String = listOfNotNull(artist, albumReleaseYear(releaseDate)).joinToString(" · ")

private fun LibraryNode.artistAndYear(): String = listOfNotNull(subtitle, albumReleaseYear(releaseDate)).joinToString(" · ")

@Composable
private fun GridAlbumCard(album: LibraryNode, playAlbum: (String) -> Unit) {
    Column(Modifier.fillMaxWidth().clickable { playAlbum(album.albumId()) }) {
        AlbumArtwork(album, Modifier.fillMaxWidth().aspectRatio(1f), 15)
        Text(album.title, color = Ink, fontSize = 15.sp, lineHeight = 18.sp, fontWeight = FontWeight.Bold, maxLines = 2, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 8.dp))
        Text(album.artistAndYear(), color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 2.dp))
        Text("TAP TO PLAY", color = Acid, fontSize = 9.sp, fontWeight = FontWeight.Bold, fontFamily = FontFamily.Monospace, modifier = Modifier.padding(top = 6.dp))
    }
}

@Composable
private fun AlbumActionCard(
    album: Album,
    favourite: Boolean,
    inStack: Boolean,
    playAlbum: (String) -> Unit,
    addAlbumToStack: (Album) -> Unit,
    setAlbumFavourite: (Album, Boolean) -> Unit,
    openArtist: (Artist) -> Unit,
    showArtistAction: Boolean = true,
) {
    Column(
        Modifier.padding(horizontal = 18.dp, vertical = 7.dp).fillMaxWidth()
            .clip(RoundedCornerShape(20.dp)).background(Panel).padding(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AlbumArtwork(album.asLibraryNode(), Modifier.size(82.dp), 12)
            Column(Modifier.padding(start = 13.dp).weight(1f)) {
                Text(album.title, color = Ink, fontSize = 18.sp, lineHeight = 21.sp, fontWeight = FontWeight.ExtraBold, maxLines = 2, overflow = TextOverflow.Ellipsis)
                Text(album.artistAndYear(), color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 4.dp))
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(top = 11.dp)) {
            StackAction("Play", Modifier.weight(1f)) { playAlbum(album.id) }
            StackAction(if (inStack) "✓ In stack" else "+ Add to stack", Modifier.weight(1f), selected = inStack, enabled = !inStack) {
                if (!inStack) addAlbumToStack(album)
            }
        }
        Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(top = 8.dp)) {
            StackAction(if (favourite) "★ Favourited" else "☆ Favourite", Modifier.weight(1f), selected = favourite) {
                setAlbumFavourite(album, !favourite)
            }
            if (showArtistAction && album.artistId != null) {
                StackAction("View artist", Modifier.weight(1f)) {
                    openArtist(Artist(album.artistId, album.artist, null))
                }
            } else {
                Spacer(Modifier.weight(1f))
            }
        }
    }
}

@Composable
private fun ArtistDetailScreen(
    artist: Artist,
    albums: List<Album>,
    loading: Boolean,
    favourite: Boolean,
    favouriteSaving: Boolean,
    favouriteAlbumIds: Set<String>,
    stackAlbumIds: Set<String>,
    close: () -> Unit,
    playAlbum: (String) -> Unit,
    addAlbumToStack: (Album) -> Unit,
    setAlbumFavourite: (Album, Boolean) -> Unit,
    setArtistFavourite: (Artist, Boolean) -> Unit,
    backLabel: String,
) {
    LazyColumn(contentPadding = PaddingValues(bottom = 28.dp)) {
        item {
            Text(
                "← ${backLabel.uppercase()}",
                color = Acid,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.clickable(onClick = close).padding(horizontal = 18.dp, vertical = 15.dp),
            )
        }
        item {
            Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(horizontal = 18.dp, vertical = 8.dp)) {
                Box(Modifier.size(92.dp).clip(CircleShape).background(Raised), contentAlignment = Alignment.Center) {
                    if (artist.imageUrl != null) {
                        AsyncImage(model = artist.imageUrl, contentDescription = artist.name, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
                    } else {
                        Text(artist.name.initials(), color = Acid, fontSize = 24.sp, fontWeight = FontWeight.Black)
                    }
                }
                Column(Modifier.padding(start = 16.dp).weight(1f)) {
                    Label("Artist discography")
                    Text(artist.name, color = Ink, fontSize = 29.sp, lineHeight = 31.sp, fontWeight = FontWeight.Black)
                    val favouriteAction = artistFavouriteAction(favourite)
                    if (favouriteAction.selected) {
                        Button(
                            onClick = { setArtistFavourite(artist, false) },
                            enabled = !favouriteSaving,
                            colors = ButtonDefaults.buttonColors(
                                containerColor = Acid,
                                contentColor = DeepInk,
                                disabledContainerColor = Acid.copy(alpha = 0.72f),
                                disabledContentColor = DeepInk,
                            ),
                            modifier = Modifier.padding(top = 10.dp),
                        ) {
                            Text(favouriteAction.label, fontWeight = FontWeight.Bold)
                        }
                    } else {
                        OutlinedButton(
                            onClick = { setArtistFavourite(artist, true) },
                            enabled = !favouriteSaving,
                            modifier = Modifier.padding(top = 10.dp),
                        ) {
                            Text(favouriteAction.label, color = Ink, fontWeight = FontWeight.Bold)
                        }
                    }
                }
            }
        }
        when {
            loading -> item {
                Row(verticalAlignment = Alignment.CenterVertically, modifier = Modifier.padding(22.dp)) {
                    CircularProgressIndicator(color = Acid, strokeWidth = 2.dp, modifier = Modifier.size(20.dp))
                    Text("Loading albums…", color = Muted, modifier = Modifier.padding(start = 12.dp))
                }
            }
            albums.isEmpty() -> item { EmptyCard("No albums found", "Spotify did not return any albums for this artist.") }
            else -> {
                item { CollectionHeading("Albums") }
                items(albums, key = { it.id }) { album ->
                    AlbumActionCard(
                        album = album,
                        favourite = album.id in favouriteAlbumIds,
                        inStack = album.id in stackAlbumIds,
                        playAlbum = playAlbum,
                        addAlbumToStack = addAlbumToStack,
                        setAlbumFavourite = setAlbumFavourite,
                        openArtist = {},
                        showArtistAction = false,
                    )
                }
            }
        }
    }
}

@OptIn(ExperimentalFoundationApi::class)
@Composable
private fun StackScreen(
    library: AlbumDjLibrary,
    history: List<RotationHistoryEntry>,
    playbackAction: StackPlaybackAction,
    playAlbum: (String) -> Unit,
    playStack: () -> Unit,
    addAlbumToStack: (Album) -> Unit,
    ejectAlbum: (String) -> Unit,
    setAlbumFavourite: (Album, Boolean) -> Unit,
    openArtist: (Artist) -> Unit,
) {
    var showHistory by remember { mutableStateOf(false) }
    BackHandler(enabled = showHistory) { showHistory = false }
    if (showHistory) {
        StackHistoryScreen(history, library, { showHistory = false }, addAlbumToStack)
        return
    }
    val stack = albumsForPhoneSection(PhoneSection.STACK, library)
    val contentSections = stackContentSections(stack.isNotEmpty(), history.isNotEmpty())
    val pagerState = rememberPagerState(pageCount = { stack.size })
    val coroutineScope = rememberCoroutineScope()
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { PageIntro("Multi-disc changer", "Your album stack", "Flick through this focused rotation or start every loaded album.") }
        if (stack.isEmpty()) {
            item { EmptyCard("Nothing loaded", "Add albums to your stack on the web, then refresh in Settings.") }
        } else {
            if (contentSections.firstOrNull() == StackContentSection.PLAYBACK) {
                item { StackPlaybackCard(stack.size, playbackAction, playStack) }
            }
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
                    Text(selected.artistAndYear(), color = Muted, fontSize = 13.sp, modifier = Modifier.padding(top = 3.dp))
                    OutlinedButton(onClick = { playAlbum(selected.albumId()) }, modifier = Modifier.padding(top = 12.dp)) { Text("Play this album", color = Ink, fontWeight = FontWeight.Bold) }
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
        if (StackContentSection.HISTORY in contentSections) {
            item {
                Box(
                    contentAlignment = Alignment.Center,
                    modifier = Modifier.fillMaxWidth().padding(top = 20.dp, bottom = 8.dp),
                ) {
                    OutlinedButton(onClick = { showHistory = true }) {
                        Text(
                            "View stack history · ${history.size}",
                            color = Muted,
                            fontFamily = FontFamily.Monospace,
                            fontSize = 10.sp,
                        )
                    }
                }
            }
        }
    }
}

@Composable
private fun StackHistoryScreen(
    history: List<RotationHistoryEntry>,
    library: AlbumDjLibrary,
    close: () -> Unit,
    addAlbumToStack: (Album) -> Unit,
) {
    var query by remember { mutableStateOf("") }
    var kind by remember { mutableStateOf(StackHistoryKind.ALL) }
    var order by remember { mutableStateOf(StackHistoryOrder.RECENT) }
    val now = System.currentTimeMillis()
    val entries = stackHistoryView(history, query, kind, order, now)
    LazyColumn(contentPadding = PaddingValues(bottom = 28.dp)) {
        item {
            Text(
                "← BACK TO STACK",
                color = Acid,
                fontSize = 12.sp,
                fontWeight = FontWeight.Bold,
                fontFamily = FontFamily.Monospace,
                modifier = Modifier.clickable(onClick = close).padding(horizontal = 18.dp, vertical = 15.dp),
            )
        }
        item { PageIntro("Listening archive", "Stack history", "See what has been loaded, how often it returned, and how long each album stayed in focus.") }
        item {
            Column(Modifier.padding(horizontal = 18.dp, vertical = 4.dp)) {
                OutlinedTextField(
                    value = query,
                    onValueChange = { query = it },
                    label = { Text("Filter history") },
                    placeholder = { Text("Album or artist") },
                    singleLine = true,
                    modifier = Modifier.fillMaxWidth(),
                )
                Row(horizontalArrangement = Arrangement.spacedBy(8.dp), modifier = Modifier.fillMaxWidth().padding(top = 10.dp)) {
                    CollectionFilter("All", kind == StackHistoryKind.ALL, Modifier.weight(1f)) { kind = StackHistoryKind.ALL }
                    CollectionFilter("In stack", kind == StackHistoryKind.CURRENT, Modifier.weight(1f)) { kind = StackHistoryKind.CURRENT }
                    CollectionFilter("Past", kind == StackHistoryKind.PAST, Modifier.weight(1f)) { kind = StackHistoryKind.PAST }
                }
            }
        }
        item {
            CollectionHeading(
                title = "${entries.size} album${if (entries.size == 1) "" else "s"}",
                action = when (order) {
                    StackHistoryOrder.RECENT -> "RECENT"
                    StackHistoryOrder.TOTAL_TIME -> "TOTAL TIME"
                    StackHistoryOrder.TIMES_ADDED -> "MOST LOADED"
                    StackHistoryOrder.ALBUM -> "ALBUM A–Z"
                },
                onAction = {
                    order = when (order) {
                        StackHistoryOrder.RECENT -> StackHistoryOrder.TOTAL_TIME
                        StackHistoryOrder.TOTAL_TIME -> StackHistoryOrder.TIMES_ADDED
                        StackHistoryOrder.TIMES_ADDED -> StackHistoryOrder.ALBUM
                        StackHistoryOrder.ALBUM -> StackHistoryOrder.RECENT
                    }
                },
            )
        }
        if (entries.isEmpty()) {
            item { EmptyCard("No history matches", "Try another filter, or add an album to your stack to begin its history.") }
        } else {
            items(entries, key = { it.album.id }) { entry ->
                StackHistoryCard(entry, entry.album.id in library.stack.map { it.id }.toSet(), now, addAlbumToStack)
            }
        }
    }
}

@Composable
private fun StackHistoryCard(
    entry: RotationHistoryEntry,
    inStack: Boolean,
    now: Long,
    addAlbumToStack: (Album) -> Unit,
) {
    val activeDuration = activeStackDuration(entry, now)
    Column(
        Modifier.padding(horizontal = 18.dp, vertical = 6.dp).fillMaxWidth()
            .clip(RoundedCornerShape(18.dp)).background(Panel).padding(13.dp),
    ) {
        Row(verticalAlignment = Alignment.CenterVertically) {
            AlbumArtwork(entry.album.asLibraryNode(), Modifier.size(68.dp), 10)
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(entry.album.title, color = Ink, fontSize = 17.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(entry.album.artistAndYear(), color = Muted, fontSize = 11.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
                Text(
                    if (inStack) "IN STACK · ${formatStackDuration(activeDuration)}"
                    else "LAST STAY · ${formatStackDuration(entry.lastDurationMs ?: 0)}",
                    color = if (inStack) Acid else Ink,
                    fontSize = 9.sp,
                    fontFamily = FontFamily.Monospace,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.padding(top = 7.dp),
                )
            }
        }
        Text(
            buildString {
                append("Loaded ${entry.timesAdded} time${if (entry.timesAdded == 1) "" else "s"} · ${formatStackDuration(totalStackDuration(entry, now))} total")
                if (!inStack && entry.lastRemovedAt != null) {
                    append(" · removed ")
                    append(DateUtils.getRelativeTimeSpanString(entry.lastRemovedAt, now, DateUtils.MINUTE_IN_MILLIS).toString())
                }
            },
            color = Muted,
            fontSize = 11.sp,
            lineHeight = 16.sp,
            modifier = Modifier.padding(top = 10.dp),
        )
        StackAction(
            label = if (inStack) "✓ In stack" else "+ Add to stack again",
            selected = inStack,
            enabled = !inStack,
            modifier = Modifier.fillMaxWidth().padding(top = 10.dp),
        ) {
            if (!inStack) addAlbumToStack(entry.album)
        }
    }
}

private fun formatStackDuration(durationMs: Long): String {
    val minutes = durationMs.coerceAtLeast(0) / DateUtils.MINUTE_IN_MILLIS
    val hours = minutes / 60
    val days = hours / 24
    return when {
        days > 0 -> "$days day${if (days == 1L) "" else "s"}"
        hours > 0 -> "$hours hour${if (hours == 1L) "" else "s"}"
        minutes > 0 -> "$minutes min"
        else -> "<1 min"
    }
}

@Composable
private fun StackPlaybackCard(
    albumCount: Int,
    playbackAction: StackPlaybackAction,
    playStack: () -> Unit,
) {
    Column(Modifier.padding(horizontal = 18.dp, vertical = 8.dp).fillMaxWidth().clip(RoundedCornerShape(22.dp)).background(Panel).padding(16.dp)) {
        Label("Ready to listen")
        Text(
            when (playbackAction) {
                StackPlaybackAction.PLAY -> "$albumCount loaded album${if (albumCount == 1) "" else "s"} · play the complete stack"
                StackPlaybackAction.REAUTHORIZE -> "Reconnect Spotify to play this stack"
                StackPlaybackAction.CONNECT -> "Connect Spotify to play this stack"
            },
            color = Muted,
            fontSize = 12.sp,
            modifier = Modifier.padding(bottom = 10.dp),
        )
        Button(onClick = playStack, colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = DeepInk), modifier = Modifier.fillMaxWidth().height(50.dp)) {
            Text(
                when (playbackAction) {
                    StackPlaybackAction.PLAY -> "PLAY STACK"
                    StackPlaybackAction.REAUTHORIZE -> "RECONNECT SPOTIFY"
                    StackPlaybackAction.CONNECT -> "CONNECT SPOTIFY"
                },
                fontFamily = FontFamily.Monospace,
                fontWeight = FontWeight.Bold,
                letterSpacing = 1.5.sp,
            )
        }
    }
}

@Composable
private fun StackAlbumRow(
    album: Album,
    favourite: Boolean,
    playAlbum: (String) -> Unit,
    ejectAlbum: (String) -> Unit,
    setAlbumFavourite: (Album, Boolean) -> Unit,
    openArtist: (Artist) -> Unit,
) {
    val actions = stackAlbumActions(album.artistId != null)
    Column(
        Modifier.padding(horizontal = 18.dp, vertical = 6.dp).fillMaxWidth()
            .clip(RoundedCornerShape(18.dp)).background(Panel).padding(14.dp),
    ) {
        Row(
            verticalAlignment = Alignment.CenterVertically,
            modifier = Modifier.fillMaxWidth(),
        ) {
            AlbumArtwork(album.asLibraryNode(), Modifier.size(62.dp), 10)
            Column(Modifier.padding(start = 12.dp).weight(1f)) {
                Text(album.title, color = Ink, fontSize = 16.sp, fontWeight = FontWeight.Bold, maxLines = 1, overflow = TextOverflow.Ellipsis)
                Text(album.artistAndYear(), color = Muted, fontSize = 12.sp, maxLines = 1, overflow = TextOverflow.Ellipsis, modifier = Modifier.padding(top = 3.dp))
            }
        }
        if (StackAlbumAction.PLAY in actions) {
            Button(
                onClick = { playAlbum(album.id) },
                colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = DeepInk),
                modifier = Modifier.fillMaxWidth().padding(top = 12.dp).height(46.dp),
            ) {
                Text("▶  PLAY ALBUM", fontFamily = FontFamily.Monospace, fontSize = 11.sp, fontWeight = FontWeight.Bold, letterSpacing = 1.sp)
            }
        }
        Row(
            horizontalArrangement = Arrangement.spacedBy(8.dp),
            modifier = Modifier.fillMaxWidth().padding(top = 8.dp),
        ) {
            StackOutlinedAction(
                label = if (favourite) "★ Favourited" else "☆ Favourite",
                selected = favourite,
                modifier = Modifier.weight(1f),
            ) { setAlbumFavourite(album, !favourite) }
            if (StackAlbumAction.ARTIST in actions && album.artistId != null) {
                StackOutlinedAction("View artist", Modifier.weight(1f)) { openArtist(Artist(album.artistId, album.artist, null)) }
            }
            StackOutlinedAction("Eject", Modifier.weight(1f), danger = true) { ejectAlbum(album.id) }
        }
    }
}

@Composable
private fun StackOutlinedAction(
    label: String,
    modifier: Modifier = Modifier,
    selected: Boolean = false,
    danger: Boolean = false,
    action: () -> Unit,
) {
    if (selected) {
        Button(
            onClick = action,
            colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = DeepInk),
            contentPadding = PaddingValues(horizontal = 5.dp),
            modifier = modifier.height(44.dp),
        ) {
            Text(label, fontSize = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    } else {
        OutlinedButton(
            onClick = action,
            colors = ButtonDefaults.outlinedButtonColors(contentColor = if (danger) Coral else Ink),
            contentPadding = PaddingValues(horizontal = 5.dp),
            modifier = modifier.height(44.dp),
        ) {
            Text(label, fontSize = 9.sp, fontWeight = FontWeight.Bold, maxLines = 1)
        }
    }
}

@Composable
private fun StackAction(
    label: String,
    modifier: Modifier = Modifier,
    danger: Boolean = false,
    selected: Boolean = false,
    enabled: Boolean = true,
    action: () -> Unit,
) {
    Surface(
        color = if (selected) Acid else Raised,
        shape = RoundedCornerShape(12.dp),
        modifier = modifier.clickable(enabled = enabled, onClick = action),
    ) {
        Text(
            label,
            color = if (selected) DeepInk else if (danger) Coral else Ink,
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
    releaseDate = releaseDate,
)

@Composable
private fun SettingsScreen(account: AlbumDjAccount?, connected: Boolean, connect: () -> Unit, reauthorize: () -> Unit, refresh: () -> Unit, preview: () -> Unit) {
    val needsPlaylistAccess = account?.connected == true && !account.playlistAccess
    LazyColumn(contentPadding = PaddingValues(bottom = 24.dp)) {
        item { PageIntro("Setup", "Settings", "Manage the same Spotify and Firebase-backed account used by Album DJ on the web.") }
        item {
            SettingsCard("Spotify + Album DJ account", if (needsPlaylistAccess) "Reconnect once to grant the private-playlist permission used by Play stack." else if (connected) "Connected as ${account?.profileName ?: "Spotify listener"}. Your favourite artists, favourite albums, and stack come from this account." else "Sign in through the Album DJ website to connect this app to the same Spotify account and Firebase library.") {
                Button(onClick = if (needsPlaylistAccess) reauthorize else if (connected) refresh else connect, colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = DeepInk)) {
                    Text(if (needsPlaylistAccess) "Reconnect Spotify" else if (connected) "Refresh library" else "Connect Spotify", fontWeight = FontWeight.Bold)
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
    BackHandler {
        if (parentId == AlbumDjLibrary.ROOT_ID) close() else parentId = AlbumDjLibrary.ROOT_ID
    }
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
