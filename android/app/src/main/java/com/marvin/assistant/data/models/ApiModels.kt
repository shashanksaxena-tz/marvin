package com.marvin.assistant.data.models

import com.google.gson.annotations.SerializedName

data class MessageRequest(
    @SerializedName("message") val message: String,
    @SerializedName("context") val context: Map<String, String>? = null
)

data class MessageResponse(
    @SerializedName("response") val response: String,
    @SerializedName("timestamp") val timestamp: Long,
    @SerializedName("tasks") val tasks: List<Todo>? = null
)

data class ShareRequest(
    @SerializedName("type") val type: String,
    @SerializedName("content") val content: String,
    @SerializedName("source") val source: String? = null,
    @SerializedName("metadata") val metadata: Map<String, String>? = null
)

data class ShareResponse(
    @SerializedName("success") val success: Boolean,
    @SerializedName("message") val message: String
)

data class StatusResponse(
    @SerializedName("status") val status: String,
    @SerializedName("goals") val goals: Goals? = null,
    @SerializedName("todos") val todos: List<Todo>? = null
)

data class HistoryResponse(
    @SerializedName("messages") val messages: List<HistoryItem>,
    @SerializedName("total") val total: Int
)

data class HistoryItem(
    @SerializedName("id") val id: String,
    @SerializedName("role") val role: String,
    @SerializedName("content") val content: String,
    @SerializedName("timestamp") val timestamp: Long
)

data class Todo(
    @SerializedName("id") val id: String,
    @SerializedName("title") val title: String,
    @SerializedName("completed") val completed: Boolean,
    @SerializedName("priority") val priority: String? = null
)

data class Goals(
    @SerializedName("work") val work: List<String>,
    @SerializedName("personal") val personal: List<String>
)
