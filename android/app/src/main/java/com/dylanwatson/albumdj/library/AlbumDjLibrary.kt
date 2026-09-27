package com.dylanwatson.albumdj.library

data class Album(
    val id: String,
    val title: String,
    val artist: String,
)

data class LibraryNode(
    val id: String,
    val title: String,
    val subtitle: String? = null,
    val browsable: Boolean = false,
    val playable: Boolean = false,
)

class AlbumDjLibrary(
    private val stack: List<Album>,
) {
    fun children(parentId: String): List<LibraryNode> = when (parentId) {
        ROOT_ID -> listOf(
            LibraryNode(STACK_ID, "Current Stack", browsable = true),
            LibraryNode(FAVOURITES_ID, "Favourite Albums", browsable = true),
            LibraryNode(RECENT_ID, "Recent Releases", browsable = true),
        )

        STACK_ID -> stack.map { album ->
            LibraryNode(
                id = "album:${album.id}",
                title = album.title,
                subtitle = album.artist,
                playable = true,
            )
        }

        else -> emptyList()
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
