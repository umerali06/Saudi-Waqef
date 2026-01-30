param(
  [Parameter(Mandatory = $true)][string]$ExportPath,
  [string]$ProjectId = $env:FIREBASE_PROJECT_ID
)

if (-not $ProjectId) {
  Write-Error "FIREBASE_PROJECT_ID is required."
  exit 1
}

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) {
  Write-Error "gcloud CLI is required to import Firestore. Install Google Cloud SDK first."
  exit 1
}

Write-Host "Starting Firestore import from $ExportPath"
& gcloud firestore import $ExportPath --project $ProjectId
if ($LASTEXITCODE -ne 0) {
  Write-Error "Firestore import failed."
  exit $LASTEXITCODE
}

Write-Host "Firestore import completed."
