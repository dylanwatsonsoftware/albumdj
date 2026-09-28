package com.dylanwatson.albumdj

import com.dylanwatson.albumdj.data.AlbumDjAccount
import com.dylanwatson.albumdj.data.AlbumPlayback
import com.dylanwatson.albumdj.data.Artist
import com.dylanwatson.albumdj.library.Album
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode

enum class PhoneSection(val label: String, val glyph: String) {
    STACK("Stack", "▱"),
    DISCOVER("Discover", "⌕"),
    COLLECTION("Collection", "▤"),
    SETTINGS("Settings", "⚙"),
}

val DEFAULT_PHONE_SECTION = PhoneSection.STACK

enum class StackPlaybackAction {
    PLAY,
    REAUTHORIZE,
    CONNECT,
}

enum class CollectionKind {
    ALL,
    ARTISTS,
    ALBUMS,
}

enum class ArtistOrder {
    NAME_ASC,
    NAME_DESC,
}

enum class AlbumOrder {
    TITLE_ASC,
    TITLE_DESC,
    ARTIST_ASC,
}

data class CollectionView(
    val artists: List<Artist>,
    val albums: List<Album>,
)

fun collectionView(
    artists: List<Artist>,
    albums: List<Album>,
    query: String,
    kind: CollectionKind,
    artistOrder: ArtistOrder,
    albumOrder: AlbumOrder,
): CollectionView {
    val search = query.trim()
    val visibleArtists = if (kind == CollectionKind.ALBUMS) {
        emptyList()
    } else {
        artists
            .filter { search.isEmpty() || it.name.contains(search, ignoreCase = true) }
            .sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.name })
            .let { if (artistOrder == ArtistOrder.NAME_DESC) it.reversed() else it }
    }
    val visibleAlbums = if (kind == CollectionKind.ARTISTS) {
        emptyList()
    } else {
        albums
            .filter {
                search.isEmpty() ||
                    it.title.contains(search, ignoreCase = true) ||
                    it.artist.contains(search, ignoreCase = true)
            }
            .sortedWith(
                when (albumOrder) {
                    AlbumOrder.TITLE_ASC, AlbumOrder.TITLE_DESC ->
                        compareBy(String.CASE_INSENSITIVE_ORDER) { it.title }
                    AlbumOrder.ARTIST_ASC ->
                        compareBy<Album, String>(String.CASE_INSENSITIVE_ORDER) { it.artist }
                            .thenBy(String.CASE_INSENSITIVE_ORDER) { it.title }
                },
            )
            .let { if (albumOrder == AlbumOrder.TITLE_DESC) it.reversed() else it }
    }
    return CollectionView(visibleArtists, visibleAlbums)
}

fun stackPlaybackAction(account: AlbumDjAccount?): StackPlaybackAction = when {
    account == null || !account.connected -> StackPlaybackAction.CONNECT
    !account.playlistAccess -> StackPlaybackAction.REAUTHORIZE
    else -> StackPlaybackAction.PLAY
}

fun albumPlaybackNotice(playback: AlbumPlayback): String = if (playback.openUrl == null) {
    "Playing on your selected Spotify device."
} else {
    "Opening this album in Spotify…"
}

fun albumsForPhoneSection(section: PhoneSection, library: AlbumDjLibrary): List<LibraryNode> = when (section) {
    PhoneSection.DISCOVER -> library.children(AlbumDjLibrary.RECENT_ID)
    PhoneSection.COLLECTION -> library.children(AlbumDjLibrary.FAVOURITES_ID)
    PhoneSection.STACK -> library.children(AlbumDjLibrary.STACK_ID)
    PhoneSection.SETTINGS -> emptyList()
}

fun LibraryNode.albumId(): String = id.removePrefix("album:")
