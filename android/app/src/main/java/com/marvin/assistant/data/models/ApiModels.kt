package com.marvin.assistant.data.models

import com.google.gson.annotations.SerializedName

// ---------- Message API ----------

data class MessageRequest(
    @SerializedName("text") val text: String,
    @SerializedName("source") val source: String = "android"
)

data class MessageResponse(
    @SerializedName("response") val response: String,
    @SerializedName("classification") val classification: String,
    @SerializedName("provider") val provider: String? = null
)

// ---------- Voice API ----------

data class VoiceResponse(
    @SerializedName("response") val response: String,
    @SerializedName("classification") val classification: String,
    @SerializedName("transcription") val transcription: String
)

// ---------- Share API ----------

data class ShareRequest(
    @SerializedName("url") val url: String? = null,
    @SerializedName("text") val text: String? = null,
    @SerializedName("image") val image: String? = null,
    @SerializedName("context") val context: String? = null
)

data class ShareResponse(
    @SerializedName("response") val response: String,
    @SerializedName("summary") val summary: String? = null,
    @SerializedName("connections") val connections: List<String> = emptyList()
)

// ---------- Status API ----------

data class StatusResponse(
    @SerializedName("priorities") val priorities: List<String>,
    @SerializedName("todos") val todos: TodosResponse? = null,
    @SerializedName("goals") val goals: GoalsResponse? = null
)

data class TodosResponse(
    @SerializedName("active") val active: List<TodoEntryResponse> = emptyList(),
    @SerializedName("completed") val completed: List<CompletedTodoResponse> = emptyList(),
    @SerializedName("followUps") val followUps: List<FollowUpResponse> = emptyList()
)

data class TodoEntryResponse(
    @SerializedName("task") val task: String,
    @SerializedName("added") val added: String = "",
    @SerializedName("context") val context: String = ""
)

data class CompletedTodoResponse(
    @SerializedName("task") val task: String,
    @SerializedName("completed") val completed: String = "",
    @SerializedName("notes") val notes: String = ""
)

data class FollowUpResponse(
    @SerializedName("item") val item: String,
    @SerializedName("reviewDate") val reviewDate: String = "",
    @SerializedName("notes") val notes: String = ""
)

data class GoalsResponse(
    @SerializedName("work") val work: List<String> = emptyList(),
    @SerializedName("personal") val personal: List<String> = emptyList(),
    @SerializedName("tracking") val tracking: List<GoalEntryResponse> = emptyList()
)

data class GoalEntryResponse(
    @SerializedName("goal") val goal: String,
    @SerializedName("type") val type: String = "",
    @SerializedName("status") val status: String = "",
    @SerializedName("notes") val notes: String = ""
)

// ---------- History API ----------

data class HistoryResponse(
    @SerializedName("messages") val messages: List<HistoryItem>,
    @SerializedName("total") val total: Int
)

data class HistoryItem(
    @SerializedName("id") val id: Int,
    @SerializedName("source") val source: String,
    @SerializedName("inputType") val inputType: String,
    @SerializedName("inputText") val inputText: String,
    @SerializedName("classification") val classification: String? = null,
    @SerializedName("response") val response: String? = null,
    @SerializedName("metadata") val metadata: Any? = null,
    @SerializedName("createdAt") val createdAt: String
)
