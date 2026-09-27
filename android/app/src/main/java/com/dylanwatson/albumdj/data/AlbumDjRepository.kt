package com.dylanwatson.albumdj.data

import android.content.Context
import android.security.keystore.KeyGenParameterSpec
import android.security.keystore.KeyProperties
import android.util.Base64
import java.net.HttpURLConnection
import java.net.URL
import java.nio.ByteBuffer
import java.security.KeyStore
import javax.crypto.Cipher
import javax.crypto.KeyGenerator
import javax.crypto.SecretKey
import javax.crypto.spec.GCMParameterSpec

private const val API_BASE_URL = "https://albumdj.vercel.app"

class AlbumDjSessionStore(context: Context) {
    private val preferences = context.getSharedPreferences("album-dj-session", Context.MODE_PRIVATE)

    fun token(): String? = preferences.getString("token", null)?.let { encoded ->
        runCatching {
            val bytes = Base64.decode(encoded, Base64.NO_WRAP)
            val buffer = ByteBuffer.wrap(bytes)
            val iv = ByteArray(buffer.int).also(buffer::get)
            val encrypted = ByteArray(buffer.remaining()).also(buffer::get)
            val cipher = Cipher.getInstance("AES/GCM/NoPadding")
            cipher.init(Cipher.DECRYPT_MODE, key(), GCMParameterSpec(128, iv))
            cipher.doFinal(encrypted).toString(Charsets.UTF_8)
        }.getOrNull()
    }

    fun saveToken(token: String) {
        val cipher = Cipher.getInstance("AES/GCM/NoPadding")
        cipher.init(Cipher.ENCRYPT_MODE, key())
        val encrypted = cipher.doFinal(token.toByteArray())
        val packed = ByteBuffer.allocate(Int.SIZE_BYTES + cipher.iv.size + encrypted.size)
            .putInt(cipher.iv.size)
            .put(cipher.iv)
            .put(encrypted)
            .array()
        preferences.edit().putString("token", Base64.encodeToString(packed, Base64.NO_WRAP)).apply()
    }

    private fun key(): SecretKey {
        val keyStore = KeyStore.getInstance("AndroidKeyStore").apply { load(null) }
        (keyStore.getKey("album-dj-session-key", null) as? SecretKey)?.let { return it }
        return KeyGenerator.getInstance(KeyProperties.KEY_ALGORITHM_AES, "AndroidKeyStore").run {
            init(
                KeyGenParameterSpec.Builder(
                    "album-dj-session-key",
                    KeyProperties.PURPOSE_ENCRYPT or KeyProperties.PURPOSE_DECRYPT,
                )
                    .setBlockModes(KeyProperties.BLOCK_MODE_GCM)
                    .setEncryptionPaddings(KeyProperties.ENCRYPTION_PADDING_NONE)
                    .build(),
            )
            generateKey()
        }
    }
}

class AlbumDjCache(context: Context) {
    private val preferences = context.getSharedPreferences("album-dj-library", Context.MODE_PRIVATE)

    fun save(payload: AlbumDjPayload) {
        preferences.edit()
            .putString("status", payload.statusJson)
            .putString("rotation", payload.rotationJson)
            .putString("favourites", payload.favouritesJson)
            .putString("recent", payload.recentJson)
            .apply()
    }

    fun load(): AlbumDjPayload? {
        val status = preferences.getString("status", null) ?: return null
        return AlbumDjPayload(
            statusJson = status,
            rotationJson = preferences.getString("rotation", "{}") ?: "{}",
            favouritesJson = preferences.getString("favourites", "[]") ?: "[]",
            recentJson = preferences.getString("recent", "[]") ?: "[]",
        )
    }
}

class AlbumDjRepository(context: Context) {
    private val sessions = AlbumDjSessionStore(context)
    private val cache = AlbumDjCache(context)

    fun savedToken(): String? = sessions.token()

    fun acceptToken(token: String) = sessions.saveToken(token)

    fun cachedAccount(): AlbumDjAccount? = runCatching { cache.load()?.account }.getOrNull()

    fun sync(): AlbumDjAccount {
        val payload = api().sync()
        cache.save(payload)
        return payload.account
    }

    fun playAlbum(albumId: String) = api().playAlbum(albumId)

    private fun api(): AlbumDjApi {
        val token = sessions.token() ?: error("Connect Spotify first")
        return AlbumDjApi(HttpAlbumDjTransport(token))
    }
}

private class HttpAlbumDjTransport(private val token: String) : AlbumDjTransport {
    override fun request(path: String, method: String): String {
        val connection = URL("$API_BASE_URL$path").openConnection() as HttpURLConnection
        return try {
            connection.requestMethod = method
            connection.connectTimeout = 15_000
            connection.readTimeout = 45_000
            connection.setRequestProperty("Authorization", "Bearer $token")
            connection.setRequestProperty("Accept", "application/json")
            val status = connection.responseCode
            val body = (if (status in 200..299) connection.inputStream else connection.errorStream)
                ?.bufferedReader()?.use { it.readText() }.orEmpty()
            if (status !in 200..299) {
                val message = runCatching { org.json.JSONObject(body).optString("error") }.getOrNull()
                error(message?.takeIf(String::isNotBlank) ?: "Album DJ request failed ($status)")
            }
            body
        } finally {
            connection.disconnect()
        }
    }
}
