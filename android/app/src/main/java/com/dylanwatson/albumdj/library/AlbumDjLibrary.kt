package com.dylanwatson.albumdj.library

data class Album(
    val id: String,
    val title: String,
    val artist: String,
    val imageUrl: String? = null,
    val artistId: String? = null,
)

data class LibraryNode(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val browsable: Boolean = false,
    val playable: Boolean = false,
    val imageUrl: String? = null,
)

class AlbumDjLibrary(
    val stack: List<Album>,
    val favourites: List<Album> = emptyList(),
    val recent: List<Album> = emptyList(),
    val saved: List<Album> = emptyList(),
) {
    fun children(parentId: String): List<LibraryNode> = when (parentId) {
        ROOT_ID -> listOf(
            LibraryNode(STACK_ID, "Current Stack", browsable = true),
            LibraryNode(FAVOURITES_ID, "Favourite Albums", browsable = true),
            LibraryNode(RECENT_ID, "Recent Releases", browsable = true),
        )

        STACK_ID -> stack.asNodes()
        FAVOURITES_ID -> favourites.asNodes()
        RECENT_ID -> recent.asNodes()

        else -> emptyList()
    }

    private fun List<Album>.asNodes() = map { album ->
            LibraryNode(
                id = "album:${album.id}",
                title = album.title,
                subtitle = album.artist,
                playable = true,
                imageUrl = album.imageUrl,
            )
        }

    companion object {
        const val ROOT_ID = "album-dj-root"
        const val STACK_ID = "current-stack"
        const val FAVOURITES_ID = "favourite-albums"
        const val RECENT_ID = "recent-releases"

        fun demo() = AlbumDjLibrary(
            stack = listOf(
                Album("discovery", "Discovery", "Daft Punk"),
                Album("currents", "Currents", "Tame Impala"),
                Album("steal-the-light", "Steal the Light", "The Cat Empire"),
                Album("in-rainbows", "In Rainbows", "Radiohead"),
            ),
        )
    }
}
