package com.marvin.assistant.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.CheckCircle
import androidx.compose.material.icons.filled.Flag
import androidx.compose.material.icons.filled.RadioButtonUnchecked
import androidx.compose.material.icons.filled.Star
import androidx.compose.material3.*
import androidx.compose.material3.pulltorefresh.PullToRefreshBox
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.marvin.assistant.data.models.GoalEntryResponse
import com.marvin.assistant.data.models.TodoEntryResponse
import com.marvin.assistant.data.repository.MarvinRepository
import com.marvin.assistant.ui.theme.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class StatusUiState(
    val priorities: List<String> = emptyList(),
    val activeTodos: List<TodoEntryResponse> = emptyList(),
    val goals: List<GoalEntryResponse> = emptyList(),
    val workGoals: List<String> = emptyList(),
    val personalGoals: List<String> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class StatusViewModel @Inject constructor(
    private val repository: MarvinRepository,
) : ViewModel() {

    private val _uiState = MutableStateFlow(StatusUiState())
    val uiState: StateFlow<StatusUiState> = _uiState.asStateFlow()

    init {
        loadStatus()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)
            try {
                val status = repository.getStatus()
                _uiState.value = _uiState.value.copy(
                    priorities = status.priorities,
                    activeTodos = status.todos?.active ?: emptyList(),
                    goals = status.goals?.tracking ?: emptyList(),
                    workGoals = status.goals?.work ?: emptyList(),
                    personalGoals = status.goals?.personal ?: emptyList(),
                    isRefreshing = false,
                    error = null,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isRefreshing = false,
                    error = e.message ?: "Failed to refresh",
                )
            }
        }
    }

    private fun loadStatus() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true, error = null)
            try {
                val status = repository.getStatus()
                _uiState.value = _uiState.value.copy(
                    priorities = status.priorities,
                    activeTodos = status.todos?.active ?: emptyList(),
                    goals = status.goals?.tracking ?: emptyList(),
                    workGoals = status.goals?.work ?: emptyList(),
                    personalGoals = status.goals?.personal ?: emptyList(),
                    isLoading = false,
                    error = null,
                )
            } catch (e: Exception) {
                _uiState.value = _uiState.value.copy(
                    isLoading = false,
                    error = e.message ?: "Failed to load status",
                )
            }
        }
    }
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun StatusScreen(
    viewModel: StatusViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "Status",
                        style = MaterialTheme.typography.titleLarge,
                    )
                },
                colors = TopAppBarDefaults.topAppBarColors(
                    containerColor = MaterialTheme.colorScheme.background,
                ),
            )
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { padding ->
        PullToRefreshBox(
            isRefreshing = uiState.isRefreshing,
            onRefresh = { viewModel.refresh() },
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            when {
                uiState.isLoading -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        CircularProgressIndicator(color = MarvinAccent)
                    }
                }
                uiState.error != null && uiState.priorities.isEmpty() -> {
                    Box(
                        modifier = Modifier.fillMaxSize(),
                        contentAlignment = Alignment.Center,
                    ) {
                        Column(
                            horizontalAlignment = Alignment.CenterHorizontally,
                            verticalArrangement = Arrangement.spacedBy(8.dp),
                        ) {
                            Text(
                                text = uiState.error ?: "Something went wrong",
                                style = MaterialTheme.typography.bodyLarge,
                                color = MaterialTheme.colorScheme.error,
                            )
                            TextButton(onClick = { viewModel.refresh() }) {
                                Text("Retry", color = MarvinAccent)
                            }
                        }
                    }
                }
                else -> {
                    LazyColumn(
                        modifier = Modifier.fillMaxSize(),
                        contentPadding = PaddingValues(16.dp),
                        verticalArrangement = Arrangement.spacedBy(16.dp),
                    ) {
                        // Priorities section
                        item {
                            SectionHeader(
                                title = "Current Priorities",
                                icon = Icons.Default.Flag,
                            )
                        }
                        if (uiState.priorities.isEmpty()) {
                            item {
                                EmptySection(message = "No priorities set")
                            }
                        } else {
                            items(
                                uiState.priorities,
                                key = { "priority-$it" },
                            ) { priority ->
                                PriorityCard(title = priority)
                            }
                        }

                        // Todos section
                        item {
                            Spacer(modifier = Modifier.height(8.dp))
                            SectionHeader(
                                title = "Active Todos",
                                icon = Icons.Default.CheckCircle,
                            )
                        }
                        if (uiState.activeTodos.isEmpty()) {
                            item {
                                EmptySection(message = "No active todos")
                            }
                        } else {
                            items(
                                uiState.activeTodos,
                                key = { "todo-${it.task}" },
                            ) { todo ->
                                TodoRow(
                                    title = todo.task,
                                    context = todo.context,
                                )
                            }
                        }

                        // Goals section
                        item {
                            Spacer(modifier = Modifier.height(8.dp))
                            SectionHeader(
                                title = "Goals",
                                icon = Icons.Default.Star,
                            )
                        }

                        // Work goals
                        if (uiState.workGoals.isNotEmpty()) {
                            item {
                                Text(
                                    text = "Work",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = TextSecondary,
                                    modifier = Modifier.padding(start = 4.dp, bottom = 4.dp),
                                )
                            }
                            items(
                                uiState.workGoals,
                                key = { "work-goal-$it" },
                            ) { goal ->
                                GoalRow(title = goal, status = "")
                            }
                        }

                        // Personal goals
                        if (uiState.personalGoals.isNotEmpty()) {
                            item {
                                Text(
                                    text = "Personal",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = TextSecondary,
                                    modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 4.dp),
                                )
                            }
                            items(
                                uiState.personalGoals,
                                key = { "personal-goal-$it" },
                            ) { goal ->
                                GoalRow(title = goal, status = "")
                            }
                        }

                        // Tracked goals
                        if (uiState.goals.isNotEmpty()) {
                            item {
                                Text(
                                    text = "Tracking",
                                    style = MaterialTheme.typography.labelLarge,
                                    color = TextSecondary,
                                    modifier = Modifier.padding(start = 4.dp, top = 8.dp, bottom = 4.dp),
                                )
                            }
                            items(
                                uiState.goals,
                                key = { "tracked-${it.goal}" },
                            ) { entry ->
                                GoalRow(
                                    title = entry.goal,
                                    status = entry.status,
                                    notes = entry.notes,
                                )
                            }
                        }

                        if (uiState.workGoals.isEmpty() &&
                            uiState.personalGoals.isEmpty() &&
                            uiState.goals.isEmpty()
                        ) {
                            item {
                                EmptySection(message = "No goals set")
                            }
                        }
                    }
                }
            }
        }
    }
}

@Composable
private fun SectionHeader(
    title: String,
    icon: androidx.compose.ui.graphics.vector.ImageVector,
    modifier: Modifier = Modifier,
) {
    Row(
        modifier = modifier.padding(vertical = 4.dp),
        verticalAlignment = Alignment.CenterVertically,
        horizontalArrangement = Arrangement.spacedBy(8.dp),
    ) {
        Icon(
            imageVector = icon,
            contentDescription = null,
            tint = MarvinAccent,
            modifier = Modifier.size(20.dp),
        )
        Text(
            text = title,
            style = MaterialTheme.typography.titleMedium,
            color = MarvinAccent,
        )
    }
}

@Composable
private fun EmptySection(
    message: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Text(
            text = message,
            style = MaterialTheme.typography.bodyMedium,
            color = TextSecondary,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Composable
private fun PriorityCard(
    title: String,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Text(
            text = title,
            style = MaterialTheme.typography.bodyLarge,
            modifier = Modifier.padding(16.dp),
        )
    }
}

@Composable
private fun TodoRow(
    title: String,
    context: String = "",
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                imageVector = Icons.Default.RadioButtonUnchecked,
                contentDescription = "Not completed",
                tint = TextSecondary,
                modifier = Modifier.size(24.dp),
            )
            Column {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                    color = TextPrimary,
                )
                if (context.isNotBlank()) {
                    Text(
                        text = context,
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                    )
                }
            }
        }
    }
}

@Composable
private fun GoalRow(
    title: String,
    status: String,
    notes: String = "",
    modifier: Modifier = Modifier,
) {
    val statusColor = when (status.lowercase()) {
        "not started" -> TextSecondary
        "in progress" -> StatusWarning
        "completed", "done" -> StatusSuccess
        else -> TextSecondary
    }

    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.SpaceBetween,
        ) {
            Column(modifier = Modifier.weight(1f)) {
                Text(
                    text = title,
                    style = MaterialTheme.typography.bodyMedium,
                )
                if (notes.isNotBlank()) {
                    Text(
                        text = notes,
                        style = MaterialTheme.typography.bodySmall,
                        color = TextSecondary,
                    )
                }
            }
            if (status.isNotBlank()) {
                Surface(
                    shape = RoundedCornerShape(12.dp),
                    color = statusColor.copy(alpha = 0.15f),
                ) {
                    Text(
                        text = status,
                        style = MaterialTheme.typography.labelSmall,
                        color = statusColor,
                        modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                    )
                }
            }
        }
    }
}
