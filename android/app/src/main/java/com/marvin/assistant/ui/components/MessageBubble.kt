package com.marvin.assistant.ui.components

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import com.marvin.assistant.ui.theme.*

data class ChatMessage(
    val id: String,
    val text: String,
    val sender: String,
    val timestamp: String,
    val classification: String? = null,
    val isUser: Boolean = true,
)

@Composable
fun MessageBubble(
    message: ChatMessage,
    modifier: Modifier = Modifier,
) {
    val isUser = message.isUser
    val bubbleColor = if (isUser) UserMessageBlue else DarkSurface
    val alignment = if (isUser) Alignment.CenterEnd else Alignment.CenterStart
    val bubbleShape = if (isUser) {
        RoundedCornerShape(16.dp, 16.dp, 4.dp, 16.dp)
    } else {
        RoundedCornerShape(16.dp, 16.dp, 16.dp, 4.dp)
    }

    Box(
        modifier = modifier
            .fillMaxWidth()
            .padding(
                start = if (isUser) 48.dp else 0.dp,
                end = if (isUser) 0.dp else 48.dp,
            ),
        contentAlignment = alignment,
    ) {
        Column {
            Surface(
                shape = bubbleShape,
                color = bubbleColor,
            ) {
                Column(
                    modifier = Modifier.padding(12.dp),
                ) {
                    if (!isUser) {
                        Text(
                            text = message.sender,
                            style = MaterialTheme.typography.labelSmall,
                            color = MarvinAccent,
                            modifier = Modifier.padding(bottom = 4.dp),
                        )
                    }
                    Text(
                        text = message.text,
                        style = MaterialTheme.typography.bodyMedium,
                        color = TextPrimary,
                    )
                }
            }

            Row(
                modifier = Modifier.padding(top = 4.dp, start = 4.dp, end = 4.dp),
                verticalAlignment = Alignment.CenterVertically,
                horizontalArrangement = Arrangement.spacedBy(6.dp),
            ) {
                Text(
                    text = message.timestamp,
                    style = MaterialTheme.typography.labelSmall,
                    color = TextSecondary,
                )
                if (!isUser && message.classification != null) {
                    ClassificationChip(classification = message.classification)
                }
            }
        }
    }
}
