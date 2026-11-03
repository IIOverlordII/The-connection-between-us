# Собирает "Психопрофиль.exe" (один файл) в папке dist\.
# Нужен Python 3.10+; зависимости ставятся в desktop\.venv.
$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$venv = Join-Path $PSScriptRoot '.venv'

if (-not (Test-Path (Join-Path $venv 'Scripts\python.exe'))) {
    python -m venv $venv
}
$py = Join-Path $venv 'Scripts\python.exe'
& $py -m pip install --quiet --upgrade pip
& $py -m pip install --quiet pywebview pyinstaller

python (Join-Path $root 'tools\build.py')
if ($LASTEXITCODE -ne 0) { throw 'tools\build.py завершился с ошибкой' }

& $py -m PyInstaller --noconfirm --clean --onefile --windowed `
    --name 'Психопрофиль' `
    --icon (Join-Path $root 'desktop\icon.ico') `
    --add-data "$(Join-Path $root 'app');app" `
    --distpath (Join-Path $root 'dist') `
    --workpath (Join-Path $PSScriptRoot 'build') `
    --specpath (Join-Path $PSScriptRoot 'build') `
    (Join-Path $PSScriptRoot 'main.py')
if ($LASTEXITCODE -ne 0) { throw 'PyInstaller завершился с ошибкой' }
Write-Host "Готово: $(Join-Path $root 'dist\Психопрофиль.exe')"
