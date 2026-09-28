package com.dylanwatson.albumdj

import com.dylanwatson.albumdj.data.AlbumDjAccount
import com.dylanwatson.albumdj.library.AlbumDjLibrary
import com.dylanwatson.albumdj.library.LibraryNode

enum class PhoneSection(val label: String, val glyph: String) {
    STACK("Stack", "▱"),
    DISCOVER("Discover", "⌕"),
    COLLECTION("Collection", "▤"),
    SETTINGS("Settings", "⚙"),
}

val DEFAULT_PHONE_SECTION = PhoneSection.STACK

enum class StackPlaybackAction {
    PLAY,
    REAUTHORIZE,
    CONNECT,
}

fun stackPlaybackAction(account: AlbumDjAccount?): StackPlaybackAction = when {
    account == null || !account.connected -> StackPlaybackAction.CONNECT
    !account.playlistAccess -> StackPlaybackAction.REAUTHORIZE
    else -> StackPlaybackAction.PLAY
}

fun albumsForPhoneSection(section: PhoneSection, library: AlbumDjLibrary): List<LibraryNode> = when (section) {
    PhoneSection.DISCOVER -> library.children(AlbumDjLibrary.RECENT_ID)
    PhoneSection.COLLECTION -> library.children(AlbumDjLibrary.FAVOURITES_ID)
    PhoneSection.STACK -> library.children(AlbumDjLibrary.STACK_ID)
    PhoneSection.SETTINGS -> emptyList()
}

fun LibraryNode.albumId(): String = id.removePrefix("album:")
