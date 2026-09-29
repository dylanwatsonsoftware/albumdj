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
    val history: List<RotationHistoryEntry> = emptyList(),
    val spotifyPlaylistUrl: String? = null,
)

data class RotationHistoryEntry(
    val album: Album,
    val firstAddedAt: Long?,
    val lastAddedAt: Long?,
    val currentAddedAt: Long?,
    val lastRemovedAt: Long?,
    val totalDurationMs: Long,
    val lastDurationMs: Long?,
    val timesAdded: Int,
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
                history = rotation.optJSONArray("history").toHistory(),
                spotifyPlaylistUrl = rotation.optJSONObject("spotifyPlaylist")
                    ?.optString("openUrl")
                    ?.takeIf(String::isNotBlank),
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

private fun JSONArray?.toHistory(): List<RotationHistoryEntry> {
    if (this == null) return emptyList()
    return buildList {
        for (index in 0 until length()) {
            val entry = optJSONObject(index) ?: continue
            val albumJson = entry.optJSONObject("album") ?: continue
            val album = JSONArray().put(albumJson).toAlbums().firstOrNull() ?: continue
            add(
                RotationHistoryEntry(
                    album = album,
                    firstAddedAt = entry.optLongOrNull("firstAddedAt"),
                    lastAddedAt = entry.optLongOrNull("lastAddedAt"),
                    currentAddedAt = entry.optLongOrNull("currentAddedAt"),
                    lastRemovedAt = entry.optLongOrNull("lastRemovedAt"),
                    totalDurationMs = entry.optLong("totalDurationMs", 0),
                    lastDurationMs = entry.optLongOrNull("lastDurationMs"),
                    timesAdded = entry.optInt("timesAdded", 1),
                ),
            )
        }
    }
}

private fun JSONObject.optLongOrNull(name: String): Long? = if (has(name) && !isNull(name)) optLong(name) else null

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
                    releaseDate = album.optString("releaseDate").takeIf(String::isNotBlank),
                ),
            )
        }
    }
}
