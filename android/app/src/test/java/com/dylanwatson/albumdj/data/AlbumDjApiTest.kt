package com.dylanwatson.albumdj.data

import com.dylanwatson.albumdj.library.Album
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import org.junit.Assert.assertEquals
import org.junit.Test

class AlbumDjApiTest {
    @Test
    fun `sync loads the Firebase backed collections used by phone and car`() {
        val requested = mutableListOf<Triple<String, String, String?>>()
        val responses = mapOf(
            "/api/spotify/status" to """{"connected":true,"profile":{"displayName":"Dylan"}}""",
            "/api/spotify/albums" to """[{"id":"saved-1","title":"Blue","artist":"Joni Mitchell"}]""",
            "/api/rotation" to """{"albums":[{"id":"stack","title":"Discovery","artist":"Daft Punk"}]}""",
            "/api/favourite-albums" to "[]",
            "/api/favourite-artists" to """[{"id":"artist-1","name":"Joni Mitchell"}]""",
            "/api/spotify/favourite-artists/releases" to "[]",
        )
        val api = AlbumDjApi { path, method, body ->
            requested += Triple(path, method, body)
            responses.getValue(path)
        }

        val payload = api.sync()

        assertEquals(responses.keys.toList(), requested.map { it.first })
        assertEquals(listOf("GET", "GET", "GET", "GET", "GET", "GET"), requested.map { it.second })
        assertEquals("Dylan", payload.account.profileName)
        assertEquals("Discovery", payload.account.library.children(AlbumDjLibrary.STACK_ID).single().title)
        assertEquals(listOf("Blue"), payload.account.library.saved.map { it.title })
        assertEquals(listOf("Joni Mitchell"), payload.account.favouriteArtists.map { it.name })
    }

    @Test
    fun `play sends the selected album to the existing Spotify backend`() {
        val requested = mutableListOf<Triple<String, String, String?>>()
        val api = AlbumDjApi { path, method, body ->
            requested += Triple(path, method, body)
            "{}"
        }

        api.playAlbum("an album/id")

        assertEquals(listOf(Triple("/api/spotify/albums/an%20album%2Fid/play", "POST", null)), requested)
    }

    @Test
    fun `play exposes Spotify app fallback returned by the backend`() {
        val api = AlbumDjApi { _, _, _ ->
            """{"mode":"spotify-open","openUrl":"https://open.spotify.com/album/blue"}"""
        }

        val playback = api.playAlbum("blue")

        assertEquals("https://open.spotify.com/album/blue", playback.openUrl)
    }

    @Test
    fun `play stack uses the same multi-disc changer endpoint as the web app`() {
        val requested = mutableListOf<Triple<String, String, String?>>()
        val api = AlbumDjApi { path, method, body ->
            requested += Triple(path, method, body)
            """{"openUrl":"https://open.spotify.com/playlist/album-dj"}"""
        }

        val playback = api.playStack()

        assertEquals(listOf(Triple("/api/rotation/play", "POST", null)), requested)
        assertEquals("https://open.spotify.com/playlist/album-dj", playback.openUrl)
    }

    @Test
    fun `search encodes the query and maps album and artist results`() {
        val requested = mutableListOf<Triple<String, String, String?>>()
        val api = AlbumDjApi { path, method, body ->
            requested += Triple(path, method, body)
            """{
                "albums":[{"id":"blue","title":"Blue","artist":"Joni Mitchell","artistId":"joni","imageUrl":"https://img/blue.jpg"}],
                "artists":[{"id":"joni","name":"Joni Mitchell","imageUrl":"https://img/joni.jpg"}]
            }""".trimIndent()
        }

        val results = api.search("Joni Mitchell / Blue")

        assertEquals(
            listOf(Triple("/api/spotify/search?q=Joni%20Mitchell%20%2F%20Blue", "GET", null)),
            requested,
        )
        assertEquals("Blue", results.albums.single().title)
        assertEquals("joni", results.albums.single().artistId)
        assertEquals("Joni Mitchell", results.artists.single().name)
    }

    @Test
    fun `artist discography encodes the artist and maps its albums`() {
        val requested = mutableListOf<Triple<String, String, String?>>()
        val api = AlbumDjApi { path, method, body ->
            requested += Triple(path, method, body)
            """[{"id":"blue","title":"Blue","artist":"Joni Mitchell","artistId":"joni","releaseDate":"1971-06-22"}]"""
        }

        val albums = api.artistAlbums("joni/mitchell")

        assertEquals(
            listOf(Triple("/api/spotify/artists/joni%2Fmitchell/albums", "GET", null)),
            requested,
        )
        assertEquals("Blue", albums.single().title)
        assertEquals("1971-06-22", albums.single().releaseDate)
    }

    @Test
    fun `ejecting an album preserves the stack settings`() {
        val requested = mutableListOf<Triple<String, String, String?>>()
        val api = AlbumDjApi { path, method, body ->
            requested += Triple(path, method, body)
            """{"albumIds":["album-2"],"durationDays":14,"mode":"shuffle","albums":[]}"""
        }

        api.updateRotation(listOf("album-2"), durationDays = 14, mode = "shuffle")

        val request = requested.single()
        assertEquals("/api/rotation", request.first)
        assertEquals("PUT", request.second)
        val body = org.json.JSONObject(request.third!!)
        assertEquals(listOf("album-2"), body.getJSONArray("albumIds").let { array -> (0 until array.length()).map(array::getString) })
        assertEquals(14, body.getInt("durationDays"))
        assertEquals("shuffle", body.getString("mode"))
    }

    @Test
    fun `adding a discovered album sends its metadata with the stack`() {
        val requested = mutableListOf<Triple<String, String, String?>>()
        val api = AlbumDjApi { path, method, body ->
            requested += Triple(path, method, body)
            """{"albumIds":["blue"],"albums":[]}"""
        }
        val album = Album(
            id = "blue",
            title = "Blue",
            artist = "Joni Mitchell",
            imageUrl = "https://img/blue.jpg",
            artistId = "joni",
            releaseDate = "1971-06-22",
        )

        api.updateRotation(listOf("blue"), durationDays = 14, mode = "shuffle", albums = listOf(album))

        val body = org.json.JSONObject(requested.single().third!!)
        assertEquals("blue", body.getJSONArray("albums").getJSONObject(0).getString("id"))
        assertEquals("joni", body.getJSONArray("albums").getJSONObject(0).getString("artistId"))
        assertEquals("1971-06-22", body.getJSONArray("albums").getJSONObject(0).getString("releaseDate"))
    }

    @Test
    fun `saving favourite albums sends the shared Firebase collection`() {
        val requested = mutableListOf<Triple<String, String, String?>>()
        val api = AlbumDjApi { path, method, body ->
            requested += Triple(path, method, body)
            "[]"
        }

        api.saveFavouriteAlbums(
            listOf(
                Album(
                    id = "blue",
                    title = "Blue",
                    artist = "Joni Mitchell",
                    imageUrl = "https://img/blue.jpg",
                    artistId = "joni",
                ),
            ),
        )

        val request = requested.single()
        assertEquals("/api/favourite-albums", request.first)
        assertEquals("PUT", request.second)
        val album = org.json.JSONObject(request.third!!).getJSONArray("albums").getJSONObject(0)
        assertEquals("blue", album.getString("id"))
        assertEquals("joni", album.getString("artistId"))
    }

    @Test
    fun `saving favourite artists sends the shared Firebase collection`() {
        val requested = mutableListOf<Triple<String, String, String?>>()
        val api = AlbumDjApi { path, method, body ->
            requested += Triple(path, method, body)
            "[]"
        }

        api.saveFavouriteArtists(listOf(Artist("joni", "Joni Mitchell", "https://img/joni.jpg")))

        val request = requested.single()
        assertEquals("/api/favourite-artists", request.first)
        assertEquals("PUT", request.second)
        val artist = org.json.JSONObject(request.third!!).getJSONArray("artists").getJSONObject(0)
        assertEquals("joni", artist.getString("id"))
        assertEquals("Joni Mitchell", artist.getString("name"))
    }
}
