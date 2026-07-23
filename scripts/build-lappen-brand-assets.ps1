param(
  [Parameter(Mandatory = $true)]
  [string]$IconSource,

  [Parameter(Mandatory = $true)]
  [string]$PosterSource
)

Add-Type -AssemblyName System.Drawing

$assetsRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\assets')).Path

function New-Canvas {
  param([int]$Width, [int]$Height)

  $bitmap = New-Object System.Drawing.Bitmap($Width, $Height)
  $bitmap.SetResolution(96, 96)
  return $bitmap
}

function Set-HighQualityGraphics {
  param([System.Drawing.Graphics]$Graphics)

  $Graphics.CompositingQuality = [System.Drawing.Drawing2D.CompositingQuality]::HighQuality
  $Graphics.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $Graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $Graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit
}

function Draw-CoverImage {
  param(
    [System.Drawing.Graphics]$Graphics,
    [System.Drawing.Image]$Image,
    [System.Drawing.Rectangle]$Bounds
  )

  $scale = [Math]::Max($Bounds.Width / $Image.Width, $Bounds.Height / $Image.Height)
  $width = [int][Math]::Ceiling($Image.Width * $scale)
  $height = [int][Math]::Ceiling($Image.Height * $scale)
  $x = $Bounds.X + [int](($Bounds.Width - $width) / 2)
  $y = $Bounds.Y + [int](($Bounds.Height - $height) / 2)
  $Graphics.DrawImage($Image, $x, $y, $width, $height)
}

function Save-ResizedPng {
  param(
    [System.Drawing.Image]$Image,
    [int]$Size,
    [string]$Destination
  )

  $bitmap = New-Canvas -Width $Size -Height $Size
  $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
  try {
    Set-HighQualityGraphics -Graphics $graphics
    $graphics.DrawImage($Image, 0, 0, $Size, $Size)
    $bitmap.Save($Destination, [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $graphics.Dispose()
    $bitmap.Dispose()
  }
}

$icon = [System.Drawing.Image]::FromFile((Resolve-Path $IconSource).Path)
$poster = [System.Drawing.Image]::FromFile((Resolve-Path $PosterSource).Path)

try {
  Save-ResizedPng -Image $icon -Size 1254 -Destination (Join-Path $assetsRoot 'icon.png')
  Save-ResizedPng -Image $icon -Size 768 -Destination (Join-Path $assetsRoot 'icon\large-icon.png')
  Save-ResizedPng -Image $icon -Size 32 -Destination (Join-Path $assetsRoot 'icon\small-icon.png')

  $posterBitmap = New-Canvas -Width 1920 -Height 1080
  $posterGraphics = [System.Drawing.Graphics]::FromImage($posterBitmap)
  try {
    Set-HighQualityGraphics -Graphics $posterGraphics
    Draw-CoverImage -Graphics $posterGraphics -Image $poster -Bounds (New-Object System.Drawing.Rectangle(0, 0, 1920, 1080))

    $shadowBrush = New-Object System.Drawing.SolidBrush([System.Drawing.Color]::FromArgb(180, 0, 0, 0))
    $titleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#E7E9E7'))
    $titleFont = New-Object System.Drawing.Font('Segoe UI Semibold', 68, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $titleFormat = New-Object System.Drawing.StringFormat
    $titleFormat.Alignment = [System.Drawing.StringAlignment]::Center
    $titleFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    try {
      $titleBounds = New-Object System.Drawing.RectangleF(0, 905, 1920, 105)
      $shadowBounds = New-Object System.Drawing.RectangleF(3, 909, 1920, 105)
      $posterGraphics.DrawString('Lappen Recorder', $titleFont, $shadowBrush, $shadowBounds, $titleFormat)
      $posterGraphics.DrawString('Lappen Recorder', $titleFont, $titleBrush, $titleBounds, $titleFormat)
    }
    finally {
      $titleFormat.Dispose()
      $titleFont.Dispose()
      $titleBrush.Dispose()
      $shadowBrush.Dispose()
    }

    $posterBitmap.Save((Join-Path $assetsRoot 'poster\poster.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $posterGraphics.Dispose()
    $posterBitmap.Dispose()
  }

  $overlayBitmap = New-Canvas -Width 750 -Height 300
  $overlayGraphics = [System.Drawing.Graphics]::FromImage($overlayBitmap)
  try {
    Set-HighQualityGraphics -Graphics $overlayGraphics
    $backgroundBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.Rectangle(0, 0, 750, 300)),
      [System.Drawing.ColorTranslator]::FromHtml('#0B0D11'),
      [System.Drawing.ColorTranslator]::FromHtml('#24100B'),
      10
    )
    $backgroundBlend = New-Object System.Drawing.Drawing2D.ColorBlend(4)
    $backgroundBlend.Colors = @(
      [System.Drawing.ColorTranslator]::FromHtml('#0B0D11'),
      [System.Drawing.ColorTranslator]::FromHtml('#3A1709'),
      [System.Drawing.ColorTranslator]::FromHtml('#642A08'),
      [System.Drawing.ColorTranslator]::FromHtml('#260A12')
    )
    $backgroundBlend.Positions = @(0.0, 0.36, 0.70, 1.0)
    $backgroundBrush.InterpolationColors = $backgroundBlend
    $overlayGraphics.FillRectangle($backgroundBrush, 0, 0, 750, 300)
    $backgroundBrush.Dispose()

    $depthBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
      (New-Object System.Drawing.Rectangle(0, 0, 750, 300)),
      [System.Drawing.Color]::FromArgb(10, 255, 255, 255),
      [System.Drawing.Color]::FromArgb(105, 0, 0, 0),
      90
    )
    $overlayGraphics.FillRectangle($depthBrush, 0, 0, 750, 300)
    $depthBrush.Dispose()

    $borderPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#6F7773'), 2)
    $overlayGraphics.DrawRectangle($borderPen, 1, 1, 747, 297)
    $borderPen.Dispose()

    $overlayGraphics.DrawImage($icon, 26, 26, 248, 248)

    $overlayTitleBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#E7E9E7'))
    $overlayAccentBrush = New-Object System.Drawing.SolidBrush([System.Drawing.ColorTranslator]::FromHtml('#B1B8B1'))
    $overlayTitleFont = New-Object System.Drawing.Font('Segoe UI Semibold', 42, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $overlaySubtitleFont = New-Object System.Drawing.Font('Segoe UI', 22, [System.Drawing.FontStyle]::Regular, [System.Drawing.GraphicsUnit]::Pixel)
    $overlayFormat = New-Object System.Drawing.StringFormat
    $overlayFormat.Alignment = [System.Drawing.StringAlignment]::Near
    $overlayFormat.LineAlignment = [System.Drawing.StringAlignment]::Center
    try {
      $overlayGraphics.DrawString('Lappen Recorder', $overlayTitleFont, $overlayTitleBrush, (New-Object System.Drawing.RectangleF(304, 91, 420, 62)), $overlayFormat)
      $overlayGraphics.DrawString('Guild Recording Tool', $overlaySubtitleFont, $overlayAccentBrush, (New-Object System.Drawing.RectangleF(307, 151, 410, 45)), $overlayFormat)

      $accentPen = New-Object System.Drawing.Pen([System.Drawing.ColorTranslator]::FromHtml('#A62B22'), 3)
      $overlayGraphics.DrawLine($accentPen, 307, 204, 555, 204)
      $accentPen.Dispose()
    }
    finally {
      $overlayFormat.Dispose()
      $overlaySubtitleFont.Dispose()
      $overlayTitleFont.Dispose()
      $overlayAccentBrush.Dispose()
      $overlayTitleBrush.Dispose()
    }

    $overlayBitmap.Save((Join-Path $assetsRoot 'poster\chat-overlay.png'), [System.Drawing.Imaging.ImageFormat]::Png)
  }
  finally {
    $overlayGraphics.Dispose()
    $overlayBitmap.Dispose()
  }
}
finally {
  $poster.Dispose()
  $icon.Dispose()
}
