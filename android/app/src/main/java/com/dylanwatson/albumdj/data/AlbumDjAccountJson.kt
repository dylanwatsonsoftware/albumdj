package com.dylanwatson.albumdj.data

import com.dylanwatson.albumdj.library.Album
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import org.json.JSONArray
import org.json.JSONObject

data class AlbumDjAccount(
    val connected: Boolean,
    val profileName: String?,
    val favouriteArtists: List<Artist>,
    val library: AlbumDjLibrary,
)

data class Artist(
    val id: String,
    val name: String,
    val imageUrl: String?,
)

object AlbumDjAccountJson {
    fun decode(
        statusJson: String,
        rotationJson: String,
        favouritesJson: String,
        artistsJson: String,
        recentJson: String,
    ): AlbumDjAccount {
        val status = JSONObject(statusJson)
        val profile = status.optJSONObject("profile")
        return AlbumDjAccount(
            connected = status.optBoolean("connected"),
            profileName = profile?.optString("displayName")?.takeIf(String::isNotBlank),
            favouriteArtists = JSONArray(artistsJson).toArtists(),
            library = AlbumDjLibrary(
                stack = JSONObject(rotationJson).optJSONArray("albums").toAlbums(),
                favourites = JSONArray(favouritesJson).toAlbums(),
                recent = JSONArray(recentJson).toAlbums(),
            ),
        )
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
            add(
                Artist(
                    id = id,
                    name = name,
                    imageUrl = artist.optString("imageUrl").takeIf(String::isNotBlank),
                ),
            )
        }
    }
}

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
                ),
            )
        }
    }
}
