package com.dylanwatson.albumdj.data

import java.net.URLEncoder

fun interface AlbumDjTransport {
    fun request(path: String, method: String): String
}

data class AlbumDjPayload(
    val statusJson: String,
    val rotationJson: String,
    val favouritesJson: String,
    val recentJson: String,
) {
    val account: AlbumDjAccount
        get() = AlbumDjAccountJson.decode(statusJson, rotationJson, favouritesJson, recentJson)
}

class AlbumDjApi(
    private val transport: AlbumDjTransport,
) {
    fun sync() = AlbumDjPayload(
        statusJson = transport.request("/api/spotify/status", "GET"),
        rotationJson = transport.request("/api/rotation", "GET"),
        favouritesJson = transport.request("/api/favourite-albums", "GET"),
        recentJson = transport.request("/api/spotify/favourite-artists/releases", "GET"),
    )

    fun playAlbum(albumId: String) {
        val encodedId = URLEncoder.encode(albumId, "UTF-8").replace("+", "%20")
        transport.request("/api/spotify/albums/$encodedId/play", "POST")
    }
}
