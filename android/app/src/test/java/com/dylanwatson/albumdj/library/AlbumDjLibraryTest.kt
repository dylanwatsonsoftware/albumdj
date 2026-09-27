package com.dylanwatson.albumdj.library

import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlbumDjLibraryTest {
    private val library = AlbumDjLibrary(
        stack = listOf(
            Album("discovery", "Discovery", "Daft Punk"),
            Album("currents", "Currents", "Tame Impala"),
        ),
        favourites = listOf(Album("blue", "Blue", "Joni Mitchell")),
        recent = listOf(Album("cutouts", "Cutouts", "The Smile")),
    )

    @Test
    fun `car root exposes the driver-safe Album DJ collections`() {
        assertEquals(
            listOf("Current Stack", "Favourite Albums", "Recent Releases"),
            library.children(AlbumDjLibrary.ROOT_ID).map { it.title },
        )
        assertTrue(library.children(AlbumDjLibrary.ROOT_ID).all { it.browsable })
    }

    @Test
    fun `current stack exposes albums as playable items`() {
        val albums = library.children(AlbumDjLibrary.STACK_ID)

        assertEquals(listOf("Discovery", "Currents"), albums.map { it.title })
        assertEquals(listOf("album:discovery", "album:currents"), albums.map { it.id })
        assertTrue(albums.all { it.playable })
        assertTrue(albums.none { it.browsable })
    }

    @Test
    fun `unknown collection is empty`() {
        assertTrue(library.children("missing").isEmpty())
    }

    @Test
    fun `favourites and releases expose their real albums`() {
        assertEquals(listOf("Blue"), library.children(AlbumDjLibrary.FAVOURITES_ID).map { it.title })
        assertEquals(listOf("Cutouts"), library.children(AlbumDjLibrary.RECENT_ID).map { it.title })
    }
}
