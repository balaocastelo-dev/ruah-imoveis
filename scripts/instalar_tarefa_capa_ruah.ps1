# Blog da RUAH ("Sopro") - tarefa da FOTO DE CAPA (pasta \RUAH\). Criado pelo Claude em 26/10/2026.
# Roda o scripts\capa_blog_ruah.py do Sistema RUAH, que usa o gerador do Balao
# (C:\Users\user\balao-content-factory\publisher\capa_blog.py) na RTX 4090.
# Horarios fora das rodadas do Balao (22h00 e 5h30): 22h40 e 4h40. A rotina escreve
# as 19h e agenda os artigos para 6h, 12h e 18h do dia seguinte.
# Para desligar:  Disable-ScheduledTask -TaskPath '\RUAH\' -TaskName 'Capa do blog RUAH'
# Para remover:   Unregister-ScheduledTask -TaskPath '\RUAH\' -TaskName 'Capa do blog RUAH' -Confirm:$false
$ErrorActionPreference = 'Stop'
$PYW = 'C:\Users\user\AppData\Local\Programs\Python\Python313\pythonw.exe'
$WD = Join-Path $PSScriptRoot ''
$pasta = '\RUAH\'
$user = "$env:USERDOMAIN\$env:USERNAME"
$principal = New-ScheduledTaskPrincipal -UserId $user -LogonType Interactive -RunLevel Limited
$gatilhos = '22:40', '04:40' | ForEach-Object { New-ScheduledTaskTrigger -Daily -At $_ }
$act = New-ScheduledTaskAction -Execute $PYW -Argument 'capa_blog_ruah.py' -WorkingDirectory $WD
$set = New-ScheduledTaskSettingsSet -StartWhenAvailable -AllowStartIfOnBatteries -DontStopIfGoingOnBatteries `
    -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 150)
Register-ScheduledTask -TaskName 'Capa do blog RUAH' -TaskPath $pasta -Action $act -Trigger $gatilhos -Settings $set `
    -Principal $principal -Description 'Blog da RUAH - foto de capa (Flux local + conferencia do Ollama), via gerador do Balao' -Force | Out-Null
Get-ScheduledTask -TaskPath $pasta -TaskName 'Capa do blog RUAH' | ForEach-Object { "{0,-18} {1}  proxima: {2}" -f $_.TaskName, $_.State, (Get-ScheduledTaskInfo $_).NextRunTime }
