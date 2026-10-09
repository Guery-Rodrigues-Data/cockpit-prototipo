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

  # Proxy de leitura p/ a API de eventos do Antares (dev): ela nao libera CORS para esta origem.
  # Mesmo contrato de api/antares.js (header X-Antares-Token; o token nao e gravado nem logado).
  if ($path -eq "/api/antares") {
    $token = $request.Headers["X-Antares-Token"]
    $pagina = [int]($request.QueryString["pagina"]); $tamanho = [int]($request.QueryString["tamanho"])
    if ($tamanho -lt 1 -or $tamanho -gt 500) { $tamanho = 100 }
    $status = 200
    if (-not $token) { $status = 400; $texto = '{"erro":"Falta o token (header X-Antares-Token)."}' }
    else {
      try {
        $r = Invoke-WebRequest -UseBasicParsing -Uri "https://antares-revolution-dev.dataprom.com/api/monitoramentos/v1/dispositivos-eventos?pagina=$pagina&tamanho=$tamanho" -Headers @{ accept = "application/json"; authorization = "Bearer $token"; "x-tenant-id" = "682a03a0-cf99-48d1-b9c1-8778757c9a0c" }
        $texto = [System.Text.Encoding]::UTF8.GetString($r.RawContentStream.ToArray())
      } catch {
        $status = 502
        if ($_.Exception.Response) { $status = [int]$_.Exception.Response.StatusCode }
        $texto = '{"erro":"A API do Antares respondeu ' + $status + '."}'
      }
    }
    $bytes = [System.Text.Encoding]::UTF8.GetBytes($texto)
    $response.StatusCode = $status
    $response.ContentType = "application/json; charset=utf-8"
    $response.ContentLength64 = $bytes.Length
    $response.OutputStream.Write($bytes, 0, $bytes.Length)
    $response.OutputStream.Close()
    continue
  }

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
