[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes
Add-Type -AssemblyName System.Windows.Forms

$lastText = $null
$wasDown  = $false
$startX   = 0
$startY   = 0
$tick     = 0

function Get-UIASelection {
    try {
        $el = [System.Windows.Automation.AutomationElement]::FocusedElement
        if ($el -eq $null) { return $null }
        $tp     = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
        $ranges = $tp.GetSelection()
        if ($ranges -ne $null -and $ranges.Length -gt 0) {
            $raw = $ranges[0].GetText(-1)
            if ($raw -ne $null) {
                $t = $raw.Trim()
                if ($t -ne '') { return $t }
            }
        }
    } catch {}
    return $null
}

while ($true) {
    $tick++

    # ── UIAutomation ─────────────────────────────────────────────────────────
    # Pollé toutes les ~200ms (5 ticks × 40ms) — couvre Chrome, VS Code, Notepad…
    if ($tick % 5 -eq 0) {
        $text = Get-UIASelection
        if ($text -ne $lastText) {
            $lastText = $text
            $payload = [PSCustomObject]@{ text = if ($text) { $text } else { '' } } | ConvertTo-Json -Compress -Depth 1
            [Console]::WriteLine($payload)
        }
    }

    # ── Détection glissement souris ───────────────────────────────────────────
    # Pour les apps sans UIAutomation TextPattern (Discord, Teams, apps Electron…)
    $isDown = ([System.Windows.Forms.Control]::MouseButtons -band [System.Windows.Forms.MouseButtons]::Left) -ne 0

    if ($isDown -and -not $wasDown) {
        $pos    = [System.Windows.Forms.Cursor]::Position
        $startX = $pos.X
        $startY = $pos.Y
        # Notifie Node.js qu'un mousedown vient de se produire (pour fermer le mini bouton si clic extérieur)
        [Console]::WriteLine('{"mousedown":true}')
    }

    if (-not $isDown -and $wasDown) {
        $pos = [System.Windows.Forms.Cursor]::Position
        $dx  = [Math]::Abs($pos.X - $startX)
        $dy  = [Math]::Abs($pos.Y - $startY)

        if ($dx -gt 15 -or $dy -gt 5) {
            # Laisser l'app traiter le mouseup
            [System.Threading.Thread]::Sleep(80)
            # Si UIAutomation n'a rien trouvé, simuler ^c
            # Le clipboard poller Node.js détectera le changement
            if (-not (Get-UIASelection)) {
                [System.Windows.Forms.SendKeys]::SendWait("^c")
            }
        }
    }

    $wasDown = $isDown
    [System.Threading.Thread]::Sleep(40)
}
