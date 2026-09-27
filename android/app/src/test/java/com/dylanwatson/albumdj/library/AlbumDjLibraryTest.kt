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
}
