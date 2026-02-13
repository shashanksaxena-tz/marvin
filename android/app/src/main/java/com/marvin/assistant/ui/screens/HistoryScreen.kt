package com.marvin.assistant.ui.screens

import androidx.compose.foundation.layout.*
import androidx.compose.foundation.lazy.LazyColumn
import androidx.compose.foundation.lazy.LazyRow
import androidx.compose.foundation.lazy.items
import androidx.compose.foundation.shape.RoundedCornerShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Search
import androidx.compose.material3.*
import androidx.compose.runtime.*
import androidx.compose.ui.Alignment
import androidx.compose.ui.Modifier
import androidx.compose.ui.text.style.TextOverflow
import androidx.compose.ui.unit.dp
import androidx.hilt.navigation.compose.hiltViewModel
import androidx.lifecycle.ViewModel
import com.marvin.assistant.ui.components.ClassificationChip
import com.marvin.assistant.ui.theme.MarvinAccent
import com.marvin.assistant.ui.theme.TextSecondary
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import javax.inject.Inject

data class HistoryItem(
    val id: String,
    val preview: String,
    val classification: String,
    val timestamp: String,
)

data class HistoryUiState(
    val items: List<HistoryItem> = emptyList(),
    val filteredItems: List<HistoryItem> = emptyList(),
    val searchQuery: String = "",
    val selectedFilter: String = "All",
    val isLoading: Boolean = false,
)

@HiltViewModel
class HistoryViewModel @Inject constructor() : ViewModel() {

    private val filters = listOf("All", "Captures", "Tasks", "Questions", "Links")

    private val _uiState = MutableStateFlow(HistoryUiState())
    val uiState: StateFlow<HistoryUiState> = _uiState.asStateFlow()

    fun search(query: String) {
        _uiState.value = _uiState.value.copy(searchQuery = query)
        applyFilters()
    }

    fun filter(filterName: String) {
        _uiState.value = _uiState.value.copy(selectedFilter = filterName)
        applyFilters()
    }

    private fun applyFilters() {
        val state = _uiState.value
        val filtered = state.items.filter { item ->
            val matchesSearch = state.searchQuery.isBlank() ||
                item.preview.contains(state.searchQuery, ignoreCase = true)
            val matchesFilter = state.selectedFilter == "All" ||
                item.classification.equals(
                    state.selectedFilter.removeSuffix("s"),
                    ignoreCase = true,
                )
            matchesSearch && matchesFilter
        }
        _uiState.value = state.copy(filteredItems = filtered)
    }

    fun getFilters(): List<String> = filters
}

@OptIn(ExperimentalMaterial3Api::class)
@Composable
fun HistoryScreen(
    viewModel: HistoryViewModel = hiltViewModel(),
) {
    val uiState by viewModel.uiState.collectAsState()

    Scaffold(
        topBar = {
            TopAppBar(
                title = {
                    Text(
                        text = "History",
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
        Column(
            modifier = Modifier
                .fillMaxSize()
                .padding(padding),
        ) {
            // Search bar
            OutlinedTextField(
                value = uiState.searchQuery,
                onValueChange = { viewModel.search(it) },
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(horizontal = 16.dp, vertical = 8.dp),
                placeholder = {
                    Text("Search history...", color = TextSecondary)
                },
                leadingIcon = {
                    Icon(
                        imageVector = Icons.Default.Search,
                        contentDescription = "Search",
                        tint = TextSecondary,
                    )
                },
                colors = OutlinedTextFieldDefaults.colors(
                    focusedBorderColor = MarvinAccent,
                    unfocusedBorderColor = MaterialTheme.colorScheme.surfaceVariant,
                    cursorColor = MarvinAccent,
                ),
                shape = RoundedCornerShape(12.dp),
                singleLine = true,
            )

            // Filter chips
            LazyRow(
                modifier = Modifier
                    .fillMaxWidth()
                    .padding(vertical = 8.dp),
                contentPadding = PaddingValues(horizontal = 16.dp),
                horizontalArrangement = Arrangement.spacedBy(8.dp),
            ) {
                items(viewModel.getFilters()) { filterName ->
                    FilterChip(
                        selected = uiState.selectedFilter == filterName,
                        onClick = { viewModel.filter(filterName) },
                        label = {
                            Text(
                                text = filterName,
                                style = MaterialTheme.typography.labelLarge,
                            )
                        },
                        colors = FilterChipDefaults.filterChipColors(
                            selectedContainerColor = MarvinAccent.copy(alpha = 0.2f),
                            selectedLabelColor = MarvinAccent,
                        ),
                    )
                }
            }

            // History items list
            if (uiState.isLoading) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    CircularProgressIndicator(color = MarvinAccent)
                }
            } else if (uiState.filteredItems.isEmpty()) {
                Box(
                    modifier = Modifier.fillMaxSize(),
                    contentAlignment = Alignment.Center,
                ) {
                    Text(
                        text = if (uiState.searchQuery.isNotBlank()) {
                            "No results found"
                        } else {
                            "No history yet"
                        },
                        style = MaterialTheme.typography.bodyLarge,
                        color = TextSecondary,
                    )
                }
            } else {
                LazyColumn(
                    modifier = Modifier.fillMaxSize(),
                    contentPadding = PaddingValues(horizontal = 16.dp, vertical = 8.dp),
                    verticalArrangement = Arrangement.spacedBy(8.dp),
                ) {
                    items(uiState.filteredItems, key = { it.id }) { item ->
                        HistoryItemCard(item = item)
                    }
                }
            }
        }
    }
}

@Composable
private fun HistoryItemCard(
    item: HistoryItem,
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
                .padding(16.dp),
            verticalAlignment = Alignment.CenterVertically,
        ) {
            Column(
                modifier = Modifier.weight(1f),
                verticalArrangement = Arrangement.spacedBy(4.dp),
            ) {
                Text(
                    text = item.preview,
                    style = MaterialTheme.typography.bodyMedium,
                    maxLines = 2,
                    overflow = TextOverflow.Ellipsis,
                )
                Row(
                    horizontalArrangement = Arrangement.spacedBy(8.dp),
                    verticalAlignment = Alignment.CenterVertically,
                ) {
                    ClassificationChip(classification = item.classification)
                    Text(
                        text = item.timestamp,
                        style = MaterialTheme.typography.labelSmall,
                        color = TextSecondary,
                    )
                }
            }
        }
    }
}
