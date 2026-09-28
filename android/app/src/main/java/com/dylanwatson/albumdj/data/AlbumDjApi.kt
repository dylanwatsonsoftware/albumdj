package com.dylanwatson.albumdj.data

import java.net.URLEncoder
import com.dylanwatson.albumdj.library.Album
import org.json.JSONArray
import org.json.JSONObject

fun interface AlbumDjTransport {
    fun request(path: String, method: String, body: String?): String
}

data class AlbumDjPayload(
    val statusJson: String,
    val savedJson: String,
    val rotationJson: String,
    val favouritesJson: String,
    val artistsJson: String,
    val recentJson: String,
) {
    val account: AlbumDjAccount
        get() = AlbumDjAccountJson.decode(statusJson, rotationJson, favouritesJson, artistsJson, recentJson, savedJson)
}

data class AlbumPlayback(val openUrl: String?)

data class SearchResults(
    val albums: List<Album>,
    val artists: List<Artist>,
)

class AlbumDjApi(
    private val transport: AlbumDjTransport,
) {
    fun sync() = AlbumDjPayload(
        statusJson = transport.request("/api/spotify/status", "GET", null),
        savedJson = transport.request("/api/spotify/albums", "GET", null),
        rotationJson = transport.request("/api/rotation", "GET", null),
        favouritesJson = transport.request("/api/favourite-albums", "GET", null),
        artistsJson = transport.request("/api/favourite-artists", "GET", null),
        recentJson = transport.request("/api/spotify/favourite-artists/releases", "GET", null),
    )

    fun playAlbum(albumId: String): AlbumPlayback {
        val encodedId = URLEncoder.encode(albumId, "UTF-8").replace("+", "%20")
        val response = JSONObject(transport.request("/api/spotify/albums/$encodedId/play", "POST", null))
        return AlbumPlayback(response.optString("openUrl").takeIf(String::isNotBlank))
    }

    fun playStack() {
        transport.request("/api/rotation/play", "POST", null)
    }

    fun search(query: String): SearchResults {
        val encodedQuery = URLEncoder.encode(query.trim(), "UTF-8").replace("+", "%20")
        val response = JSONObject(transport.request("/api/spotify/search?q=$encodedQuery", "GET", null))
        return SearchResults(
            albums = response.optJSONArray("albums").toAlbums(),
            artists = response.optJSONArray("artists").toArtists(),
        )
    }

    fun artistAlbums(artistId: String): List<Album> {
        val encodedId = URLEncoder.encode(artistId, "UTF-8").replace("+", "%20")
        return JSONArray(transport.request("/api/spotify/artists/$encodedId/albums", "GET", null)).toAlbums()
    }

    fun updateRotation(
        albumIds: List<String>,
        durationDays: Int,
        mode: String,
        albums: List<Album> = emptyList(),
    ): String {
        val body = JSONObject()
            .put("albumIds", JSONArray(albumIds))
            .put("durationDays", durationDays)
            .put("mode", mode)
        if (albums.isNotEmpty()) body.put("albums", JSONArray(albums.map(::albumJson)))
        return transport.request("/api/rotation", "PUT", body.toString())
    }

    fun saveFavouriteAlbums(albums: List<Album>): String {
        val encoded = albums.map(::albumJson)
        return transport.request(
            "/api/favourite-albums",
            "PUT",
            JSONObject().put("albums", JSONArray(encoded)).toString(),
        )
    }

    fun saveFavouriteArtists(artists: List<Artist>): String {
        val encoded = artists.map { artist ->
            JSONObject()
                .put("id", artist.id)
                .put("name", artist.name)
                .put("imageUrl", artist.imageUrl)
        }
        return transport.request(
            "/api/favourite-artists",
            "PUT",
            JSONObject().put("artists", JSONArray(encoded)).toString(),
        )
    }
}

private fun albumJson(album: Album) = JSONObject()
    .put("id", album.id)
    .put("title", album.title)
    .put("artist", album.artist)
    .put("imageUrl", album.imageUrl)
    .put("artistId", album.artistId)
    .put("releaseDate", album.releaseDate)

private fun JSONArray?.toAlbums(): List<Album> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            val album = optJSONObject(index) ?: continue
            val id = album.optString("id")
            val title = album.optString("title")
            if (id.isBlank() || title.isBlank()) continue
            add(
                Album(
                    id = id,
                    title = title,
                    artist = album.optString("artist"),
                    imageUrl = album.optString("imageUrl").takeIf(String::isNotBlank),
                    artistId = album.optString("artistId").takeIf(String::isNotBlank),
                    releaseDate = album.optString("releaseDate").takeIf(String::isNotBlank),
                ),
            )
        }
    }
}

private fun JSONArray?.toArtists(): List<Artist> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            val artist = optJSONObject(index) ?: continue
            val id = artist.optString("id")
            val name = artist.optString("name")
            if (id.isBlank() || name.isBlank()) continue
            add(Artist(id, name, artist.optString("imageUrl").takeIf(String::isNotBlank)))
        }
    }
}
