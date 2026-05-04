package com.aitranslensmobile

import com.facebook.react.bridge.*

class ProcessTextModule(context: ReactApplicationContext) : ReactContextBaseJavaModule(context) {

    override fun getName(): String = "ProcessTextModule"

    @ReactMethod
    fun getPendingText(promise: Promise) {
        val text = ProcessTextStore.consumeText()
        if (text != null) {
            val result = Arguments.createMap().apply {
                putString("text", text)
                putBoolean("readonly", ProcessTextStore.isReadonly())
            }
            promise.resolve(result)
        } else {
            promise.resolve(null)
        }
    }
}