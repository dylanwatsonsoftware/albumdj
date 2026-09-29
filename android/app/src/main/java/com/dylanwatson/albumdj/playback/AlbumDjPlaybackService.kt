package com.dylanwatson.albumdj.playback

import android.content.Intent
import android.net.Uri
import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.common.util.UnstableApi
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.dylanwatson.albumdj.albumIdFromMediaId
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode
import com.dylanwatson.albumdj.data.AlbumDjCache
import com.dylanwatson.albumdj.data.AlbumDjRepository
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture
import kotlinx.coroutines.CoroutineScope
import kotlinx.coroutines.Dispatchers
import kotlinx.coroutines.SupervisorJob
import kotlinx.coroutines.cancel
import kotlinx.coroutines.launch

@UnstableApi
class AlbumDjPlaybackService : MediaLibraryService() {
    private lateinit var player: ExoPlayer
    private lateinit var session: MediaLibrarySession
    private lateinit var repository: AlbumDjRepository
    private val serviceScope = CoroutineScope(SupervisorJob() + Dispatchers.IO)
    private fun library() = runCatching { AlbumDjCache(this).load()?.account?.library }
        .getOrNull() ?: AlbumDjLibrary.demo()

    override fun onCreate() {
        super.onCreate()
        repository = AlbumDjRepository(applicationContext)
        player = ExoPlayer.Builder(this).build()
        session = MediaLibrarySession.Builder(this, player, LibraryCallback()).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession = session

    override fun onDestroy() {
        serviceScope.cancel()
        session.release()
        player.release()
        super.onDestroy()
    }

    private inner class LibraryCallback : MediaLibrarySession.Callback {
        override fun onSetMediaItems(
            mediaSession: MediaSession,
            controller: MediaSession.ControllerInfo,
            mediaItems: List<MediaItem>,
            startIndex: Int,
            startPositionMs: Long,
        ): ListenableFuture<MediaSession.MediaItemsWithStartPosition> {
            mediaItems.firstNotNullOfOrNull { albumIdFromMediaId(it.mediaId) }?.let { albumId ->
                serviceScope.launch {
                    runCatching { repository.playAlbum(albumId) }
                        .onSuccess { playback -> playback.openUrl?.let(::openSpotify) }
                }
            }
            // Spotify owns audio playback. Keep ExoPlayer from attempting to open a metadata-only item.
            return Futures.immediateFuture(MediaSession.MediaItemsWithStartPosition(emptyList(), 0, 0))
        }

        override fun onGetLibraryRoot(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<MediaItem>> = Futures.immediateFuture(
            LibraryResult.ofItem(
                MediaItem.Builder()
                    .setMediaId(AlbumDjLibrary.ROOT_ID)
                    .setMediaMetadata(
                        MediaMetadata.Builder()
                            .setTitle("Album DJ")
                            .setIsBrowsable(true)
                            .setIsPlayable(false)
                            .setMediaType(MediaMetadata.MEDIA_TYPE_FOLDER_MIXED)
                            .build(),
                    )
                    .build(),
                params,
            ),
        )

        override fun onGetChildren(
            session: MediaLibrarySession,
            browser: MediaSession.ControllerInfo,
            parentId: String,
            page: Int,
            pageSize: Int,
            params: LibraryParams?,
        ): ListenableFuture<LibraryResult<ImmutableList<MediaItem>>> {
            val children = library().children(parentId)
            val from = (page * pageSize).coerceAtMost(children.size)
            val to = (from + pageSize).coerceAtMost(children.size)
            val items = children.subList(from, to).map(LibraryNode::asMediaItem)
            return Futures.immediateFuture(LibraryResult.ofItemList(items, params))
        }
    }

    private fun openSpotify(url: String) {
        val spotify = Intent(Intent.ACTION_VIEW, Uri.parse(url))
            .setPackage("com.spotify.music")
            .addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        runCatching { startActivity(spotify) }
            .onFailure {
                startActivity(Intent(Intent.ACTION_VIEW, Uri.parse(url)).addFlags(Intent.FLAG_ACTIVITY_NEW_TASK))
            }
    }
}

private fun LibraryNode.asMediaItem(): MediaItem = MediaItem.Builder()
    .setMediaId(id)
    .setMediaMetadata(
        MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(subtitle)
            .setArtworkUri(imageUrl?.let(android.net.Uri::parse))
            .setIsBrowsable(browsable)
            .setIsPlayable(playable)
            .setMediaType(
                if (browsable) MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS
                else MediaMetadata.MEDIA_TYPE_ALBUM,
            )
            .build(),
    )
    .build()
