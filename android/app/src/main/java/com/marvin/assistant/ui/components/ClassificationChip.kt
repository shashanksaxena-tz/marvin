package com.marvin.assistant.ui.components

import androidx.compose.foundation.layout.padding
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.material3.Text
import androidx.compose.runtime.Composable
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.Color
import androidx.compose.ui.unit.dp
import com.marvin.assistant.ui.theme.*

@Composable
fun ClassificationChip(
    classification: String,
    modifier: Modifier = Modifier,
) {
    val chipColor = when (classification.lowercase()) {
        "capture" -> ChipCapture
        "task" -> ChipTask
        "question" -> ChipQuestion
        "link" -> ChipLink
        "note" -> ChipNote
        else -> ChipNote
    }

    Surface(
        modifier = modifier,
        shape = RoundedCornerShape(12.dp),
        color = chipColor.copy(alpha = 0.2f),
    ) {
        Text(
            text = classification.lowercase(),
            style = MaterialTheme.typography.labelSmall,
            color = chipColor,
            modifier = Modifier.padding(horizontal = 8.dp, vertical = 2.dp),
        )
    }
}
