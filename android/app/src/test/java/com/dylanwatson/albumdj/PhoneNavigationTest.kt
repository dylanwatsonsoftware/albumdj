package com.dylanwatson.albumdj

import com.dylanwatson.albumdj.data.AlbumDjAccount
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

    private fun account(connected: Boolean, playlistAccess: Boolean) = AlbumDjAccount(
        connected = connected,
        playlistAccess = playlistAccess,
        profileName = null,
        favouriteArtists = emptyList(),
        rotation = Rotation(emptyList(), 7, "sequential"),
        library = AlbumDjLibrary(emptyList(), emptyList(), emptyList()),
    )
}
