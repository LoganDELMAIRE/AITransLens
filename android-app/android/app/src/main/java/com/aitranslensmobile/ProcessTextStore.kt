package com.aitranslensmobile

object ProcessTextStore {
    private var pendingText: String? = null
    private var pendingReadonly: Boolean = true

    @Synchronized
    fun set(text: String, readonly: Boolean) {
        pendingText = text
        pendingReadonly = readonly
    }

    @Synchronized
    fun consumeText(): String? {
        val text = pendingText
        pendingText = null
        return text
    }

    fun isReadonly(): Boolean = pendingReadonly
}