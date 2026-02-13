package com.marvin.assistant.data.repository

import com.marvin.assistant.data.api.MarvinApi
import com.marvin.assistant.data.local.MessageDao
import com.marvin.assistant.data.local.MessageEntity
import com.marvin.assistant.data.models.MessageRequest
import com.marvin.assistant.data.models.MessageResponse
import com.marvin.assistant.data.models.ShareRequest
import com.marvin.assistant.data.models.ShareResponse
import com.marvin.assistant.data.models.StatusResponse
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

    suspend fun sendMessage(text: String, context: Map<String, String>? = null): MessageResponse {
        val request = MessageRequest(message = text, context = context)
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
                id = "assistant_${response.timestamp}",
                role = "assistant",
                content = response.response,
                timestamp = response.timestamp
            )
        )

        return response
    }

    suspend fun sendVoice(audioPart: MultipartBody.Part): MessageResponse {
        val response = api.sendVoice(audioPart)

        messageDao.insert(
            MessageEntity(
                id = "assistant_${response.timestamp}",
                role = "assistant",
                content = response.response,
                timestamp = response.timestamp
            )
        )

        return response
    }

    suspend fun shareContent(
        type: String,
        content: String,
        source: String? = null,
        metadata: Map<String, String>? = null
    ): ShareResponse {
        val request = ShareRequest(
            type = type,
            content = content,
            source = source,
            metadata = metadata
        )
        return api.shareContent(request)
    }

    suspend fun getStatus(): StatusResponse {
        return api.getStatus()
    }

    suspend fun getHistory(limit: Int = 50, offset: Int = 0) {
        val response = api.getHistory(limit = limit, offset = offset)

        val entities = response.messages.map { item ->
            MessageEntity(
                id = item.id,
                role = item.role,
                content = item.content,
                timestamp = item.timestamp
            )
        }
        messageDao.insertAll(entities)
    }

    fun searchMessages(query: String): Flow<List<MessageEntity>> {
        return messageDao.search(query)
    }
}
