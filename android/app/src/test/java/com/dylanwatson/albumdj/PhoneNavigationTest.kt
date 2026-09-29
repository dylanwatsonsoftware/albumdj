package com.dylanwatson.albumdj

import com.dylanwatson.albumdj.data.AlbumDjAccount
import com.dylanwatson.albumdj.data.AlbumPlayback
import com.dylanwatson.albumdj.data.Rotation
import com.dylanwatson.albumdj.data.RotationHistoryEntry
import com.dylanwatson.albumdj.library.Album
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import org.junit.Assert.assertEquals
import org.junit.Test

class PhoneNavigationTest {
    private val library = AlbumDjLibrary(
        stack = listOf(Album("stack", "Stack album", "Stack artist")),
        favourites = listOf(Album("favourite", "Favourite album", "Favourite artist")),
        recent = listOf(Album("recent", "Recent album", "Recent artist")),
    )

    @Test
    fun `stack is the first phone navigation tab`() {
        assertEquals(
            listOf("Stack", "Discover", "Collection", "Settings"),
            PhoneSection.entries.map { it.label },
        )
    }

    @Test
    fun `stack is the default phone section`() {
        assertEquals(PhoneSection.STACK, DEFAULT_PHONE_SECTION)
    }

    @Test
    fun `each music section resolves the right account collection`() {
        assertEquals(listOf("Recent album"), albumsForPhoneSection(PhoneSection.DISCOVER, library).map { it.title })
        assertEquals(listOf("Favourite album"), albumsForPhoneSection(PhoneSection.COLLECTION, library).map { it.title })
        assertEquals(listOf("Stack album"), albumsForPhoneSection(PhoneSection.STACK, library).map { it.title })
        assertEquals(emptyList<String>(), albumsForPhoneSection(PhoneSection.SETTINGS, library).map { it.title })
    }

    @Test
    fun `playable album id is extracted from library node`() {
        val node = library.children(AlbumDjLibrary.STACK_ID).first()
        assertEquals("stack", node.albumId())
    }

    @Test
    fun `stack playback asks connected accounts without playlist scope to reauthorize`() {
        assertEquals(
            StackPlaybackAction.REAUTHORIZE,
            stackPlaybackAction(account(connected = true, playlistAccess = false)),
        )
    }

    @Test
    fun `stack playback plays once playlist scope is granted`() {
        assertEquals(
            StackPlaybackAction.PLAY,
            stackPlaybackAction(account(connected = true, playlistAccess = true)),
        )
    }

    @Test
    fun `stack playback asks disconnected accounts to connect`() {
        assertEquals(StackPlaybackAction.CONNECT, stackPlaybackAction(null))
        assertEquals(
            StackPlaybackAction.CONNECT,
            stackPlaybackAction(account(connected = false, playlistAccess = false)),
        )
    }

    @Test
    fun `album playback reports whether Spotify started or must be opened`() {
        assertEquals(
            "Playing on your selected Spotify device.",
            albumPlaybackNotice(AlbumPlayback(openUrl = null)),
        )
        assertEquals(
            "Opening this album in Spotify…",
            albumPlaybackNotice(AlbumPlayback(openUrl = "https://open.spotify.com/album/blue")),
        )
    }

    @Test
    fun `album play actions can open the Spotify album without waiting for the server`() {
        assertEquals(
            "https://open.spotify.com/album/an%20album%2Fid",
            spotifyAlbumUrl("an album/id"),
        )
    }

    @Test
    fun `success notices dismiss after a short readable interval`() {
        assertEquals(3_500L, noticeAutoDismissMillis("Blue was added to your stack."))
        assertEquals(null, noticeAutoDismissMillis(null))
        assertEquals(null, noticeAutoDismissMillis(""))
    }

    @Test
    fun `collection filters artists and albums together by name`() {
        val view = collectionView(
            artists = listOf(
                com.dylanwatson.albumdj.data.Artist("joni", "Joni Mitchell", null),
                com.dylanwatson.albumdj.data.Artist("radiohead", "Radiohead", null),
            ),
            albums = listOf(
                Album("blue", "Blue", "Joni Mitchell"),
                Album("rainbows", "In Rainbows", "Radiohead"),
            ),
            query = "joni",
            kind = CollectionKind.ALL,
            artistOrder = ArtistOrder.NAME_ASC,
            albumOrder = AlbumOrder.TITLE_ASC,
        )

        assertEquals(listOf("Joni Mitchell"), view.artists.map { it.name })
        assertEquals(listOf("Blue"), view.albums.map { it.title })
    }

    @Test
    fun `collection kind hides the other saved music type`() {
        val artists = listOf(com.dylanwatson.albumdj.data.Artist("joni", "Joni Mitchell", null))
        val albums = listOf(Album("blue", "Blue", "Joni Mitchell"))

        assertEquals(emptyList<String>(), collectionView(artists, albums, "", CollectionKind.ALBUMS, ArtistOrder.NAME_ASC, AlbumOrder.TITLE_ASC).artists.map { it.name })
        assertEquals(emptyList<String>(), collectionView(artists, albums, "", CollectionKind.ARTISTS, ArtistOrder.NAME_ASC, AlbumOrder.TITLE_ASC).albums.map { it.title })
    }

    @Test
    fun `collection sorts artists and albums independently`() {
        val view = collectionView(
            artists = listOf(
                com.dylanwatson.albumdj.data.Artist("a", "Air", null),
                com.dylanwatson.albumdj.data.Artist("z", "Zero 7", null),
            ),
            albums = listOf(
                Album("z", "Zooropa", "U2"),
                Album("a", "Abbey Road", "The Beatles"),
            ),
            query = "",
            kind = CollectionKind.ALL,
            artistOrder = ArtistOrder.NAME_DESC,
            albumOrder = AlbumOrder.ARTIST_ASC,
        )

        assertEquals(listOf("Zero 7", "Air"), view.artists.map { it.name })
        assertEquals(listOf("Abbey Road", "Zooropa"), view.albums.map { it.title })
    }

    @Test
    fun `discover ideas use the full saved Spotify album library`() {
        val discoverLibrary = AlbumDjLibrary(
            stack = emptyList(),
            favourites = listOf(Album("favourite", "A favourite", "Artist")),
            recent = listOf(Album("recent", "A new release", "Artist")),
            saved = listOf(
                Album("blue", "Blue", "Joni Mitchell"),
                Album("rainbows", "In Rainbows", "Radiohead"),
            ),
        )

        assertEquals(
            listOf("Blue", "In Rainbows"),
            discoverAlbumIdeas(discoverLibrary, "").map { it.title },
        )
    }

    @Test
    fun `discover ideas filter saved albums by title or artist`() {
        val discoverLibrary = AlbumDjLibrary(
            stack = emptyList(),
            saved = listOf(
                Album("blue", "Blue", "Joni Mitchell"),
                Album("rainbows", "In Rainbows", "Radiohead"),
            ),
        )

        assertEquals(listOf("Blue"), discoverAlbumIdeas(discoverLibrary, "joni").map { it.title })
        assertEquals(listOf("In Rainbows"), discoverAlbumIdeas(discoverLibrary, "rain").map { it.title })
    }

    @Test
    fun `album release year is shown when Spotify supplies a date`() {
        assertEquals("1971", albumReleaseYear("1971-06-22"))
        assertEquals("2026", albumReleaseYear("2026"))
        assertEquals(null, albumReleaseYear(null))
        assertEquals(null, albumReleaseYear(""))
    }

    @Test
    fun `favourite artist action is visibly selected`() {
        assertEquals(
            ArtistFavouriteAction("☆ Favourite artist", false),
            artistFavouriteAction(false),
        )
        assertEquals(
            ArtistFavouriteAction("★ Favourite artist", true),
            artistFavouriteAction(true),
        )
    }

    @Test
    fun `favourite artist state changes locally before persistence completes`() {
        val artist = com.dylanwatson.albumdj.data.Artist("joni", "Joni Mitchell", null)
        val original = account(connected = true, playlistAccess = true)

        val added = optimisticArtistFavourite(original, artist, favourite = true)
        assertEquals(listOf("joni"), added.favouriteArtists.map { it.id })
        assertEquals(emptyList<String>(), optimisticArtistFavourite(added, artist, favourite = false).favouriteArtists.map { it.id })
    }

    @Test
    fun `opening an artist from discover clears the temporary search mode`() {
        assertEquals(true, shouldClearSearchWhenOpeningArtist(PhoneSection.DISCOVER))
        assertEquals(false, shouldClearSearchWhenOpeningArtist(PhoneSection.COLLECTION))
        assertEquals(false, shouldClearSearchWhenOpeningArtist(PhoneSection.STACK))
    }

    @Test
    fun `discover search results are treated as a nested back destination`() {
        assertEquals(DiscoverBackAction.CLEAR_SEARCH, discoverBackAction(hasSearchResults = true))
        assertEquals(DiscoverBackAction.PASS_THROUGH, discoverBackAction(hasSearchResults = false))
    }

    @Test
    fun `stack playback action is the first control after the heading`() {
        assertEquals(
            listOf(StackContentSection.PLAYBACK, StackContentSection.COVERFLOW, StackContentSection.ALBUM_DETAILS, StackContentSection.ALBUM_LIST, StackContentSection.HISTORY),
            stackContentSections(hasAlbums = true, hasHistory = true),
        )
        assertEquals(listOf(StackContentSection.HISTORY), stackContentSections(hasAlbums = false, hasHistory = true))
    }

    @Test
    fun `stack album cards expose an explicit play action before secondary actions`() {
        assertEquals(
            listOf(StackAlbumAction.PLAY, StackAlbumAction.FAVOURITE, StackAlbumAction.ARTIST, StackAlbumAction.EJECT),
            stackAlbumActions(hasArtist = true),
        )
        assertEquals(
            listOf(StackAlbumAction.PLAY, StackAlbumAction.FAVOURITE, StackAlbumAction.EJECT),
            stackAlbumActions(hasArtist = false),
        )
    }

    @Test
    fun `stack history filters past albums and sorts by repeat listens`() {
        val history = listOf(
            RotationHistoryEntry(Album("blue", "Blue", "Joni Mitchell"), 1_000, 9_000, 10_000, null, 0, null, 2),
            RotationHistoryEntry(Album("rainbows", "In Rainbows", "Radiohead"), 2_000, 5_000, null, 8_000, 3_000, 3_000, 1),
            RotationHistoryEntry(Album("kid-a", "Kid A", "Radiohead"), 3_000, 7_000, null, 9_000, 4_000, 4_000, 4),
        )

        val view = stackHistoryView(history, "radio", StackHistoryKind.PAST, StackHistoryOrder.TIMES_ADDED, now = 12_000)

        assertEquals(listOf("Kid A", "In Rainbows"), view.map { it.album.title })
    }

    @Test
    fun `stack history durations include the current visit`() {
        val active = RotationHistoryEntry(
            album = Album("blue", "Blue", "Joni Mitchell"),
            firstAddedAt = 1_000,
            lastAddedAt = 8_000,
            currentAddedAt = 8_000,
            lastRemovedAt = 6_000,
            totalDurationMs = 5_000,
            lastDurationMs = 5_000,
            timesAdded = 2,
        )

        assertEquals(4_000L, activeStackDuration(active, now = 12_000))
        assertEquals(9_000L, totalStackDuration(active, now = 12_000))
    }

    private fun account(connected: Boolean, playlistAccess: Boolean) = AlbumDjAccount(
        connected = connected,
        playlistAccess = playlistAccess,
        profileName = null,
        favouriteArtists = emptyList(),
        rotation = Rotation(emptyList(), 7, "sequential"),
        library = AlbumDjLibrary(emptyList(), emptyList(), emptyList()),
    )
}
