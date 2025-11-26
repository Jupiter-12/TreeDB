param(
    [string]$Python = "python",
    [string]$DbPath = "C:\Users\T490\OneDrive\Database\treedb\test.db",
    [string]$Port = "3100",
    [string]$TableName = "tool",
    [string]$IdField = "id",
    [string]$ParentField = "parent_id",
    [switch]$AutoBootstrap = $false
)

$env:DB_PATH = $DbPath
$env:TABLE_NAME = $TableName
$env:ID_FIELD = $IdField
$env:PARENT_FIELD = $ParentField
$env:AUTO_BOOTSTRAP = if ($AutoBootstrap) { 'true' } else { 'false' }
$env:PORT = $Port

& $Python "server.py"
