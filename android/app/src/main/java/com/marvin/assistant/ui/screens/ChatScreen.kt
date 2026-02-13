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
import com.marvin.assistant.ui.components.ChatMessage
import com.marvin.assistant.ui.components.MessageBubble
import com.marvin.assistant.ui.components.VoiceRecorderButton
import com.marvin.assistant.ui.theme.MarvinAccent
import com.marvin.assistant.ui.theme.TextSecondary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import java.text.SimpleDateFormat
import java.util.*
import javax.inject.Inject

data class ChatUiState(
    val messages: List<ChatMessage> = emptyList(),
    val isLoading: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class ChatViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(ChatUiState())
    val uiState: StateFlow<ChatUiState> = _uiState.asStateFlow()

    private val timeFormat = SimpleDateFormat("h:mm a", Locale.getDefault())

    fun sendMessage(text: String) {
        if (text.isBlank()) return

        val userMessage = ChatMessage(
            id = UUID.randomUUID().toString(),
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
                // TODO: Replace with actual API call to MARVIN backend
                delay(1000)
                val response = ChatMessage(
                    id = UUID.randomUUID().toString(),
                    text = "I received your message. The MARVIN backend integration is coming soon.",
                    sender = "MARVIN",
                    timestamp = timeFormat.format(Date()),
                    classification = "note",
                    isUser = false,
                )
                _uiState.value = _uiState.value.copy(
                    messages = _uiState.value.messages + response,
                    isLoading = false,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Something went wrong",
                )
            }
        }
    }

    fun sendVoiceRecording(filePath: String) {
        // TODO: Send audio file to transcription service
        sendMessage("[Voice message recorded]")
    }

    fun clearError() {
        _uiState.value = _uiState.value.copy(error = null)
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
