package com.marvin.assistant.ui

import android.os.Bundle
import android.widget.Toast
import androidx.activity.ComponentActivity
import androidx.activity.compose.setContent
import androidx.activity.viewModels
import androidx.compose.animation.AnimatedVisibility
import androidx.compose.foundation.background
import androidx.compose.foundation.layout.Arrangement
import androidx.compose.foundation.layout.Box
import androidx.compose.foundation.layout.Column
import androidx.compose.foundation.layout.Row
import androidx.compose.foundation.layout.Spacer
import androidx.compose.foundation.layout.fillMaxSize
import androidx.compose.foundation.layout.fillMaxWidth
import androidx.compose.foundation.layout.height
import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.layout.width
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Close
import androidx.compose.material.icons.filled.Description
import androidx.compose.material.icons.filled.Image
import androidx.compose.material.icons.filled.Link
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material.icons.filled.Send
import androidx.compose.material.icons.filled.TextSnippet
import androidx.compose.material3.Button
import androidx.compose.material3.ButtonDefaults
import androidx.compose.material3.CircularProgressIndicator
import androidx.compose.material3.Icon
import androidx.compose.material3.IconButton
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.OutlinedTextField
import androidx.compose.material3.OutlinedTextFieldDefaults
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.material3.TextButton
import androidx.compose.runtime.Composable
import androidx.compose.runtime.LaunchedEffect
import androidx.compose.runtime.collectAsState
import androidx.compose.runtime.getValue
import androidx.compose.runtime.mutableStateOf
import androidx.compose.runtime.remember
import androidx.compose.runtime.setValue
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.clip
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.compose.ui.text.font.FontWeight
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.compose.ui.unit.sp
import dagger.hilt.android.AndroidEntryPoint
import kotlinx.coroutines.delay

@AndroidEntryPoint
class ShareReceiverActivity : ComponentActivity() {

    private val viewModel: ShareViewModel by viewModels()

    override fun onCreate(savedInstanceState: Bundle?) {
        super.onCreate(savedInstanceState)

        viewModel.processSharedContent(intent)

        setContent {
            MaterialTheme(
                colorScheme = MaterialTheme.colorScheme.copy(
                    surface = Color(0xFF1E1E1E),
                    onSurface = Color.White,
                    primary = Color(0xFF00BCD4),
                    onPrimary = Color.Black
                )
            ) {
                ShareSheet(
                    viewModel = viewModel,
                    onDismiss = { finish() },
                    onSuccess = { message ->
                        Toast.makeText(this, message, Toast.LENGTH_SHORT).show()
                        finish()
                    }
                )
            }
        }
    }
}

@Composable
private fun ShareSheet(
    viewModel: ShareViewModel,
    onDismiss: () -> Unit,
    onSuccess: (String) -> Unit
) {
    val uiState by viewModel.uiState.collectAsState()
    val sharedContent by viewModel.sharedContent.collectAsState()
    var userContext by remember { mutableStateOf("") }

    LaunchedEffect(uiState) {
        if (uiState is ShareUiState.Success) {
            delay(300)
            onSuccess((uiState as ShareUiState.Success).response.message)
        }
    }

    Box(
        modifier = Modifier
            .fillMaxSize()
            .background(Color.Black.copy(alpha = 0.5f)),
        contentAlignment = Alignment.BottomCenter
    ) {
        Surface(
            modifier = Modifier
                .fillMaxWidth()
                .clip(RoundedCornerShape(topStart = 20.dp, topEnd = 20.dp)),
            color = Color(0xFF1E1E1E),
            tonalElevation = 8.dp
        ) {
            Column(
                modifier = Modifier.padding(20.dp)
            ) {
                // Handle bar
                Box(
                    modifier = Modifier
                        .align(Alignment.CenterHorizontally)
                        .width(40.dp)
                        .height(4.dp)
                        .clip(RoundedCornerShape(2.dp))
                        .background(Color.Gray)
                )

                Spacer(modifier = Modifier.height(16.dp))

                // Header
                Row(
                    modifier = Modifier.fillMaxWidth(),
                    horizontalArrangement = Arrangement.SpaceBetween,
                    verticalAlignment = Alignment.CenterVertically
                ) {
                    Text(
                        text = "Send to MARVIN",
                        color = Color.White,
                        fontSize = 18.sp,
                        fontWeight = FontWeight.SemiBold
                    )
                    IconButton(onClick = onDismiss) {
                        Icon(
                            imageVector = Icons.Default.Close,
                            contentDescription = "Close",
                            tint = Color.Gray
                        )
                    }
                }

                Spacer(modifier = Modifier.height(12.dp))

                // Content preview
                sharedContent?.let { content ->
                    ContentPreview(content)
                }

                Spacer(modifier = Modifier.height(16.dp))

                // Context input
                OutlinedTextField(
                    value = userContext,
                    onValueChange = { userContext = it },
                    label = { Text("Add context (optional)") },
                    placeholder = { Text("e.g. save this for BabyGo") },
                    modifier = Modifier.fillMaxWidth(),
                    colors = OutlinedTextFieldDefaults.colors(
                        focusedBorderColor = Color(0xFF00BCD4),
                        unfocusedBorderColor = Color(0xFF444444),
                        focusedLabelColor = Color(0xFF00BCD4),
                        unfocusedLabelColor = Color.Gray,
                        cursorColor = Color(0xFF00BCD4),
                        focusedTextColor = Color.White,
                        unfocusedTextColor = Color.White
                    ),
                    singleLine = false,
                    maxLines = 3,
                    trailingIcon = {
                        IconButton(onClick = { /* Voice input placeholder */ }) {
                            Icon(
                                imageVector = Icons.Default.Mic,
                                contentDescription = "Voice input",
                                tint = Color(0xFF00BCD4)
                            )
                        }
                    }
                )

                Spacer(modifier = Modifier.height(20.dp))

                // Action buttons
                when (uiState) {
                    is ShareUiState.Loading -> {
                        Box(
                            modifier = Modifier.fillMaxWidth(),
                            contentAlignment = Alignment.Center
                        ) {
                            CircularProgressIndicator(
                                color = Color(0xFF00BCD4),
                                modifier = Modifier.size(32.dp)
                            )
                        }
                    }
                    is ShareUiState.Error -> {
                        Column(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalAlignment = Alignment.CenterHorizontally
                        ) {
                            Text(
                                text = (uiState as ShareUiState.Error).message,
                                color = MaterialTheme.colorScheme.error,
                                fontSize = 14.sp
                            )
                            Spacer(modifier = Modifier.height(8.dp))
                            Row(
                                horizontalArrangement = Arrangement.spacedBy(12.dp)
                            ) {
                                TextButton(onClick = onDismiss) {
                                    Text("Cancel", color = Color.Gray)
                                }
                                Button(
                                    onClick = { viewModel.retry() },
                                    colors = ButtonDefaults.buttonColors(
                                        containerColor = Color(0xFF00BCD4)
                                    )
                                ) {
                                    Text("Retry")
                                }
                            }
                        }
                    }
                    is ShareUiState.Success -> {
                        AnimatedVisibility(visible = true) {
                            Box(
                                modifier = Modifier.fillMaxWidth(),
                                contentAlignment = Alignment.Center
                            ) {
                                Text(
                                    text = "Sent!",
                                    color = Color(0xFF4CAF50),
                                    fontWeight = FontWeight.SemiBold
                                )
                            }
                        }
                    }
                    is ShareUiState.Idle -> {
                        Row(
                            modifier = Modifier.fillMaxWidth(),
                            horizontalArrangement = Arrangement.End,
                            verticalAlignment = Alignment.CenterVertically
                        ) {
                            TextButton(onClick = onDismiss) {
                                Text("Cancel", color = Color.Gray)
                            }
                            Spacer(modifier = Modifier.width(12.dp))
                            Button(
                                onClick = {
                                    viewModel.sendToMarvin(
                                        userContext.ifBlank { null }
                                    )
                                },
                                colors = ButtonDefaults.buttonColors(
                                    containerColor = Color(0xFF00BCD4)
                                ),
                                enabled = sharedContent != null
                            ) {
                                Icon(
                                    imageVector = Icons.Default.Send,
                                    contentDescription = null,
                                    modifier = Modifier.size(18.dp)
                                )
                                Spacer(modifier = Modifier.width(8.dp))
                                Text("Send")
                            }
                        }
                    }
                }

                Spacer(modifier = Modifier.height(8.dp))
            }
        }
    }
}

@Composable
private fun ContentPreview(content: SharedContent) {
    val icon: ImageVector
    val label: String
    val preview: String

    when (content.type) {
        "url" -> {
            icon = Icons.Default.Link
            label = content.title ?: "Link"
            preview = content.url ?: content.text ?: ""
        }
        "image" -> {
            icon = Icons.Default.Image
            label = content.title ?: "Image"
            preview = content.imageUri?.lastPathSegment ?: "Shared image"
        }
        "pdf" -> {
            icon = Icons.Default.Description
            label = content.title ?: "PDF"
            preview = content.imageUri?.lastPathSegment ?: "Shared PDF"
        }
        else -> {
            icon = Icons.Default.TextSnippet
            label = "Text"
            preview = content.text ?: ""
        }
    }

    Surface(
        modifier = Modifier.fillMaxWidth(),
        color = Color(0xFF2A2A2A),
        shape = RoundedCornerShape(12.dp)
    ) {
        Row(
            modifier = Modifier.padding(12.dp),
            verticalAlignment = Alignment.CenterVertically
        ) {
            Icon(
                imageVector = icon,
                contentDescription = null,
                tint = Color(0xFF00BCD4),
                modifier = Modifier.size(32.dp)
            )
            Spacer(modifier = Modifier.width(12.dp))
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = label,
                    color = Color.White,
                    fontWeight = FontWeight.Medium,
                    fontSize = 14.sp,
                    maxLines = 1,
                    overflow = TextOverflow.Ellipsis
                )
                Text(
                    text = preview,
                    color = Color.Gray,
                    fontSize = 12.sp,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis
                )
            }
        }
    }
}
