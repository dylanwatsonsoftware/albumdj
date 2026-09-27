package com.dylanwatson.albumdj

import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode

enum class PhoneSection(val label: String, val glyph: String) {
    DISCOVER("Discover", "⌕"),
    COLLECTION("Collection", "▤"),
    STACK("Stack", "▱"),
    SETTINGS("Settings", "⚙"),
}

fun albumsForPhoneSection(section: PhoneSection, library: AlbumDjLibrary): List<LibraryNode> = when (section) {
    PhoneSection.DISCOVER -> library.children(AlbumDjLibrary.RECENT_ID)
    PhoneSection.COLLECTION -> library.children(AlbumDjLibrary.FAVOURITES_ID)
    PhoneSection.STACK -> library.children(AlbumDjLibrary.STACK_ID)
    PhoneSection.SETTINGS -> emptyList()
}
