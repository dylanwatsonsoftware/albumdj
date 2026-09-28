package com.dylanwatson.albumdj

import com.dylanwatson.albumdj.data.AlbumDjAccount
import com.dylanwatson.albumdj.data.AlbumPlayback
import com.dylanwatson.albumdj.data.Rotation
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

    private fun account(connected: Boolean, playlistAccess: Boolean) = AlbumDjAccount(
        connected = connected,
        playlistAccess = playlistAccess,
        profileName = null,
        favouriteArtists = emptyList(),
        rotation = Rotation(emptyList(), 7, "sequential"),
        library = AlbumDjLibrary(emptyList(), emptyList(), emptyList()),
    )
}
