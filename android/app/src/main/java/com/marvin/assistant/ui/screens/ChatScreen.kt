package com.marvin.assistant.ui.screens

import androidx.compose.animation.AnimatedVisibility
import androidx.compose.animation.fadeIn
import androidx.compose.animation.fadeOut
import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.lazy.rememberLazyListState
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.automirrored.filled.Send
import androidx.compose.material.icons.filled.AttachFile
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.marvin.assistant.data.local.MessageEntity
import com.marvin.assistant.data.repository.MarvinRepository
import com.marvin.assistant.ui.components.ChatMessage
import com.marvin.assistant.ui.components.MessageBubble
import com.marvin.assistant.ui.components.VoiceRecorderButton
import com.marvin.assistant.ui.theme.MarvinAccent
import com.marvin.assistant.ui.theme.TextSecondary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import okhttp3.MediaType.Companion.toMediaType
import okhttp3.MultipartBody
import okhttp3.RequestBody.Companion.asRequestBody
import java.io.File
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ChatViewModel @Inject constructor(
    private val repository: MarvinRepository
) : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())

    init {
        // Load cached messages from Room DB
        viewModelScope.launch {
            repository.messages.collect { entities ->
                // Room returns DESC order; reverse for chronological display
                val chatMessages = entities.reversed().map { it.toChatMessage() }
                _uiState.value = _uiState.value.copy(messages = chatMessages)
            }
        }
    }

    fun sendMessage(text: String) {
        if (text.isBlank()) return

        // Show optimistic user message immediately
        val userMessage = ChatMessage(
            id = "pending_user_${System.currentTimeMillis()}",
            text = text.trim(),
            sender = "You",
            timestamp = timeFormat.format(Date()),
            isUser = true,
        )

        _uiState.value = _uiState.value.copy(
            messages = _uiState.value.messages + userMessage,
            isLoading = true,
            error = null,
        )

        viewModelScope.launch {
            try {
                val response = repository.sendMessage(text.trim())

                // The repository caches both messages to Room, which triggers
                // the Flow collector above to update the UI. We just need to
                // add the assistant response optimistically for immediate display
                // (the Room Flow will reconcile on next emission).
                val assistantMessage = ChatMessage(
                    id = "assistant_${System.currentTimeMillis()}",
                    text = response.response,
                    sender = "MARVIN",
                    timestamp = timeFormat.format(Date()),
                    classification = response.classification,
                    isUser = false,
                )
                _uiState.value = _uiState.value.copy(
                    messages = _uiState.value.messages + assistantMessage,
                    isLoading = false,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to send message",
                )
            }
        }
    }

    fun sendVoiceRecording(filePath: String) {
        val file = File(filePath)
        if (!file.exists() || file.length() == 0L) {
            _uiState.value = _uiState.value.copy(error = "Recording file not found")
            return
        }

        _uiState.value = _uiState.value.copy(
            isLoading = true,
            error = null,
        )

        viewModelScope.launch {
            try {
                val requestBody = file.asRequestBody("audio/mp4".toMediaType())
                val audioPart = MultipartBody.Part.createFormData("audio", file.name, requestBody)

                val response = repository.sendVoice(audioPart)

                // Show the transcribed user message and the assistant response
                val now = System.currentTimeMillis()
                val transcriptionMessage = ChatMessage(
                    id = "voice_user_$now",
                    text = response.transcription,
                    sender = "You (voice)",
                    timestamp = timeFormat.format(Date()),
                    isUser = true,
                )
                val assistantMessage = ChatMessage(
                    id = "voice_assistant_$now",
                    text = response.response,
                    sender = "MARVIN",
                    timestamp = timeFormat.format(Date()),
                    classification = response.classification,
                    isUser = false,
                )
                _uiState.value = _uiState.value.copy(
                    messages = _uiState.value.messages + transcriptionMessage + assistantMessage,
                    isLoading = false,
                )

                // Clean up the temp recording file
                file.delete()
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to send voice message",
                )
            }
        }
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
    }

    private fun MessageEntity.toChatMessage(): ChatMessage {
        return ChatMessage(
            id = id,
            text = content,
            sender = if (role == "user") "You" else "MARVIN",
            timestamp = timeFormat.format(Date(timestamp)),
            isUser = role == "user",
        )
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun ChatScreen(
    viewModel: ChatViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()
    var inputText by remember { mutableStateOf("") }
    val listState = rememberLazyListState()

    // Auto-scroll to bottom on new messages
    LaunchedEffect(uiState.messages.size) {
        if (uiState.messages.isNotEmpty()) {
            listState.animateScrollToItem(uiState.messages.size - 1)
        }
    }

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Column {
                        Text(
                            text = "MARVIN",
                            style = MaterialTheme.typography.titleLarge,
                            color = MarvinAccent,
                        )
                        Text(
                            text = "Your AI Chief of Staff",
                            style = MaterialTheme.typography.labelSmall,
                            color = TextSecondary,
                        )
                    }
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // Error banner
            AnimatedVisibility(
                visible = uiState.error != null,
                enter = fadeIn(),
                exit = fadeOut(),
            ) {
                uiState.error?.let { error ->
                    Surface(
                        modifier = Modifier
                            .fillMaxWidth()
                            .padding(horizontal = 16.dp, vertical = 4.dp),
                        color = MaterialTheme.colorScheme.error.copy(alpha = 0.1f),
                        shape = RoundedCornerShape(8.dp),
                    ) {
                        Text(
                            text = error,
                            style = MaterialTheme.typography.bodySmall,
                            color = MaterialTheme.colorScheme.error,
                            modifier = Modifier.padding(12.dp),
                        )
                    }
                }
            }

            // Message list
            LazyColumn(
                modifier = Modifier
                    .weight(1f)
                    .fillMaxWidth(),
                state = listState,
                contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                verticalArrangement = Arrangement.spacedBy(12.dp),
            ) {
                items(uiState.messages, key = { it.id }) { message ->
                    MessageBubble(message = message)
                }

                // Loading indicator
                if (uiState.isLoading) {
                    item {
                        Row(
                            modifier = Modifier.padding(start = 8.dp, top = 4.dp),
                            verticalAlignment = Alignment.CenterVertically,
                            horizontalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            CircularProgressIndicator(
                                modifier = Modifier.size(16.dp),
                                strokeWidth = 2.dp,
                                color = MarvinAccent,
                            )
                            Text(
                                text = "MARVIN is thinking...",
                                style = MaterialTheme.typography.bodySmall,
                                color = TextSecondary,
                            )
                        }
                    }
                }
            }

            // Input bar
            Surface(
                modifier = Modifier.fillMaxWidth(),
                color = MaterialTheme.colorScheme.surface,
                tonalElevation = 2.dp,
            ) {
                Row(
                    modifier = Modifier
                        .padding(horizontal = 8.dp, vertical = 8.dp)
                        .navigationBarsPadding(),
                    verticalAlignment = Alignment.CenterVertically,
                    horizontalArrangement = Arrangement.spacedBy(4.dp),
                ) {
                    // Attachment button
                    IconButton(onClick = { /* TODO: File picker */ }) {
                        Icon(
                            imageVector = Icons.Default.AttachFile,
                            contentDescription = "Attach file",
                            tint = TextSecondary,
                        )
                    }

                    // Text input
                    OutlinedTextField(
                        value = inputText,
                        onValueChange = { inputText = it },
                        modifier = Modifier.weight(1f),
                        placeholder = {
                            Text(
                                text = "Message MARVIN...",
                                color = TextSecondary,
                            )
                        },
                        colors = OutlinedTextFieldDefaults.colors(
                            focusedBorderColor = MarvinAccent,
                            unfocusedBorderColor = MaterialTheme.colorScheme.surfaceVariant,
                            cursorColor = MarvinAccent,
                        ),
                        shape = RoundedCornerShape(24.dp),
                        maxLines = 4,
                    )

                    // Send or mic button
                    if (inputText.isNotBlank()) {
                        IconButton(
                            onClick = {
                                viewModel.sendMessage(inputText)
                                inputText = ""
                            },
                        ) {
                            Icon(
                                imageVector = Icons.AutoMirrored.Filled.Send,
                                contentDescription = "Send message",
                                tint = MarvinAccent,
                            )
                        }
                    } else {
                        VoiceRecorderButton(
                            onRecordingComplete = { filePath ->
                                viewModel.sendVoiceRecording(filePath)
                            },
                        )
                    }
                }
            }
        }
    }
}
