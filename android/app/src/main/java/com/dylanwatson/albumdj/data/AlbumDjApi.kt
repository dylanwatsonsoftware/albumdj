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
    val rotationJson: String,
    val favouritesJson: String,
    val artistsJson: String,
    val recentJson: String,
) {
    val account: AlbumDjAccount
        get() = AlbumDjAccountJson.decode(statusJson, rotationJson, favouritesJson, artistsJson, recentJson)
}

data class AlbumPlayback(val openUrl: String?)

class AlbumDjApi(
    private val transport: AlbumDjTransport,
) {
    fun sync() = AlbumDjPayload(
        statusJson = transport.request("/api/spotify/status", "GET", null),
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

    fun updateRotation(albumIds: List<String>, durationDays: Int, mode: String): String {
        val body = JSONObject()
            .put("albumIds", JSONArray(albumIds))
            .put("durationDays", durationDays)
            .put("mode", mode)
            .toString()
        return transport.request("/api/rotation", "PUT", body)
    }

    fun saveFavouriteAlbums(albums: List<Album>): String {
        val encoded = albums.map { album ->
            JSONObject()
                .put("id", album.id)
                .put("title", album.title)
                .put("artist", album.artist)
                .put("imageUrl", album.imageUrl)
                .put("artistId", album.artistId)
        }
        return transport.request(
            "/api/favourite-albums",
            "PUT",
            JSONObject().put("albums", JSONArray(encoded)).toString(),
        )
    }
}
