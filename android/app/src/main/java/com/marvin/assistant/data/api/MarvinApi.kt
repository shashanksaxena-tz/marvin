package com.marvin.assistant.data.api

import com.marvin.assistant.data.models.HistoryResponse
import com.marvin.assistant.data.models.MessageRequest
import com.marvin.assistant.data.models.MessageResponse
import com.marvin.assistant.data.models.ShareRequest
import com.marvin.assistant.data.models.ShareResponse
import com.marvin.assistant.data.models.StatusResponse
import com.marvin.assistant.data.models.VoiceResponse
import okhttp3.MultipartBody
import retrofit2.http.Body
import retrofit2.http.GET
import retrofit2.http.Multipart
import retrofit2.http.POST
import retrofit2.http.Part
import retrofit2.http.Query

interface MarvinApi {

    @POST("api/message")
    suspend fun sendMessage(@Body request: MessageRequest): MessageResponse

    @Multipart
    @POST("api/voice")
    suspend fun sendVoice(@Part audio: MultipartBody.Part): VoiceResponse

    @POST("api/share")
    suspend fun shareContent(@Body request: ShareRequest): ShareResponse

    @GET("api/status")
    suspend fun getStatus(): StatusResponse

    @GET("api/history")
    suspend fun getHistory(
        @Query("limit") limit: Int,
        @Query("offset") offset: Int,
        @Query("type") type: String? = null,
        @Query("search") search: String? = null
    ): HistoryResponse
}
