# Cuts picture sheets (several objects on one plain background, e.g. from Gemini) into one
# picture per object, ready for TRELLIS (D-062). Labels and small specks are left out.
#   1. Put the sheet pictures (.png .jpg .jpeg .jfif) in F:\OneShot\sheets
#   2. .\tools\run.ps1 "powershell -NoProfile -ExecutionPolicy Bypass -File tools\crop-sheets.ps1"
#   3. The pieces are in F:\OneShot\pieces (one .png per object, white square background).
# A sheet already cut is skipped (delete its pieces to cut it again).
# This file is ASCII only on purpose (Windows PowerShell 5.1 reads non-BOM files as ANSI).

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
Set-Location $root
Add-Type -AssemblyName System.Drawing

Add-Type -ReferencedAssemblies System.Drawing -TypeDefinition @"
using System;
using System.Collections.Generic;
using System.Drawing;
using System.Drawing.Imaging;
using System.Runtime.InteropServices;

public static class SheetCutter {
    // Finds the objects on a plain background: pixels far from the background color are
    // grouped (with a small gap allowed) and every group's box is returned, biggest first.
    public static List<Rectangle> Find(Bitmap src, int threshold, double minAreaFrac, double minHeightFrac) {
        int w = src.Width, h = src.Height;
        Bitmap bmp = new Bitmap(w, h, PixelFormat.Format32bppArgb);
        using (Graphics g = Graphics.FromImage(bmp)) { g.DrawImage(src, 0, 0, w, h); }
        BitmapData data = bmp.LockBits(new Rectangle(0, 0, w, h), ImageLockMode.ReadOnly, PixelFormat.Format32bppArgb);
        byte[] px = new byte[data.Stride * h];
        Marshal.Copy(data.Scan0, px, 0, px.Length);
        bmp.UnlockBits(data);
        int stride = data.Stride;

        // Background = average of the four corner areas.
        long sr = 0, sg = 0, sb = 0, n = 0;
        int c = Math.Max(4, Math.Min(w, h) / 40);
        foreach (int[] corner in new int[][] { new int[] {0,0}, new int[] {w-c,0}, new int[] {0,h-c}, new int[] {w-c,h-c} }) {
            for (int y = corner[1]; y < corner[1] + c; y++)
                for (int x = corner[0]; x < corner[0] + c; x++) {
                    int i = y * stride + x * 4;
                    sb += px[i]; sg += px[i + 1]; sr += px[i + 2]; n++;
                }
        }
        int br = (int)(sr / n), bg = (int)(sg / n), bb = (int)(sb / n);

        // Mask on a coarse grid (cells of 4 px) to merge an object's parts and stay fast.
        int cell = 4, gw = (w + cell - 1) / cell, gh = (h + cell - 1) / cell;
        bool[] mask = new bool[gw * gh];
        for (int y = 0; y < h; y++)
            for (int x = 0; x < w; x++) {
                int i = y * stride + x * 4;
                int d = Math.Abs(px[i + 2] - br) + Math.Abs(px[i + 1] - bg) + Math.Abs(px[i] - bb);
                if (d > threshold) mask[(y / cell) * gw + (x / cell)] = true;
            }
        // Grow the mask by 2 cells so nearby parts of one object join.
        bool[] grown = new bool[mask.Length];
        for (int y = 0; y < gh; y++)
            for (int x = 0; x < gw; x++) {
                if (!mask[y * gw + x]) continue;
                for (int dy = -2; dy <= 2; dy++)
                    for (int dx = -2; dx <= 2; dx++) {
                        int yy = y + dy, xx = x + dx;
                        if (yy >= 0 && yy < gh && xx >= 0 && xx < gw) grown[yy * gw + xx] = true;
                    }
            }

        List<Rectangle> boxes = new List<Rectangle>();
        bool[] seen = new bool[grown.Length];
        Queue<int> queue = new Queue<int>();
        for (int start = 0; start < grown.Length; start++) {
            if (!grown[start] || seen[start]) continue;
            int x0 = int.MaxValue, y0 = int.MaxValue, x1 = -1, y1 = -1;
            seen[start] = true;
            queue.Enqueue(start);
            while (queue.Count > 0) {
                int k = queue.Dequeue();
                int kx = k % gw, ky = k / gw;
                if (mask[k]) { x0 = Math.Min(x0, kx); y0 = Math.Min(y0, ky); x1 = Math.Max(x1, kx); y1 = Math.Max(y1, ky); }
                for (int dy = -1; dy <= 1; dy++)
                    for (int dx = -1; dx <= 1; dx++) {
                        int nx = kx + dx, ny = ky + dy;
                        if (nx < 0 || ny < 0 || nx >= gw || ny >= gh) continue;
                        int nk = ny * gw + nx;
                        if (grown[nk] && !seen[nk]) { seen[nk] = true; queue.Enqueue(nk); }
                    }
            }
            if (x1 < 0) continue;
            Rectangle r = new Rectangle(x0 * cell, y0 * cell, Math.Min(w, (x1 + 1) * cell) - x0 * cell, Math.Min(h, (y1 + 1) * cell) - y0 * cell);
            // Text labels and specks: too small or too flat to be an object.
            if (r.Width * (double)r.Height < minAreaFrac * w * h) continue;
            if (r.Height < minHeightFrac * h) continue;
            boxes.Add(r);
        }
        boxes.Sort((a, b) => (b.Width * b.Height).CompareTo(a.Width * a.Height));
        bmp.Dispose();
        return boxes;
    }
}
"@

$sheets = Join-Path $root 'sheets'
$pieces = Join-Path $root 'pieces'
New-Item -ItemType Directory -Force -Path $sheets, $pieces | Out-Null
$ignore = Join-Path $root '.gitignore'
$text = Get-Content $ignore -Raw
foreach ($entry in @('sheets/', 'pieces/')) {
  if ($text -notmatch [regex]::Escape($entry)) { Add-Content -Path $ignore -Value $entry }
}

$files = @(Get-ChildItem $sheets -File | Where-Object { $_.Extension -match '^\.(png|jpe?g|jfif|bmp)$' })
if ($files.Count -eq 0) { throw "No sheet pictures in $sheets (png, jpg, jfif)" }

$total = 0
foreach ($file in $files) {
  $base = ($file.BaseName.ToLower() -replace '[^a-z0-9]+', '_').Trim('_')
  if (Get-ChildItem $pieces -Filter "$($base)_*.png" -ErrorAction SilentlyContinue) {
    Write-Host "$($file.Name): already cut"
    continue
  }
  $img = [System.Drawing.Bitmap]::FromFile($file.FullName)
  try {
    $boxes = [SheetCutter]::Find($img, 80, 0.012, 0.08)
    $i = 0
    foreach ($r in $boxes) {
      $i++
      $pad = [int]([Math]::Max($r.Width, $r.Height) * 0.08)
      $side = [Math]::Max($r.Width, $r.Height) + 2 * $pad
      $out = New-Object System.Drawing.Bitmap $side, $side
      $g = [System.Drawing.Graphics]::FromImage($out)
      $g.Clear([System.Drawing.Color]::White)
      $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
      $dx = [int](($side - $r.Width) / 2)
      $dy = [int](($side - $r.Height) / 2)
      $g.DrawImage($img, (New-Object System.Drawing.Rectangle $dx, $dy, $r.Width, $r.Height), $r, [System.Drawing.GraphicsUnit]::Pixel)
      $g.Dispose()
      $path = Join-Path $pieces ("{0}_{1:D2}.png" -f $base, $i)
      $out.Save($path, [System.Drawing.Imaging.ImageFormat]::Png)
      $out.Dispose()
    }
    Write-Host "$($file.Name): $($boxes.Count) piece(s)"
    $total += $boxes.Count
  } finally {
    $img.Dispose()
  }
}
Write-Host "Pieces: $total new, in $pieces"
Invoke-Item $pieces
