package com.dylanwatson.albumdj.data

import com.dylanwatson.albumdj.library.AlbumDjLibrary
import org.junit.Assert.assertEquals
import org.junit.Assert.assertTrue
import org.junit.Test

class AlbumDjAccountJsonTest {
    @Test
    fun `decodes a connected Firebase-backed account into the car library`() {
        val account = AlbumDjAccountJson.decode(
            statusJson = """{"connected":true,"profile":{"displayName":"Dylan"}}""",
            rotationJson = """{"albums":[{"id":"stack-1","title":"Discovery","artist":"Daft Punk","imageUrl":"https://img/stack.jpg"}]}""",
            favouritesJson = """[{"id":"fav-1","title":"Blue","artist":"Joni Mitchell"}]""",
            recentJson = """[{"id":"new-1","title":"Cutouts","artist":"The Smile","releaseDate":"2026-08-01"}]""",
        )

        assertTrue(account.connected)
        assertEquals("Dylan", account.profileName)
        assertEquals(listOf("Discovery"), account.library.children(AlbumDjLibrary.STACK_ID).map { it.title })
        assertEquals(listOf("Blue"), account.library.children(AlbumDjLibrary.FAVOURITES_ID).map { it.title })
        assertEquals(listOf("Cutouts"), account.library.children(AlbumDjLibrary.RECENT_ID).map { it.title })
    }

    @Test
    fun `decodes missing collections as empty`() {
        val account = AlbumDjAccountJson.decode(
            statusJson = """{"connected":false,"profile":null}""",
            rotationJson = "{}",
            favouritesJson = "[]",
            recentJson = "[]",
        )

        assertEquals(null, account.profileName)
        assertTrue(account.library.children(AlbumDjLibrary.STACK_ID).isEmpty())
    }
}
