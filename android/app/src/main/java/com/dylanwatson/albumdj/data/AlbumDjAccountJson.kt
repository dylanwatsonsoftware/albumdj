package com.dylanwatson.albumdj.data

import com.dylanwatson.albumdj.library.Album
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import org.json.JSONArray
import org.json.JSONObject

data class AlbumDjAccount(
    val connected: Boolean,
    val playlistAccess: Boolean,
    val profileName: String?,
    val favouriteArtists: List<Artist>,
    val rotation: Rotation,
    val library: AlbumDjLibrary,
)

data class Rotation(
    val albumIds: List<String>,
    val durationDays: Int,
    val mode: String,
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
        savedJson: String = "[]",
    ): AlbumDjAccount {
        val status = JSONObject(statusJson)
        val profile = status.optJSONObject("profile")
        val rotation = JSONObject(rotationJson)
        return AlbumDjAccount(
            connected = status.optBoolean("connected"),
            playlistAccess = status.optBoolean("playlistAccess"),
            profileName = profile?.optString("displayName")?.takeIf(String::isNotBlank),
            favouriteArtists = JSONArray(artistsJson).toArtists(),
            rotation = Rotation(
                albumIds = rotation.optJSONArray("albumIds").toStrings(),
                durationDays = rotation.optInt("durationDays", 7),
                mode = rotation.optString("mode", "sequential"),
            ),
            library = AlbumDjLibrary(
                stack = rotation.optJSONArray("albums").toAlbums(),
                favourites = JSONArray(favouritesJson).toAlbums(),
                recent = JSONArray(recentJson).toAlbums(),
                saved = JSONArray(savedJson).toAlbums(),
            ),
        )
    }
}

private fun JSONArray?.toStrings(): List<String> {
    if (this == null) return emptyList()
    return (0 until length()).mapNotNull { index -> optString(index).takeIf(String::isNotBlank) }
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
                    artistId = album.optString("artistId").takeIf(String::isNotBlank),
                ),
            )
        }
    }
}
