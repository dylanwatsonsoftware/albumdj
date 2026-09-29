package com.dylanwatson.albumdj

import com.dylanwatson.albumdj.data.AlbumDjAccount
import com.dylanwatson.albumdj.data.AlbumPlayback
import com.dylanwatson.albumdj.data.Artist
import com.dylanwatson.albumdj.data.RotationHistoryEntry
import com.dylanwatson.albumdj.data.SearchResults
import com.dylanwatson.albumdj.library.Album
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode
import java.net.URLEncoder
import java.net.URI
import java.net.URLDecoder

enum class PhoneSection(val label: String, val glyph: String) {
    STACK("Stack", "▱"),
    DISCOVER("Discover", "⌕"),
    COLLECTION("Collection", "▤"),
    SETTINGS("Settings", "⚙"),
}

val DEFAULT_PHONE_SECTION = PhoneSection.STACK

const val SUCCESS_NOTICE_DURATION_MS = 3_500L

enum class LibrarySyncVisibility {
    SILENT,
    VISIBLE,
}

fun librarySyncVisibility(hasCachedLibrary: Boolean, userInitiated: Boolean): LibrarySyncVisibility =
    if (hasCachedLibrary && !userInitiated) LibrarySyncVisibility.SILENT else LibrarySyncVisibility.VISIBLE

fun noticeAutoDismissMillis(notice: String?): Long? = notice
    ?.takeIf(String::isNotBlank)
    ?.let { SUCCESS_NOTICE_DURATION_MS }

fun statusOverlayVisible(loading: Boolean, error: String?, notice: String?): Boolean =
    loading || error != null || notice != null

enum class StackPlaybackAction {
    PLAY,
    REAUTHORIZE,
    CONNECT,
}

enum class DiscoverBackAction {
    CLEAR_SEARCH,
    PASS_THROUGH,
}

enum class StackContentSection {
    PLAYBACK,
    COVERFLOW,
    ALBUM_DETAILS,
    ALBUM_LIST,
    HISTORY,
}

enum class StackAlbumAction {
    PLAY,
    FAVOURITE,
    ARTIST,
    EJECT,
}

data class StackCoverFlowLayout(
    val coverWidthDp: Int,
    val pageSpacingDp: Int,
    val horizontalPaddingDp: Int,
    val visibleSideCount: Int,
) {
    val pageStrideDp: Int get() = coverWidthDp + pageSpacingDp
    val visibleCoverCount: Int get() = visibleSideCount * 2 + 1
}

fun stackCoverFlowLayout() = StackCoverFlowLayout(
    coverWidthDp = 194,
    pageSpacingDp = -126,
    horizontalPaddingDp = 96,
    visibleSideCount = 2,
)

enum class StackHistoryKind {
    ALL,
    CURRENT,
    PAST,
}

enum class StackHistoryOrder {
    RECENT,
    TOTAL_TIME,
    TIMES_ADDED,
    ALBUM,
}

data class ArtistFavouriteAction(
    val label: String,
    val selected: Boolean,
)

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
    RELEASE_DESC,
    RELEASE_ASC,
}

sealed interface NativeDestination {
    data object Stack : NativeDestination
    data class Search(val query: String) : NativeDestination
    data class Artist(val id: String, val name: String?) : NativeDestination
}

sealed interface SearchSuggestion {
    val label: String
    data class ArtistSuggestion(val artist: Artist) : SearchSuggestion { override val label = artist.name }
    data class AlbumSuggestion(val album: Album) : SearchSuggestion { override val label = album.title }
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
                    AlbumOrder.RELEASE_DESC -> compareByDescending<Album> { it.releaseDate != null }
                        .thenByDescending { it.releaseDate.orEmpty() }
                    AlbumOrder.RELEASE_ASC -> compareByDescending<Album> { it.releaseDate != null }
                        .thenBy { it.releaseDate.orEmpty() }
                },
            )
            .let { if (albumOrder == AlbumOrder.TITLE_DESC) it.reversed() else it }
    }
    return CollectionView(visibleArtists, visibleAlbums)
}

fun shouldRequestSearchSuggestions(query: String): Boolean = query.trim().length >= 2

fun searchSuggestions(results: SearchResults, limit: Int = 6): List<SearchSuggestion> = buildList {
    results.artists.forEach { add(SearchSuggestion.ArtistSuggestion(it)) }
    results.albums.forEach { add(SearchSuggestion.AlbumSuggestion(it)) }
}.take(limit)

fun parseNativeDestination(raw: String?): NativeDestination? {
    val uri = runCatching { URI(raw ?: return null) }.getOrNull() ?: return null
    val parts = uri.path.orEmpty().trim('/').split('/').filter(String::isNotBlank)
    val route = when {
        uri.scheme == "albumdj" -> listOfNotNull(uri.host) + parts
        uri.scheme == "https" && uri.host == "albumdj.vercel.app" && parts.firstOrNull() == "mobile" -> parts.drop(1)
        else -> return null
    }
    val query = uri.rawQuery.orEmpty().split('&').mapNotNull { item ->
        val pair = item.split('=', limit = 2)
        pair.firstOrNull()?.let { key -> key to URLDecoder.decode(pair.getOrElse(1) { "" }, "UTF-8") }
    }.toMap()
    return when (route.firstOrNull()) {
        "stack" -> NativeDestination.Stack
        "search" -> query["q"]?.takeIf(String::isNotBlank)?.let(NativeDestination::Search)
        "artist" -> route.getOrNull(1)?.takeIf(String::isNotBlank)?.let { NativeDestination.Artist(it, query["name"]) }
        else -> null
    }
}

fun albumCardPayload(albumId: String): String = "physical-favourite:${URLEncoder.encode(albumId, "UTF-8").replace("+", "%20")}"

fun albumIdFromCardPayload(payload: String): String? = payload
    .trim()
    .takeIf { it.startsWith("physical-favourite:") }
    ?.removePrefix("physical-favourite:")
    ?.let { URLDecoder.decode(it, "UTF-8") }
    ?.takeIf(String::isNotBlank)

fun albumIdFromMediaId(mediaId: String): String? = mediaId
    .takeIf { it.startsWith("album:") }
    ?.removePrefix("album:")
    ?.takeIf(String::isNotBlank)

fun discoverAlbumIdeas(library: AlbumDjLibrary, query: String): List<Album> {
    val search = query.trim()
    return library.saved.filter {
        search.isEmpty() ||
            it.title.contains(search, ignoreCase = true) ||
            it.artist.contains(search, ignoreCase = true)
    }
}

fun albumReleaseYear(releaseDate: String?): String? = releaseDate
    ?.trim()
    ?.takeIf { it.length >= 4 }
    ?.take(4)
    ?.takeIf { year -> year.all(Char::isDigit) }

fun artistFavouriteAction(favourite: Boolean) = ArtistFavouriteAction(
    label = if (favourite) "★ Favourite artist" else "☆ Favourite artist",
    selected = favourite,
)

fun optimisticArtistFavourite(
    account: AlbumDjAccount,
    artist: Artist,
    favourite: Boolean,
): AlbumDjAccount = account.copy(
    favouriteArtists = if (favourite) {
        (account.favouriteArtists + artist).distinctBy { it.id }
    } else {
        account.favouriteArtists.filterNot { it.id == artist.id }
    },
)

fun optimisticAlbumFavourite(account: AlbumDjAccount, album: Album, favourite: Boolean): AlbumDjAccount = account.copy(
    library = account.library.copyWith(
        favourites = if (favourite) {
            (account.library.favourites + album).distinctBy { it.id }
        } else {
            account.library.favourites.filterNot { it.id == album.id }
        },
    ),
)

fun optimisticStackAlbum(account: AlbumDjAccount, album: Album, add: Boolean): AlbumDjAccount = account.copy(
    rotation = account.rotation.copy(
        albumIds = if (add) (account.rotation.albumIds + album.id).distinct() else account.rotation.albumIds.filterNot { it == album.id },
    ),
    library = account.library.copyWith(
        stack = if (add) (account.library.stack + album).distinctBy { it.id } else account.library.stack.filterNot { it.id == album.id },
    ),
)

private fun AlbumDjLibrary.copyWith(
    stack: List<Album> = this.stack,
    favourites: List<Album> = this.favourites,
) = AlbumDjLibrary(stack = stack, favourites = favourites, recent = recent, saved = saved)

fun shouldClearSearchWhenOpeningArtist(section: PhoneSection): Boolean = section == PhoneSection.DISCOVER

fun discoverBackAction(hasSearchResults: Boolean): DiscoverBackAction = if (hasSearchResults) {
    DiscoverBackAction.CLEAR_SEARCH
} else {
    DiscoverBackAction.PASS_THROUGH
}

fun stackContentSections(hasAlbums: Boolean, hasHistory: Boolean = false): List<StackContentSection> = buildList {
    if (hasAlbums) {
        add(StackContentSection.PLAYBACK)
        add(StackContentSection.COVERFLOW)
        add(StackContentSection.ALBUM_DETAILS)
        add(StackContentSection.ALBUM_LIST)
    }
    if (hasHistory) add(StackContentSection.HISTORY)
}

fun stackAlbumActions(hasArtist: Boolean): List<StackAlbumAction> = buildList {
    add(StackAlbumAction.PLAY)
    add(StackAlbumAction.FAVOURITE)
    if (hasArtist) add(StackAlbumAction.ARTIST)
    add(StackAlbumAction.EJECT)
}

fun activeStackDuration(entry: RotationHistoryEntry, now: Long): Long = entry.currentAddedAt
    ?.let { (now - it).coerceAtLeast(0) }
    ?: 0

fun totalStackDuration(entry: RotationHistoryEntry, now: Long): Long = entry.totalDurationMs + activeStackDuration(entry, now)

fun stackHistoryView(
    history: List<RotationHistoryEntry>,
    query: String,
    kind: StackHistoryKind,
    order: StackHistoryOrder,
    now: Long,
): List<RotationHistoryEntry> {
    val search = query.trim()
    val filtered = history.filter { entry ->
        val matchesQuery = search.isEmpty() ||
            entry.album.title.contains(search, ignoreCase = true) ||
            entry.album.artist.contains(search, ignoreCase = true)
        val matchesKind = when (kind) {
            StackHistoryKind.ALL -> true
            StackHistoryKind.CURRENT -> entry.currentAddedAt != null
            StackHistoryKind.PAST -> entry.currentAddedAt == null
        }
        matchesQuery && matchesKind
    }
    return when (order) {
        StackHistoryOrder.RECENT -> filtered.sortedByDescending { maxOf(it.lastAddedAt ?: 0, it.lastRemovedAt ?: 0) }
        StackHistoryOrder.TOTAL_TIME -> filtered.sortedByDescending { totalStackDuration(it, now) }
        StackHistoryOrder.TIMES_ADDED -> filtered.sortedByDescending { it.timesAdded }
        StackHistoryOrder.ALBUM -> filtered.sortedWith(compareBy(String.CASE_INSENSITIVE_ORDER) { it.album.title })
    }
}

fun stackPlaybackAction(account: AlbumDjAccount?): StackPlaybackAction = when {
    account == null || !account.connected -> StackPlaybackAction.CONNECT
    !account.playlistAccess -> StackPlaybackAction.REAUTHORIZE
    else -> StackPlaybackAction.PLAY
}

fun stackPlaylistOpenUrl(account: AlbumDjAccount?): String? = account?.rotation?.spotifyPlaylistUrl

fun albumPlaybackNotice(playback: AlbumPlayback): String = if (playback.openUrl == null) {
    "Playing on your selected Spotify device."
} else {
    "Opening this album in Spotify…"
}

fun spotifyAlbumUrl(albumId: String): String {
    val encodedId = URLEncoder.encode(albumId, "UTF-8").replace("+", "%20")
    return "https://open.spotify.com/album/$encodedId"
}

fun albumsForPhoneSection(section: PhoneSection, library: AlbumDjLibrary): List<LibraryNode> = when (section) {
    PhoneSection.DISCOVER -> library.children(AlbumDjLibrary.RECENT_ID)
    PhoneSection.COLLECTION -> library.children(AlbumDjLibrary.FAVOURITES_ID)
    PhoneSection.STACK -> library.children(AlbumDjLibrary.STACK_ID)
    PhoneSection.SETTINGS -> emptyList()
}

fun LibraryNode.albumId(): String = id.removePrefix("album:")
