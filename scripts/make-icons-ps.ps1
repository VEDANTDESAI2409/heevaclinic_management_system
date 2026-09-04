Add-Type -AssemblyName System.Drawing
$srcPath = "E:\heeva-clinic\public\icons\icon-.png"
$srcImg = [System.Drawing.Image]::FromFile($srcPath)

function Resize-Png($w, $h, $destPath) {
    $bmp = New-Object System.Drawing.Bitmap($w, $h)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $g.Clear([System.Drawing.Color]::Transparent)
    $g.DrawImage($srcImg, 0, 0, $w, $h)
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated: $destPath"
}

function Create-Maskable($size, $innerSize, $destPath) {
    $bmp = New-Object System.Drawing.Bitmap($size, $size)
    $g = [System.Drawing.Graphics]::FromImage($bmp)
    $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
    $g.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::HighQuality
    $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
    $brush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#FFFFFF'))
    $g.FillRectangle($brush, 0, 0, $size, $size)
    $offset = [int](($size - $innerSize) / 2)
    $g.DrawImage($srcImg, $offset, $offset, $innerSize, $innerSize)
    $bmp.Save($destPath, [System.Drawing.Imaging.ImageFormat]::Png)
    $brush.Dispose()
    $g.Dispose()
    $bmp.Dispose()
    Write-Host "Generated maskable: $destPath"
}

Copy-Item $srcPath "E:\heeva-clinic\public\icons\heeva-logo.png" -Force
Resize-Png 512 512 "E:\heeva-clinic\public\icons\icon-512.png"
Resize-Png 192 192 "E:\heeva-clinic\public\icons\icon-192.png"
Resize-Png 48 48 "E:\heeva-clinic\public\icons\favicon.png"
Create-Maskable 512 400 "E:\heeva-clinic\public\icons\maskable-512.png"

$srcImg.Dispose()
Write-Host "All icons generated successfully!"
