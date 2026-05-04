package com.aitranslensmobile

import android.content.Intent
import android.net.Uri
import android.os.Build
import android.provider.Settings
import android.accessibilityservice.AccessibilityServiceInfo
import android.view.accessibility.AccessibilityManager
import com.facebook.react.bridge.*

class PermissionsModule(private val ctx: ReactApplicationContext) : ReactContextBaseJavaModule(ctx) {

    override fun getName() = "PermissionsModule"

    @ReactMethod
    fun hasOverlayPermission(promise: Promise) {
        promise.resolve(Settings.canDrawOverlays(ctx))
    }

    @ReactMethod
    fun hasAccessibilityPermission(promise: Promise) {
        promise.resolve(isAccessibilityEnabled())
    }

    @ReactMethod
    fun requestOverlayPermission() {
        val intent = Intent(
            Settings.ACTION_MANAGE_OVERLAY_PERMISSION,
            Uri.parse("package:${ctx.packageName}")
        ).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) }
        ctx.startActivity(intent)
    }

    @ReactMethod
    fun requestAccessibilityPermission() {
        val intent = Intent(Settings.ACTION_ACCESSIBILITY_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        ctx.startActivity(intent)
    }

    @ReactMethod
    fun startFloatingService(promise: Promise) {
        if (!Settings.canDrawOverlays(ctx)) {
            promise.reject("NO_PERMISSION", "Overlay permission required")
            return
        }
        try {
            val intent = Intent(ctx, FloatingButtonService::class.java)
            ctx.startForegroundService(intent)
            promise.resolve(true)
        } catch (e: Exception) {
            promise.reject("ERROR", e.message)
        }
    }

    @ReactMethod
    fun stopFloatingService() {
        ctx.stopService(Intent(ctx, FloatingButtonService::class.java))
    }

    private fun isAccessibilityEnabled(): Boolean {
        val am = ctx.getSystemService(AccessibilityManager::class.java) ?: return false
        val services = am.getEnabledAccessibilityServiceList(AccessibilityServiceInfo.FEEDBACK_ALL_MASK)
        return services.any { it.resolveInfo.serviceInfo.packageName == ctx.packageName }
    }
}