# 生成自签名代码签名证书并导出为 .pfx
# 在 Windows 上以管理员身份运行 PowerShell 执行此脚本
# 用法: .\gen-cert.ps1 -Password "你的密码"

param(
    [Parameter(Mandatory=$true)]
    [string]$Password
)

$Subject     = "CN=Maserati, O=Maserati App, C=CN"
$FriendlyName = "Maserati Code Signing"
$OutFile     = Join-Path $PSScriptRoot "cert.pfx"

Write-Host "[cert] 生成自签名证书..."

$cert = New-SelfSignedCertificate `
    -Type Custom `
    -Subject $Subject `
    -KeyUsage DigitalSignature `
    -FriendlyName $FriendlyName `
    -CertStoreLocation "Cert:\CurrentUser\My" `
    -TextExtension @(
        "2.5.29.37={text}1.3.6.1.5.5.7.3.3",
        "2.5.29.19={text}"
    ) `
    -NotAfter (Get-Date).AddYears(10)

$securePassword = ConvertTo-SecureString -String $Password -Force -AsPlainText

Export-PfxCertificate `
    -Cert "Cert:\CurrentUser\My\$($cert.Thumbprint)" `
    -FilePath $OutFile `
    -Password $securePassword

Write-Host "[cert] 证书已生成: $OutFile"
Write-Host "[cert] 指纹: $($cert.Thumbprint)"
Write-Host ""
Write-Host "下一步: 在 package.json 的 build.win 中配置:"
Write-Host "  CSC_LINK=./win/cert.pfx"
Write-Host "  CSC_KEY_PASSWORD=你的密码"
