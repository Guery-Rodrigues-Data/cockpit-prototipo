$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:8746/")
$listener.Start()
$root = "C:\Users\guery.braga\Documents\prototipos\cockpit-prototipo"
Write-Host "Cockpit prototipo em http://localhost:8746/"

while ($listener.IsListening) {
  $context = $listener.GetContext()
  $request = $context.Request
  $response = $context.Response
  $path = $request.Url.LocalPath

  if ($path -eq "/") { $path = "/index.html" }
  $filePath = Join-Path $root $path.TrimStart("/")
  if (Test-Path $filePath -PathType Leaf) {
    $bytes = [System.IO.File]::ReadAllBytes($filePath)
    $ext = [System.IO.Path]::GetExtension($filePath)
    $ct = switch ($ext) {
      ".html" { "text/html; charset=utf-8" }
      ".css"  { "text/css" }
      ".js"   { "application/javascript" }
      ".json" { "application/json" }
      ".png"  { "image/png" }
      ".svg"  { "image/svg+xml" }
      default { "application/octet-stream" }
    }
    $response.ContentType = $ct
    $response.Headers.Add("Cache-Control", "no-store, must-revalidate")
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
  } else {
    $response.StatusCode = 404
  }
  $response.OutputStream.Close()
}
