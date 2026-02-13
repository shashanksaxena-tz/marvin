package com.marvin.assistant.ui

import android.content.Intent
import android.net.Uri
import androidx.lifecycle.ViewModel
import androidx.lifecycle.viewModelScope
import com.marvin.assistant.data.api.MarvinApi
import com.marvin.assistant.data.models.ShareRequest
import com.marvin.assistant.data.models.ShareResponse
import dagger.hilt.android.lifecycle.HiltViewModel
import kotlinx.coroutines.flow.MutableStateFlow
import kotlinx.coroutines.flow.StateFlow
import kotlinx.coroutines.flow.asStateFlow
import kotlinx.coroutines.launch
import javax.inject.Inject

sealed class ShareUiState {
    data object Idle : ShareUiState()
    data object Loading : ShareUiState()
    data class Success(val response: ShareResponse) : ShareUiState()
    data class Error(val message: String) : ShareUiState()
}

data class SharedContent(
    val type: String,
    val text: String? = null,
    val url: String? = null,
    val imageUri: Uri? = null,
    val title: String? = null
)

@HiltViewModel
class ShareViewModel @Inject constructor(
    private val api: MarvinApi
) : ViewModel() {

    private val _uiState = MutableStateFlow<ShareUiState>(ShareUiState.Idle)
    val uiState: StateFlow<ShareUiState> = _uiState.asStateFlow()

    private val _sharedContent = MutableStateFlow<SharedContent?>(null)
    val sharedContent: StateFlow<SharedContent?> = _sharedContent.asStateFlow()

    fun processSharedContent(intent: Intent) {
        val action = intent.action
        val type = intent.type ?: return

        if (action != Intent.ACTION_SEND) return

        when {
            type == "text/plain" -> processTextIntent(intent)
            type.startsWith("image/") -> processImageIntent(intent)
            type == "application/pdf" -> processPdfIntent(intent)
        }
    }

    private fun processTextIntent(intent: Intent) {
        val text = intent.getStringExtra(Intent.EXTRA_TEXT) ?: return
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)

        val url = extractUrl(text)
        val displayTitle = subject ?: url?.let { extractDomain(it) }

        _sharedContent.value = SharedContent(
            type = if (url != null) "url" else "text",
            text = text,
            url = url,
            title = displayTitle
        )
    }

    private fun processImageIntent(intent: Intent) {
        val imageUri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM) ?: return
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)

        _sharedContent.value = SharedContent(
            type = "image",
            imageUri = imageUri,
            title = subject ?: "Shared Image"
        )
    }

    private fun processPdfIntent(intent: Intent) {
        val pdfUri = intent.getParcelableExtra<Uri>(Intent.EXTRA_STREAM) ?: return
        val subject = intent.getStringExtra(Intent.EXTRA_SUBJECT)

        _sharedContent.value = SharedContent(
            type = "pdf",
            imageUri = pdfUri,
            title = subject ?: "Shared PDF"
        )
    }

    fun sendToMarvin(userContext: String? = null) {
        val content = _sharedContent.value ?: return

        viewModelScope.launch {
            _uiState.value = ShareUiState.Loading
            try {
                val metadata = mutableMapOf<String, String>()
                if (content.title != null) metadata["title"] = content.title
                if (content.url != null) metadata["url"] = content.url
                if (userContext != null) metadata["user_context"] = userContext

                val shareRequest = ShareRequest(
                    type = content.type,
                    content = content.text ?: content.imageUri?.toString() ?: "",
                    source = "android_share",
                    metadata = metadata.ifEmpty { null }
                )

                val response = api.shareContent(shareRequest)
                _uiState.value = ShareUiState.Success(response)
            } catch (e: Exception) {
                _uiState.value = ShareUiState.Error(
                    e.message ?: "Failed to share with MARVIN"
                )
            }
        }
    }

    fun retry() {
        _uiState.value = ShareUiState.Idle
    }

    private fun extractUrl(text: String): String? {
        val urlPattern = Regex("""https?://\S+""")
        return urlPattern.find(text)?.value
    }

    private fun extractDomain(url: String): String {
        return try {
            Uri.parse(url).host ?: url
        } catch (e: Exception) {
            url
        }
    }
}
