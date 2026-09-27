package com.dylanwatson.albumdj

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
    fun `phone navigation mirrors the web app sections`() {
        assertEquals(
            listOf("Discover", "Collection", "Stack", "Settings"),
            PhoneSection.entries.map { it.label },
        )
    }

    @Test
    fun `each music section resolves the right account collection`() {
        assertEquals(listOf("Recent album"), albumsForPhoneSection(PhoneSection.DISCOVER, library).map { it.title })
        assertEquals(listOf("Favourite album"), albumsForPhoneSection(PhoneSection.COLLECTION, library).map { it.title })
        assertEquals(listOf("Stack album"), albumsForPhoneSection(PhoneSection.STACK, library).map { it.title })
        assertEquals(emptyList<String>(), albumsForPhoneSection(PhoneSection.SETTINGS, library).map { it.title })
    }
}
