# Backup & Restore

## Firestore Backups
- Daily export to a GCS bucket.
- Retention: 30 daily backups + 12 monthly snapshots.

### Export (PowerShell)
```powershell
./scripts/ops/backup-firestore.ps1 -ProjectId YOUR_PROJECT -Bucket YOUR_BUCKET
```

### Restore (PowerShell)
```powershell
./scripts/ops/restore-firestore.ps1 -ExportPath gs://YOUR_BUCKET/firestore/YOUR_PROJECT/TIMESTAMP
```

## Cloudinary Assets
- Configure Cloudinary backup policy in the Cloudinary console.
- For critical documents, store a copy in Firestore or GCS.

## Restore Test
- Perform a restore in a staging project at least quarterly.
