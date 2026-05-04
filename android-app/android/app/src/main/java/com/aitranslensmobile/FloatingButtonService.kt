package com.aitranslensmobile

import android.app.*
import android.content.*
import android.graphics.*
import android.graphics.drawable.GradientDrawable
import android.os.*
import android.view.*
import android.widget.*
import androidx.core.app.NotificationCompat

class FloatingButtonService : Service() {

    private lateinit var windowManager: WindowManager
    private lateinit var clipboardManager: ClipboardManager
    private var buttonView: View? = null
    private var pendingText = ""
    private val handler = Handler(Looper.getMainLooper())
    private var autoHideRunnable: Runnable? = null
    private var debouncedHideRunnable: Runnable? = null

    private var isFromSelection = false

    private val selectionReceiver = object : BroadcastReceiver() {
        override fun onReceive(context: Context, intent: Intent) {
            val text = intent.getStringExtra(SelectionAccessibilityService.EXTRA_TEXT) ?: ""
            if (text.isNotBlank()) {
                pendingText = text
                isFromSelection = true
                cancelDebouncedHide()   // nouvelle sélection — annule tout masquage en attente
                showButtonBottomCenter()
            } else {
                if (isFromSelection) {
                    // Debounce : l'AccessibilityService envoie parfois un "vide" transitoire
                    // juste après la sélection. On attend 1.5s avant de vraiment masquer.
                    scheduleDebouncedHide(1500)
                }
            }
        }
    }

    private val clipboardListener = ClipboardManager.OnPrimaryClipChangedListener {
        // Skip if selection is active (already showing button via AccessibilityService)
        if (isFromSelection) return@OnPrimaryClipChangedListener

        val text = try {
            clipboardManager.primaryClip?.getItemAt(0)?.text?.toString()
        } catch (e: SecurityException) { null }

        if (!text.isNullOrBlank() && text != pendingText) {
            pendingText = text
            isFromSelection = false
            showButtonBottomCenter(autoHideMs = 10_000)
        }
    }

    override fun onCreate() {
        super.onCreate()
        windowManager = getSystemService(WINDOW_SERVICE) as WindowManager
        clipboardManager = getSystemService(CLIPBOARD_SERVICE) as ClipboardManager

        val filter = IntentFilter(SelectionAccessibilityService.ACTION_SELECTION)
        registerReceiver(selectionReceiver, filter, RECEIVER_NOT_EXPORTED)
        clipboardManager.addPrimaryClipChangedListener(clipboardListener)

        startForeground(NOTIF_ID, buildNotification())
    }

    override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int = START_STICKY

    override fun onBind(intent: Intent?): IBinder? = null

    override fun onDestroy() {
        super.onDestroy()
        unregisterReceiver(selectionReceiver)
        clipboardManager.removePrimaryClipChangedListener(clipboardListener)
        hideButton()
    }

    // autoHideMs = null means no auto-hide (stays until selection clears)
    private fun showButtonBottomCenter(autoHideMs: Long? = null) {
        handler.post {
            cancelAutoHide()

            // If already showing, just refresh text and timer — avoid flicker
            if (buttonView != null) {
                if (autoHideMs != null) scheduleAutoHide(autoHideMs)
                return@post
            }

            val params = WindowManager.LayoutParams(
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.WRAP_CONTENT,
                WindowManager.LayoutParams.TYPE_APPLICATION_OVERLAY,
                WindowManager.LayoutParams.FLAG_NOT_FOCUSABLE or
                        WindowManager.LayoutParams.FLAG_NOT_TOUCH_MODAL,
                PixelFormat.TRANSLUCENT
            ).apply {
                gravity = Gravity.BOTTOM or Gravity.CENTER_HORIZONTAL
                y = 220  // px from bottom — clears nav bar and keyboard on most devices
            }

            val bView = buildButtonView()
            buttonView = bView
            windowManager.addView(bView, params)

            if (autoHideMs != null) scheduleAutoHide(autoHideMs)
        }
    }

    private fun buildButtonView(): View {
        val ctx = this

        // Pill background
        val bg = GradientDrawable().apply {
            shape = GradientDrawable.RECTANGLE
            cornerRadius = 100f
            colors = intArrayOf(Color.parseColor("#7C6FF0"), Color.parseColor("#9D95F5"))
            orientation = GradientDrawable.Orientation.LEFT_RIGHT
        }

        val layout = LinearLayout(ctx).apply {
            orientation = LinearLayout.HORIZONTAL
            gravity = Gravity.CENTER_VERTICAL
            background = bg
            setPadding(36, 20, 36, 20)
            elevation = 12f

            // Globe icon
            addView(TextView(ctx).apply {
                text = "🌐"
                textSize = 16f
            })

            // Separator space
            addView(View(ctx).apply {
                layoutParams = LinearLayout.LayoutParams(12, 1)
            })

            // Label
            addView(TextView(ctx).apply {
                text = "Traduire"
                textSize = 15f
                setTextColor(Color.WHITE)
                typeface = Typeface.create(Typeface.DEFAULT, Typeface.BOLD)
            })
        }

        layout.setOnClickListener {
            ProcessTextStore.set(pendingText, true)
            hideButton()
            val intent = Intent(ctx, MainActivity::class.java).apply {
                addFlags(Intent.FLAG_ACTIVITY_NEW_TASK or Intent.FLAG_ACTIVITY_SINGLE_TOP)
                putExtra("fromProcessText", true)
            }
            startActivity(intent)
        }

        layout.setOnLongClickListener {
            hideButton()
            true
        }

        return layout
    }

    private fun hideButton() {
        handler.post {
            cancelAutoHide()
            cancelDebouncedHide()
            isFromSelection = false
            removeExistingButton()
        }
    }

    private fun removeExistingButton() {
        buttonView?.let {
            try { windowManager.removeView(it) } catch (_: Exception) {}
            buttonView = null
        }
    }

    // Auto-hide pour le mode clipboard (délai fixe, pas annulable par sélection)
    private fun scheduleAutoHide(delayMs: Long) {
        autoHideRunnable?.let { handler.removeCallbacks(it) }
        autoHideRunnable = Runnable { hideButton() }.also { handler.postDelayed(it, delayMs) }
    }

    private fun cancelAutoHide() {
        autoHideRunnable?.let { handler.removeCallbacks(it) }
        autoHideRunnable = null
    }

    // Debounce-hide pour le mode sélection (annulable si nouvelle sélection arrive)
    private fun scheduleDebouncedHide(delayMs: Long) {
        cancelDebouncedHide()
        debouncedHideRunnable = Runnable { hideButton() }.also { handler.postDelayed(it, delayMs) }
    }

    private fun cancelDebouncedHide() {
        debouncedHideRunnable?.let { handler.removeCallbacks(it) }
        debouncedHideRunnable = null
    }

    private fun buildNotification(): Notification {
        val channelId = "aitranslens_floating"
        val nm = getSystemService(NOTIFICATION_SERVICE) as NotificationManager
        if (nm.getNotificationChannel(channelId) == null) {
            nm.createNotificationChannel(
                NotificationChannel(channelId, "AITransLens", NotificationManager.IMPORTANCE_MIN).apply {
                    description = "Bouton de traduction flottant"
                    setShowBadge(false)
                }
            )
        }

        val openIntent = PendingIntent.getActivity(
            this, 0,
            Intent(this, MainActivity::class.java).apply { addFlags(Intent.FLAG_ACTIVITY_NEW_TASK) },
            PendingIntent.FLAG_IMMUTABLE
        )

        return NotificationCompat.Builder(this, channelId)
            .setContentTitle("AITransLens actif")
            .setContentText("Bouton de traduction disponible")
            .setSmallIcon(android.R.drawable.ic_menu_mylocation)
            .setContentIntent(openIntent)
            .setPriority(NotificationCompat.PRIORITY_MIN)
            .setSilent(true)
            .build()
    }

    companion object {
        private const val NOTIF_ID = 42
    }
}
