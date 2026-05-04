package com.aitranslensmobile

import android.accessibilityservice.AccessibilityService
import android.accessibilityservice.AccessibilityServiceInfo
import android.content.Intent
import android.graphics.Rect
import android.view.accessibility.AccessibilityEvent
import android.view.accessibility.AccessibilityNodeInfo

class SelectionAccessibilityService : AccessibilityService() {

    companion object {
        const val ACTION_SELECTION = "com.aitranslensmobile.SELECTION"
        const val EXTRA_TEXT = "text"
        const val EXTRA_BOUNDS_TOP = "bounds_top"
        const val EXTRA_BOUNDS_BOTTOM = "bounds_bottom"
        const val EXTRA_BOUNDS_LEFT = "bounds_left"
        const val EXTRA_BOUNDS_RIGHT = "bounds_right"
    }

    private var lastText = ""

    override fun onServiceConnected() {
        serviceInfo = serviceInfo.also {
            it.eventTypes = AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED or
                    AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED
            it.feedbackType = AccessibilityServiceInfo.FEEDBACK_GENERIC
            it.flags = AccessibilityServiceInfo.FLAG_REPORT_VIEW_IDS or
                    AccessibilityServiceInfo.FLAG_RETRIEVE_INTERACTIVE_WINDOWS
            it.notificationTimeout = 100
        }
    }

    override fun onAccessibilityEvent(event: AccessibilityEvent) {
        when (event.eventType) {
            AccessibilityEvent.TYPE_VIEW_TEXT_SELECTION_CHANGED -> handleSelectionEvent(event)
            AccessibilityEvent.TYPE_WINDOW_STATE_CHANGED -> {
                // Hide button when our own app comes to foreground
                if (event.packageName?.toString() == "com.aitranslensmobile") {
                    broadcast("")
                }
            }
        }
    }

    private fun handleSelectionEvent(event: AccessibilityEvent) {
        val source: AccessibilityNodeInfo = event.source ?: return

        val fullText = source.text?.toString() ?: run {
            source.recycle()
            broadcast("")
            return
        }

        val selStart = source.textSelectionStart
        val selEnd = source.textSelectionEnd

        if (selStart < 0 || selEnd <= selStart || selEnd > fullText.length) {
            source.recycle()
            if (lastText.isNotEmpty()) {
                lastText = ""
                broadcast("")
            }
            return
        }

        val selected = fullText.substring(selStart, selEnd).trim()
        if (selected.isBlank()) {
            source.recycle()
            if (lastText.isNotEmpty()) {
                lastText = ""
                broadcast("")
            }
            return
        }

        if (selected == lastText) {
            source.recycle()
            return
        }

        lastText = selected

        val bounds = Rect()
        source.getBoundsInScreen(bounds)
        source.recycle()

        broadcast(selected, bounds)
    }

    private fun broadcast(text: String, bounds: Rect = Rect()) {
        sendBroadcast(Intent(ACTION_SELECTION).apply {
            setPackage(packageName)
            putExtra(EXTRA_TEXT, text)
            putExtra(EXTRA_BOUNDS_TOP, bounds.top)
            putExtra(EXTRA_BOUNDS_BOTTOM, bounds.bottom)
            putExtra(EXTRA_BOUNDS_LEFT, bounds.left)
            putExtra(EXTRA_BOUNDS_RIGHT, bounds.right)
        })
    }

    override fun onInterrupt() {
        broadcast("")
    }

    override fun onDestroy() {
        super.onDestroy()
        broadcast("")
    }
}