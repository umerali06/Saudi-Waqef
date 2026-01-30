param(
  [string]$ProjectId = $env:FIREBASE_PROJECT_ID,
  [string]$Bucket = $env:FIRESTORE_BACKUP_BUCKET
)

if (-not $ProjectId) {
  Write-Error "FIREBASE_PROJECT_ID is required."
  exit 1
}

if (-not $Bucket) {
  Write-Error "FIRESTORE_BACKUP_BUCKET is required."
  exit 1
}

$gcloud = Get-Command gcloud -ErrorAction SilentlyContinue
if (-not $gcloud) {
  Write-Error "gcloud CLI is required to export Firestore. Install Google Cloud SDK first."
  exit 1
}

$timestamp = Get-Date -Format "yyyyMMdd-HHmmss"
$destination = "gs://$Bucket/firestore/$ProjectId/$timestamp"

Write-Host "Starting Firestore export to $destination"
& gcloud firestore export $destination --project $ProjectId
if ($LASTEXITCODE -ne 0) {
  Write-Error "Firestore export failed."
  exit $LASTEXITCODE
}

Write-Host "Firestore export completed."
