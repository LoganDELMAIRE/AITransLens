# Force l'encodage UTF-8
[Console]::OutputEncoding = [System.Text.Encoding]::UTF8
$OutputEncoding = [System.Text.Encoding]::UTF8

Add-Type -AssemblyName UIAutomationClient
Add-Type -AssemblyName UIAutomationTypes

$lastText = $null

while ($true) {
    try {
        $el = [System.Windows.Automation.AutomationElement]::FocusedElement
        $text = $null

        if ($el -ne $null) {
            try {
                $tp = $el.GetCurrentPattern([System.Windows.Automation.TextPattern]::Pattern)
                $ranges = $tp.GetSelection()
                if ($ranges -ne $null -and $ranges.Length -gt 0) {
                    $raw = $ranges[0].GetText(-1)
                    if ($raw -ne $null) {
                        $text = $raw.Trim()
                        if ($text -eq '') { $text = $null }
                    }
                }
            } catch {
                $text = $null
            }
        }

        if ($text -ne $lastText) {
            $lastText = $text
            $payload = [PSCustomObject]@{ text = if ($text) { $text } else { '' } } | ConvertTo-Json -Compress -Depth 1
            [Console]::WriteLine($payload)
        }
    } catch {}

    Start-Sleep -Milliseconds 200
}
