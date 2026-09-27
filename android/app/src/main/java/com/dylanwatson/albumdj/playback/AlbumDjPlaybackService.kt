package com.dylanwatson.albumdj.playback

import androidx.media3.common.MediaItem
import androidx.media3.common.MediaMetadata
import androidx.media3.exoplayer.ExoPlayer
import androidx.media3.session.LibraryResult
import androidx.media3.session.MediaLibraryService
import androidx.media3.session.MediaSession
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode
import com.google.common.collect.ImmutableList
import com.google.common.util.concurrent.Futures
import com.google.common.util.concurrent.ListenableFuture

class AlbumDjPlaybackService : MediaLibraryService() {
    private lateinit var player: ExoPlayer
    private lateinit var session: MediaLibrarySession
    private val library = AlbumDjLibrary.demo()

    override fun onCreate() {
        super.onCreate()
        player = ExoPlayer.Builder(this).build()
        session = MediaLibrarySession.Builder(this, player, LibraryCallback()).build()
    }

    override fun onGetSession(controllerInfo: MediaSession.ControllerInfo): MediaLibrarySession = session

    override fun onDestroy() {
        session.release()
        player.release()
        super.onDestroy()
    }

    private inner class LibraryCallback : MediaLibrarySession.Callback {
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
            val from = (page * pageSize).coerceAtMost(library.children(parentId).size)
            val to = (from + pageSize).coerceAtMost(library.children(parentId).size)
            val items = library.children(parentId).subList(from, to).map(LibraryNode::asMediaItem)
            return Futures.immediateFuture(LibraryResult.ofItemList(items, params))
        }
    }
}

private fun LibraryNode.asMediaItem(): MediaItem = MediaItem.Builder()
    .setMediaId(id)
    .setMediaMetadata(
        MediaMetadata.Builder()
            .setTitle(title)
            .setArtist(subtitle)
            .setIsBrowsable(browsable)
            .setIsPlayable(playable)
            .setMediaType(
                if (browsable) MediaMetadata.MEDIA_TYPE_FOLDER_ALBUMS
                else MediaMetadata.MEDIA_TYPE_ALBUM,
            )
            .build(),
    )
    .build()
