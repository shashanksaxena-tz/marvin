package com.marvin.assistant.ui.navigation

import androidx.compose.foundation.layout.padding
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.ChatBubble
import androidx.compose.material.icons.filled.Dashboard
import androidx.compose.material.icons.filled.History
import androidx.compose.material.icons.outlined.ChatBubbleOutline
import androidx.compose.material.icons.outlined.Dashboard
import androidx.compose.material.icons.outlined.History
import androidx.compose.material3.*
import androidx.compose.runtime.Composable
import androidx.compose.runtime.getValue
import androidx.compose.ui.Modifier
import androidx.compose.ui.graphics.vector.ImageVector
import androidx.navigation.NavDestination.Companion.hierarchy
import androidx.navigation.NavGraph.Companion.findStartDestination
import androidx.navigation.compose.NavHost
import androidx.navigation.compose.composable
import androidx.navigation.compose.currentBackStackEntryAsState
import androidx.navigation.compose.rememberNavController
import com.marvin.assistant.ui.screens.ChatScreen
import com.marvin.assistant.ui.screens.HistoryScreen
import com.marvin.assistant.ui.screens.StatusScreen
import com.marvin.assistant.ui.theme.MarvinAccent
import com.marvin.assistant.ui.theme.TextSecondary

sealed class Screen(
    val route: String,
    val label: String,
    val selectedIcon: ImageVector,
    val unselectedIcon: ImageVector,
) {
    data object Chat : Screen(
        route = "chat",
        label = "Chat",
        selectedIcon = Icons.Filled.ChatBubble,
        unselectedIcon = Icons.Outlined.ChatBubbleOutline,
    )

    data object History : Screen(
        route = "history",
        label = "History",
        selectedIcon = Icons.Filled.History,
        unselectedIcon = Icons.Outlined.History,
    )

    data object Status : Screen(
        route = "status",
        label = "Status",
        selectedIcon = Icons.Filled.Dashboard,
        unselectedIcon = Icons.Outlined.Dashboard,
    )
}

private val bottomNavItems = listOf(Screen.Chat, Screen.History, Screen.Status)

@Composable
fun MarvinNavGraph() {
    val navController = rememberNavController()
    val navBackStackEntry by navController.currentBackStackEntryAsState()
    val currentDestination = navBackStackEntry?.destination

    Scaffold(
        bottomBar = {
            NavigationBar(
                containerColor = MaterialTheme.colorScheme.surface,
            ) {
                bottomNavItems.forEach { screen ->
                    val selected = currentDestination?.hierarchy?.any {
                        it.route == screen.route
                    } == true

                    NavigationBarItem(
                        selected = selected,
                        onClick = {
                            navController.navigate(screen.route) {
                                popUpTo(navController.graph.findStartDestination().id) {
                                    saveState = true
                                }
                                launchSingleTop = true
                                restoreState = true
                            }
                        },
                        icon = {
                            Icon(
                                imageVector = if (selected) screen.selectedIcon else screen.unselectedIcon,
                                contentDescription = screen.label,
                            )
                        },
                        label = {
                            Text(
                                text = screen.label,
                                style = MaterialTheme.typography.labelSmall,
                            )
                        },
                        colors = NavigationBarItemDefaults.colors(
                            selectedIconColor = MarvinAccent,
                            selectedTextColor = MarvinAccent,
                            unselectedIconColor = TextSecondary,
                            unselectedTextColor = TextSecondary,
                            indicatorColor = MarvinAccent.copy(alpha = 0.1f),
                        ),
                    )
                }
            }
        },
        containerColor = MaterialTheme.colorScheme.background,
    ) { innerPadding ->
        NavHost(
            navController = navController,
            startDestination = Screen.Chat.route,
            modifier = Modifier.padding(innerPadding),
        ) {
            composable(Screen.Chat.route) {
                ChatScreen()
            }
            composable(Screen.History.route) {
                HistoryScreen()
            }
            composable(Screen.Status.route) {
                StatusScreen()
            }
        }
    }
}
