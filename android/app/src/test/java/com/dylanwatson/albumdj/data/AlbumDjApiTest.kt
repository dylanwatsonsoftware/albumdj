package com.dylanwatson.albumdj.data

import com.dylanwatson.albumdj.library.AlbumDjLibrary
import org.junit.Assert.assertEquals
import org.junit.Test

class AlbumDjApiTest {
    @Test
    fun `sync loads the Firebase backed collections used by phone and car`() {
        val requested = mutableListOf<Pair<String, String>>()
        val responses = mapOf(
            "/api/spotify/status" to """{"connected":true,"profile":{"displayName":"Dylan"}}""",
            "/api/rotation" to """{"albums":[{"id":"stack","title":"Discovery","artist":"Daft Punk"}]}""",
            "/api/favourite-albums" to "[]",
            "/api/spotify/favourite-artists/releases" to "[]",
        )
        val api = AlbumDjApi { path, method ->
            requested += path to method
            responses.getValue(path)
        }

        val payload = api.sync()

        assertEquals(responses.keys.toList(), requested.map { it.first })
        assertEquals(listOf("GET", "GET", "GET", "GET"), requested.map { it.second })
        assertEquals("Dylan", payload.account.profileName)
        assertEquals("Discovery", payload.account.library.children(AlbumDjLibrary.STACK_ID).single().title)
    }

    @Test
    fun `play sends the selected album to the existing Spotify backend`() {
        val requested = mutableListOf<Pair<String, String>>()
        val api = AlbumDjApi { path, method ->
            requested += path to method
            "{}"
        }

        api.playAlbum("an album/id")

        assertEquals(listOf("/api/spotify/albums/an%20album%2Fid/play" to "POST"), requested)
    }

    @Test
    fun `play stack uses the same multi-disc changer endpoint as the web app`() {
        val requested = mutableListOf<Pair<String, String>>()
        val api = AlbumDjApi { path, method ->
            requested += path to method
            "{}"
        }

        api.playStack()

        assertEquals(listOf("/api/rotation/play" to "POST"), requested)
    }
}
