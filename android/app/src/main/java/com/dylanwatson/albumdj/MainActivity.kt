package com.dylanwatson.albumdj

import android.content.Intent
import android.net.Uri
import android.os.Bundle
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.compose.foundation.background
import androidx.compose.foundation.clickable
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.PaddingValues
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedButton
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
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
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.layout.ContentScale
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import coil.compose.AsyncImage
import com.dylanwatson.albumdj.data.AlbumDjAccount
import com.dylanwatson.albumdj.data.AlbumDjRepository
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.launch
import kotlinx.coroutines.withContext

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

private val Ink = Color(0xFF141612)
private val Paper = Color(0xFFF4F0E7)
private val Acid = Color(0xFFC9FF32)
private val Coral = Color(0xFFFF786A)

@Composable
private fun AlbumDjApp(
    repository: AlbumDjRepository,
    sessionToken: String?,
    connect: () -> Unit,
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
                .onFailure { error = it.message }
            loading = false
        }
    }

    MaterialTheme {
        if (carPreview) {
            CarPreview(
                library = account?.library ?: AlbumDjLibrary.demo(),
                close = { carPreview = false },
                playAlbum = playAlbum,
            )
        } else {
            PhoneHome(
                account = account,
                connected = sessionToken != null,
                loading = loading,
                error = error,
                connect = connect,
                refresh = { refresh += 1 },
                preview = { carPreview = true },
                playAlbum = playAlbum,
            )
        }
    }
}

@Composable
private fun PhoneHome(
    account: AlbumDjAccount?,
    connected: Boolean,
    loading: Boolean,
    error: String?,
    connect: () -> Unit,
    refresh: () -> Unit,
    preview: () -> Unit,
    playAlbum: (String) -> Unit,
) {
    val library = account?.library ?: AlbumDjLibrary.demo()
    val stack = library.children(AlbumDjLibrary.STACK_ID)
    Surface(color = Paper, modifier = Modifier.fillMaxSize()) {
        LazyColumn(contentPadding = PaddingValues(vertical = 28.dp)) {
            item {
                Column(modifier = Modifier.padding(horizontal = 24.dp)) {
                    Text("ALBUM DJ", color = Ink, fontSize = 14.sp, fontWeight = FontWeight.Bold)
                    Spacer(Modifier.height(22.dp))
                    Text(
                        if (account?.profileName != null) "${account.profileName}’s current stack" else "Your current stack",
                        color = Ink,
                        fontSize = 36.sp,
                        lineHeight = 38.sp,
                        fontWeight = FontWeight.Black,
                    )
                    Text(
                        when {
                            loading -> "Syncing Spotify and Firebase…"
                            error != null -> error
                            connected -> "Connected to your Album DJ account."
                            else -> "Connect to load the same music you see on the web."
                        },
                        color = if (error == null) Ink.copy(alpha = 0.62f) else Color(0xFF9E342A),
                        fontSize = 16.sp,
                        modifier = Modifier.padding(top = 8.dp),
                    )
                    Row(horizontalArrangement = Arrangement.spacedBy(10.dp), modifier = Modifier.padding(top = 16.dp)) {
                        Button(
                            onClick = if (connected) refresh else connect,
                            colors = ButtonDefaults.buttonColors(containerColor = Ink, contentColor = Color.White),
                        ) { Text(if (connected) "Refresh" else "Connect Spotify", fontWeight = FontWeight.Bold) }
                        OutlinedButton(onClick = preview) { Text("Car preview", color = Ink, fontWeight = FontWeight.Bold) }
                    }
                }
            }
            item {
                LazyRow(
                    contentPadding = PaddingValues(horizontal = 24.dp, vertical = 26.dp),
                    horizontalArrangement = Arrangement.spacedBy(14.dp),
                ) {
                    items(stack) { album -> AlbumCard(album, playAlbum) }
                }
            }
            item {
                Column(
                    modifier = Modifier
                        .padding(horizontal = 24.dp)
                        .clip(RoundedCornerShape(24.dp))
                        .background(Ink)
                        .padding(22.dp),
                ) {
                    Text("ANDROID AUTO", color = Acid, fontSize = 12.sp, fontWeight = FontWeight.Bold)
                    Text("Preview before you drive", color = Color.White, fontSize = 25.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
                    Text("The preview uses the same cached stack and browse categories as the real car screen.", color = Color.White.copy(alpha = 0.68f), lineHeight = 21.sp, modifier = Modifier.padding(top = 6.dp))
                    Button(onClick = preview, colors = ButtonDefaults.buttonColors(containerColor = Acid, contentColor = Ink), modifier = Modifier.padding(top = 16.dp)) {
                        Text("Open car preview", fontWeight = FontWeight.Bold)
                    }
                }
            }
        }
    }
}

@Composable
private fun AlbumCard(album: LibraryNode, playAlbum: (String) -> Unit) {
    Column(modifier = Modifier.width(250.dp)) {
        Box(
            contentAlignment = Alignment.Center,
            modifier = Modifier
                .fillMaxWidth()
                .height(205.dp)
                .clip(RoundedCornerShape(20.dp))
                .background(Coral)
                .clickable { playAlbum(album.id.removePrefix("album:")) },
        ) {
            if (album.imageUrl != null) {
                AsyncImage(model = album.imageUrl, contentDescription = null, contentScale = ContentScale.Crop, modifier = Modifier.fillMaxSize())
            } else {
                Box(Modifier.size(128.dp).clip(CircleShape).background(Ink), contentAlignment = Alignment.Center) {
                    Box(Modifier.size(24.dp).clip(CircleShape).background(Acid))
                }
            }
        }
        Text(album.title, color = Ink, fontSize = 20.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 12.dp))
        Text(album.subtitle.orEmpty(), color = Ink.copy(alpha = 0.58f), fontSize = 15.sp)
        Text("Tap cover to play", color = Ink, fontSize = 11.sp, fontWeight = FontWeight.Bold, modifier = Modifier.padding(top = 5.dp))
    }
}

@Composable
private fun CarPreview(
    library: AlbumDjLibrary,
    close: () -> Unit,
    playAlbum: (String) -> Unit,
) {
    var parentId by remember { mutableStateOf(AlbumDjLibrary.ROOT_ID) }
    val carItems = library.children(parentId)
    Surface(color = Color(0xFF0B0C0B), modifier = Modifier.fillMaxSize()) {
        Column(modifier = Modifier.padding(22.dp)) {
            Row(verticalAlignment = Alignment.CenterVertically) {
                Text(
                    if (parentId == AlbumDjLibrary.ROOT_ID) "ALBUM DJ" else "‹ BACK",
                    color = Acid,
                    fontSize = 14.sp,
                    fontWeight = FontWeight.Bold,
                    modifier = Modifier.clickable {
                        if (parentId == AlbumDjLibrary.ROOT_ID) close() else parentId = AlbumDjLibrary.ROOT_ID
                    },
                )
                Spacer(Modifier.weight(1f))
                Text("CAR PREVIEW  ✕", color = Color.White.copy(alpha = 0.65f), fontSize = 12.sp, modifier = Modifier.clickable(onClick = close))
            }
            Text(
                if (parentId == AlbumDjLibrary.ROOT_ID) "Browse" else library.children(AlbumDjLibrary.ROOT_ID).firstOrNull { it.id == parentId }?.title.orEmpty(),
                color = Color.White,
                fontSize = 34.sp,
                fontWeight = FontWeight.Bold,
                modifier = Modifier.padding(top = 22.dp, bottom = 18.dp),
            )
            carItems.forEach { item ->
                Row(
                    verticalAlignment = Alignment.CenterVertically,
                    modifier = Modifier
                        .fillMaxWidth()
                        .clip(RoundedCornerShape(14.dp))
                        .clickable {
                            if (item.browsable) parentId = item.id
                            if (item.playable) playAlbum(item.id.removePrefix("album:"))
                        }
                        .padding(vertical = 13.dp, horizontal = 12.dp),
                ) {
                    Box(Modifier.size(52.dp).clip(RoundedCornerShape(8.dp)).background(if (item.playable) Coral else Acid), contentAlignment = Alignment.Center) {
                        Text(if (item.playable) "♪" else "▦", color = Ink, fontSize = 22.sp, fontWeight = FontWeight.Bold)
                    }
                    Column(modifier = Modifier.padding(start = 14.dp).weight(1f)) {
                        Text(item.title, color = Color.White, fontSize = 19.sp, fontWeight = FontWeight.Bold)
                        if (item.subtitle != null) Text(item.subtitle, color = Color.White.copy(alpha = 0.58f), fontSize = 14.sp)
                    }
                    if (item.browsable) Text("›", color = Acid, fontSize = 28.sp)
                }
            }
            if (carItems.isEmpty()) Text("Nothing here yet. Add albums on the web, then refresh.", color = Color.White.copy(alpha = 0.6f), fontSize = 16.sp)
        }
    }
}
