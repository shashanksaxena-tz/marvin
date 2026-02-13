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
import androidx.compose.ui.text.style.TextDecoration
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.marvin.assistant.ui.theme.*
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.delay
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

data class Priority(
    val id: String,
    val title: String,
    val description: String? = null,
)

data class TodoItem(
    val id: String,
    val title: String,
    val isCompleted: Boolean = false,
)

data class Goal(
    val id: String,
    val title: String,
    val status: GoalStatus = GoalStatus.IN_PROGRESS,
)

enum class GoalStatus {
    NOT_STARTED, IN_PROGRESS, COMPLETED
}

data class StatusUiState(
    val priorities: List<Priority> = emptyList(),
    val todos: List<TodoItem> = emptyList(),
    val goals: List<Goal> = emptyList(),
    val isLoading: Boolean = false,
    val isRefreshing: Boolean = false,
    val error: String? = null,
)

@HiltViewModel
class StatusViewModel @Inject constructor() : ViewModel() {

    private val _uiState = MutableStateFlow(StatusUiState())
    val uiState: StateFlow<StatusUiState> = _uiState.asStateFlow()

    init {
        loadStatus()
    }

    fun refresh() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isRefreshing = true)
            // TODO: Replace with actual API call to fetch status from MARVIN backend
            delay(1000)
            _uiState.value = _uiState.value.copy(isRefreshing = false)
        }
    }

    fun toggleTodo(todoId: String) {
        val updatedTodos = _uiState.value.todos.map { todo ->
            if (todo.id == todoId) todo.copy(isCompleted = !todo.isCompleted) else todo
        }
        _uiState.value = _uiState.value.copy(todos = updatedTodos)
    }

    private fun loadStatus() {
        viewModelScope.launch {
            _uiState.value = _uiState.value.copy(isLoading = true)
            // TODO: Replace with actual API call
            delay(500)
            _uiState.value = _uiState.value.copy(isLoading = false)
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
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = MarvinAccent)
                }
            } else {
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
                        items(uiState.priorities, key = { it.id }) { priority ->
                            PriorityCard(priority = priority)
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
                    if (uiState.todos.isEmpty()) {
                        item {
                            EmptySection(message = "No active todos")
                        }
                    } else {
                        items(uiState.todos, key = { it.id }) { todo ->
                            TodoRow(
                                todo = todo,
                                onToggle = { viewModel.toggleTodo(todo.id) },
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
                    if (uiState.goals.isEmpty()) {
                        item {
                            EmptySection(message = "No goals set")
                        }
                    } else {
                        items(uiState.goals, key = { it.id }) { goal ->
                            GoalRow(goal = goal)
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
    priority: Priority,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
    ) {
        Column(
            modifier = Modifier.padding(16.dp),
            verticalArrangement = Arrangement.spacedBy(4.dp),
        ) {
            Text(
                text = priority.title,
                style = MaterialTheme.typography.bodyLarge,
            )
            priority.description?.let { desc ->
                Text(
                    text = desc,
                    style = MaterialTheme.typography.bodySmall,
                    color = TextSecondary,
                )
            }
        }
    }
}

@Composable
private fun TodoRow(
    todo: TodoItem,
    onToggle: () -> Unit,
    modifier: Modifier = Modifier,
) {
    Surface(
        modifier = modifier.fillMaxWidth(),
        shape = RoundedCornerShape(12.dp),
        color = MaterialTheme.colorScheme.surface,
        onClick = onToggle,
    ) {
        Row(
            modifier = Modifier
                .fillMaxWidth()
                .padding(12.dp),
            verticalAlignment = Alignment.CenterVertically,
            horizontalArrangement = Arrangement.spacedBy(12.dp),
        ) {
            Icon(
                imageVector = if (todo.isCompleted) {
                    Icons.Default.CheckCircle
                } else {
                    Icons.Default.RadioButtonUnchecked
                },
                contentDescription = if (todo.isCompleted) "Completed" else "Not completed",
                tint = if (todo.isCompleted) StatusSuccess else TextSecondary,
                modifier = Modifier.size(24.dp),
            )
            Text(
                text = todo.title,
                style = MaterialTheme.typography.bodyMedium,
                textDecoration = if (todo.isCompleted) TextDecoration.LineThrough else null,
                color = if (todo.isCompleted) TextSecondary else TextPrimary,
            )
        }
    }
}

@Composable
private fun GoalRow(
    goal: Goal,
    modifier: Modifier = Modifier,
) {
    val statusColor = when (goal.status) {
        GoalStatus.NOT_STARTED -> TextSecondary
        GoalStatus.IN_PROGRESS -> StatusWarning
        GoalStatus.COMPLETED -> StatusSuccess
    }
    val statusLabel = when (goal.status) {
        GoalStatus.NOT_STARTED -> "Not started"
        GoalStatus.IN_PROGRESS -> "In progress"
        GoalStatus.COMPLETED -> "Completed"
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
            Text(
                text = goal.title,
                style = MaterialTheme.typography.bodyMedium,
                modifier = Modifier.weight(1f),
            )
            Surface(
                shape = RoundedCornerShape(12.dp),
                color = statusColor.copy(alpha = 0.15f),
            ) {
                Text(
                    text = statusLabel,
                    style = MaterialTheme.typography.labelSmall,
                    color = statusColor,
                    modifier = Modifier.padding(horizontal = 8.dp, vertical = 4.dp),
                )
            }
        }
    }
}
