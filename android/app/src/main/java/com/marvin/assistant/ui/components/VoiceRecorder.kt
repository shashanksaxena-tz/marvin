package com.marvin.assistant.ui.components

import android.Manifest
import android.media.MediaRecorder
import android.os.Build
import androidx.compose.animation.core.*
import androidx.compose.foundation.gestures.detectTapGestures
import androidx.compose.foundation.layout.size
import androidx.compose.foundation.shape.CircleShape
import androidx.compose.material.icons.Icons
import androidx.compose.material.icons.filled.Mic
import androidx.compose.material3.Icon
import androidx.compose.material3.MaterialTheme
import androidx.compose.material3.Surface
import androidx.compose.runtime.*
import androidx.compose.ui.Modifier
import androidx.compose.ui.draw.scale
import androidx.compose.ui.input.pointer.pointerInput
import androidx.compose.ui.platform.LocalContext
import androidx.compose.ui.unit.dp
import com.google.accompanist.permissions.ExperimentalPermissionsApi
import com.google.accompanist.permissions.isGranted
import com.google.accompanist.permissions.rememberPermissionState
import com.marvin.assistant.ui.theme.MarvinAccent
import com.marvin.assistant.ui.theme.TextOnAccent
import java.io.File

@OptIn(ExperimentalPermissionsApi::class)
@Composable
fun VoiceRecorderButton(
    onRecordingComplete: (String) -> Unit,
    modifier: Modifier = Modifier,
) {
    val context = LocalContext.current
    val micPermission = rememberPermissionState(Manifest.permission.RECORD_AUDIO)

    var isRecording by remember { mutableStateOf(false) }
    var recorder by remember { mutableStateOf<MediaRecorder?>(null) }
    var outputFile by remember { mutableStateOf<String?>(null) }

    val pulseAnim = rememberInfiniteTransition(label = "pulse")
    val scale by pulseAnim.animateFloat(
        initialValue = 1f,
        targetValue = 1.2f,
        animationSpec = infiniteRepeatable(
            animation = tween(500, easing = FastOutSlowInEasing),
            repeatMode = RepeatMode.Reverse,
        ),
        label = "pulseScale",
    )

    fun startRecording() {
        val file = File(context.cacheDir, "marvin_voice_${System.currentTimeMillis()}.m4a")
        outputFile = file.absolutePath
        val mr = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.S) {
            MediaRecorder(context)
        } else {
            @Suppress("DEPRECATION")
            MediaRecorder()
        }
        mr.apply {
            setAudioSource(MediaRecorder.AudioSource.MIC)
            setOutputFormat(MediaRecorder.OutputFormat.MPEG_4)
            setAudioEncoder(MediaRecorder.AudioEncoder.AAC)
            setAudioSamplingRate(44100)
            setAudioEncodingBitRate(128000)
            setOutputFile(file.absolutePath)
            prepare()
            start()
        }
        recorder = mr
        isRecording = true
    }

    fun stopRecording() {
        try {
            recorder?.apply {
                stop()
                release()
            }
        } catch (_: Exception) { }
        recorder = null
        isRecording = false
        outputFile?.let { path ->
            if (File(path).exists() && File(path).length() > 0) {
                onRecordingComplete(path)
            }
        }
        outputFile = null
    }

    Surface(
        modifier = modifier
            .size(48.dp)
            .then(if (isRecording) Modifier.scale(scale) else Modifier)
            .pointerInput(Unit) {
                detectTapGestures(
                    onPress = {
                        if (!micPermission.status.isGranted) {
                            micPermission.launchPermissionRequest()
                            return@detectTapGestures
                        }
                        startRecording()
                        tryAwaitRelease()
                        stopRecording()
                    },
                )
            },
        shape = CircleShape,
        color = if (isRecording) MaterialTheme.colorScheme.error else MarvinAccent,
    ) {
        Icon(
            imageVector = Icons.Default.Mic,
            contentDescription = if (isRecording) "Release to stop recording" else "Hold to record",
            tint = TextOnAccent,
            modifier = Modifier.size(24.dp),
        )
    }
}
