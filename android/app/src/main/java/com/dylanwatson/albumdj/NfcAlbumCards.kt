package com.dylanwatson.albumdj

import android.app.Activity
import android.nfc.NdefMessage
import android.nfc.NdefRecord
import android.nfc.NfcAdapter
import android.nfc.Tag
import android.nfc.tech.Ndef
import android.nfc.tech.NdefFormatable

class NfcAlbumCards(private val activity: Activity) {
    private val adapter: NfcAdapter? = NfcAdapter.getDefaultAdapter(activity)

    val available: Boolean get() = adapter != null

    fun scan(onAlbum: (String) -> Unit, onError: (String) -> Unit) {
        if (adapter?.isEnabled != true) {
            onError("Turn on NFC, then try scanning again.")
            return
        }
        start { tag ->
            val payload = runCatching { readText(tag) }.getOrElse {
                finish { onError(it.message ?: "Couldn’t read this NFC card.") }
                return@start
            }
            val albumId = albumIdFromCardPayload(payload)
            finish {
                if (albumId == null) onError("This NFC card is not paired with an Album DJ album.") else onAlbum(albumId)
            }
        }
    }

    fun pair(albumId: String, onComplete: () -> Unit, onError: (String) -> Unit) {
        if (adapter?.isEnabled != true) {
            onError("Turn on NFC, then try pairing again.")
            return
        }
        start { tag ->
            runCatching {
                val message = NdefMessage(arrayOf(NdefRecord.createTextRecord("en", albumCardPayload(albumId))))
                val ndef = Ndef.get(tag)
                if (ndef != null) {
                    ndef.connect()
                    try {
                        if (!ndef.isWritable) error("This NFC card is read-only.")
                        ndef.writeNdefMessage(message)
                    } finally {
                        ndef.close()
                    }
                } else {
                    val formatable = NdefFormatable.get(tag) ?: error("This tag cannot store an Album DJ card.")
                    formatable.connect()
                    try { formatable.format(message) } finally { formatable.close() }
                }
            }.onSuccess { finish(onComplete) }
                .onFailure { finish { onError(it.message ?: "Couldn’t pair this NFC card.") } }
        }
    }

    fun stop() {
        adapter?.disableReaderMode(activity)
    }

    private fun start(onTag: (Tag) -> Unit) {
        val nfc = adapter ?: return
        nfc.enableReaderMode(
            activity,
            onTag,
            NfcAdapter.FLAG_READER_NFC_A or NfcAdapter.FLAG_READER_NFC_B or
                NfcAdapter.FLAG_READER_NFC_F or NfcAdapter.FLAG_READER_NFC_V,
            null,
        )
    }

    private fun finish(action: () -> Unit) {
        stop()
        activity.runOnUiThread(action)
    }

    private fun readText(tag: Tag): String {
        val ndef = Ndef.get(tag) ?: error("This tag does not contain an NFC message.")
        val message = ndef.cachedNdefMessage ?: run {
            ndef.connect()
            try { ndef.ndefMessage } finally { ndef.close() }
        } ?: error("This NFC card is empty.")
        val record = message.records.firstOrNull() ?: error("This NFC card is empty.")
        if (record.tnf != NdefRecord.TNF_WELL_KNOWN || !record.type.contentEquals(NdefRecord.RTD_TEXT)) {
            return record.payload.toString(Charsets.UTF_8)
        }
        val languageLength = record.payload.firstOrNull()?.toInt()?.and(0x3f) ?: 0
        return record.payload.copyOfRange(1 + languageLength, record.payload.size).toString(Charsets.UTF_8)
    }
}
