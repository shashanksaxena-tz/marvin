package com.marvin.assistant.notifications

import android.Manifest
import android.app.NotificationChannel
import android.app.NotificationManager
import android.content.Context
import android.content.pm.PackageManager
import android.os.Build
import androidx.core.app.NotificationCompat
import androidx.core.app.NotificationManagerCompat
import androidx.core.content.ContextCompat
import dagger.hilt.android.qualifiers.ApplicationContext
import javax.inject.Inject
import javax.inject.Singleton

@Singleton
class NotificationHelper @Inject constructor(
    @ApplicationContext private val context: Context
) {

    companion object {
        const val CHANNEL_RESPONSES = "marvin_responses"
        const val CHANNEL_NUDGES = "marvin_nudges"
        private var notificationId = 1000
    }

    init {
        createNotificationChannels()
    }

    private fun createNotificationChannels() {
        val responseChannel = NotificationChannel(
            CHANNEL_RESPONSES,
            "MARVIN Responses",
            NotificationManager.IMPORTANCE_DEFAULT
        ).apply {
            description = "Responses from MARVIN after sharing content"
        }

        val nudgeChannel = NotificationChannel(
            CHANNEL_NUDGES,
            "MARVIN Reminders",
            NotificationManager.IMPORTANCE_HIGH
        ).apply {
            description = "Proactive reminders and nudges from MARVIN"
        }

        val notificationManager = context.getSystemService(NotificationManager::class.java)
        notificationManager.createNotificationChannel(responseChannel)
        notificationManager.createNotificationChannel(nudgeChannel)
    }

    fun showResponseNotification(title: String, body: String) {
        if (!hasNotificationPermission()) return

        val notification = NotificationCompat.Builder(context, CHANNEL_RESPONSES)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle(title)
            .setContentText(body)
            .setStyle(NotificationCompat.BigTextStyle().bigText(body))
            .setPriority(NotificationCompat.PRIORITY_DEFAULT)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(nextId(), notification)
    }

    fun showNudgeNotification(message: String) {
        if (!hasNotificationPermission()) return

        val notification = NotificationCompat.Builder(context, CHANNEL_NUDGES)
            .setSmallIcon(android.R.drawable.ic_dialog_info)
            .setContentTitle("MARVIN")
            .setContentText(message)
            .setStyle(NotificationCompat.BigTextStyle().bigText(message))
            .setPriority(NotificationCompat.PRIORITY_HIGH)
            .setAutoCancel(true)
            .build()

        NotificationManagerCompat.from(context).notify(nextId(), notification)
    }

    fun hasNotificationPermission(): Boolean {
        return if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
            ContextCompat.checkSelfPermission(
                context,
                Manifest.permission.POST_NOTIFICATIONS
            ) == PackageManager.PERMISSION_GRANTED
        } else {
            true
        }
    }

    private fun nextId(): Int = notificationId++
}
