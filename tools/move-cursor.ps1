param([int]$X, [int]$Y)
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.Cursor]::Position = New-Object System.Drawing.Point $X, $Y
Write-Output "CURSOR $X,$Y"
