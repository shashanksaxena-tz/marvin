package com.marvin.assistant.data.repository

import com.marvin.assistant.data.api.MarvinApi
import com.marvin.assistant.data.local.MessageDao
import com.marvin.assistant.data.local.MessageEntity
import com.marvin.assistant.data.models.HistoryResponse
import com.marvin.assistant.data.models.MessageRequest
import com.marvin.assistant.data.models.MessageResponse
import com.marvin.assistant.data.models.ShareRequest
import com.marvin.assistant.data.models.ShareResponse
import com.marvin.assistant.data.models.StatusResponse
import com.marvin.assistant.data.models.VoiceResponse
import kotlinx.coroutines.flow.Flow
import okhttp3.MultipartBody
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class MarvinRepository @Inject constructor(
    private val api: MarvinApi,
    private val messageDao: MessageDao
) {

    val messages: Flow<List<MessageEntity>> = messageDao.getAll()

    suspend fun sendMessage(text: String): MessageResponse {
        val request = MessageRequest(text = text)
        val response = api.sendMessage(request)

        // Cache both the user message and the response
        val now = System.currentTimeMillis()
        messageDao.insert(
            MessageEntity(
                id = "user_$now",
                role = "user",
                content = text,
                timestamp = now
            )
        )
        messageDao.insert(
            MessageEntity(
                id = "assistant_$now",
                role = "assistant",
                content = response.response,
                timestamp = now
            )
        )

        return response
    }

    suspend fun sendVoice(audioPart: MultipartBody.Part): VoiceResponse {
        val response = api.sendVoice(audioPart)

        val now = System.currentTimeMillis()
        // Cache the transcribed user message
        messageDao.insert(
            MessageEntity(
                id = "user_$now",
                role = "user",
                content = response.transcription,
                timestamp = now
            )
        )
        // Cache the assistant response
        messageDao.insert(
            MessageEntity(
                id = "assistant_$now",
                role = "assistant",
                content = response.response,
                timestamp = now
            )
        )

        return response
    }

    suspend fun shareContent(
        url: String? = null,
        text: String? = null,
        image: String? = null,
        context: String? = null
    ): ShareResponse {
        val request = ShareRequest(
            url = url,
            text = text,
            image = image,
            context = context
        )
        return api.shareContent(request)
    }

    suspend fun getStatus(): StatusResponse {
        return api.getStatus()
    }

    suspend fun getHistory(
        limit: Int = 50,
        offset: Int = 0,
        type: String? = null,
        search: String? = null
    ): HistoryResponse {
        val response = api.getHistory(
            limit = limit,
            offset = offset,
            type = type,
            search = search
        )

        val entities = response.messages.map { item ->
            MessageEntity(
                id = item.id.toString(),
                role = if (item.inputType == "response") "assistant" else "user",
                content = if (item.inputType == "response") (item.response ?: item.inputText) else item.inputText,
                timestamp = parseTimestamp(item.createdAt)
            )
        }
        messageDao.insertAll(entities)

        return response
    }

    fun searchMessages(query: String): Flow<List<MessageEntity>> {
        return messageDao.search(query)
    }

    private fun parseTimestamp(timestamp: String): Long {
        // Backend returns "2026-02-13 13:35:49" format (SQLite datetime)
        val formats = arrayOf(
            "yyyy-MM-dd HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm:ss",
            "yyyy-MM-dd'T'HH:mm:ss.SSS'Z'"
        )
        for (fmt in formats) {
            try {
                return java.text.SimpleDateFormat(fmt, java.util.Locale.US)
                    .parse(timestamp)?.time ?: continue
            } catch (_: Exception) { }
        }
        return try {
            timestamp.toLong()
        } catch (_: Exception) {
            System.currentTimeMillis()
        }
    }
}
